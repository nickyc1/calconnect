# CalConnect — Full Documentation

Last updated: 2026-07-22.

CalConnect mirrors busy blocks across multiple Google Calendars so a personal
event on one calendar automatically appears as `Busy` on all your others. This
document captures the complete system: architecture, data model, integrations,
deploy process, and every feature that shipped.

---

## 1. Product overview

- **Problem:** People have 2+ Google Calendars (work, personal, side project). Nobody sees the others, so double-bookings happen.
- **Solution:** Connect all your Google accounts once. CalConnect writes a `Busy` block on every *other* calendar whenever an event is added to a source calendar. Deletions and updates sync automatically. No event details leak between calendars — just the block.
- **Sold via:** direct signup at calconnect.io + AppSumo Radar lifetime deals.
- **Billing:** Stripe Managed Payments (Stripe is Merchant of Record). 7-day free trial on Basic/Pro plans, card required.

---

## 2. Tech stack

| Layer | Tech | Notes |
| --- | --- | --- |
| Framework | Next.js 14 (App Router) | Server components + route handlers, deployed on Vercel |
| Language | TypeScript 5.3 | Strict mode |
| Auth | Supabase Auth | Google OAuth + email/password |
| Database | Supabase Postgres | RLS enforced (migration 009) |
| Server-side Supabase | `@supabase/ssr` + `@supabase/supabase-js` | Cookie-based sessions |
| Calendar API | `googleapis` + `google-auth-library` | Google Calendar v3, push notifications |
| Billing | `stripe` (SDK) | Stripe Checkout + Billing Portal + Webhooks |
| Recurrence | `rrule` | RFC 5545 recurring event expansion |
| Hosting | Vercel | Auto-deploy on push to `main` |
| DNS | Cloudflare (points to Vercel) | `calconnect.io` apex + `www` |
| Domain | calconnect.io | Owned by RAX Digital LLC |

Dependencies live in [package.json](package.json).

---

## 3. Directory map

```
calconnect/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Marketing landing (V5 design)
│   ├── privacy/, terms/          # Legal pages
│   ├── login/                    # Login only (Google + email/password)
│   ├── signup/                   # Signup only (Google + email/password)
│   ├── onboarding/               # Plan picker after signup
│   ├── redeem/                   # AppSumo code redemption (2-screen)
│   ├── dashboard/                # Signed-in home: accounts, mirroring, danger zone
│   ├── auth/
│   │   ├── callback/route.ts     # OAuth callback (Supabase session exchange)
│   │   └── signout/route.ts      # POST → 303 → /
│   └── api/
│       ├── account/delete/       # Full account teardown
│       ├── accounts/             # Connected Google accounts CRUD
│       ├── auth/google/          # Google OAuth start + connect (add another calendar)
│       ├── billing/              # Billing state fetch
│       ├── cron/renew-watches/   # Vercel Cron: refresh Google push subscriptions
│       ├── mirroring/            # Enable/disable mirroring engine
│       ├── redeem-code/          # Atomic AppSumo claim
│       ├── validate-code/        # AppSumo pre-check (no claim)
│       ├── sources/              # Toggle a source calendar
│       ├── stripe/
│       │   ├── checkout/         # Create Checkout Session (with trial)
│       │   ├── portal/           # Create Billing Portal session (cancel/manage)
│       │   └── webhook/          # Stripe → us: subscription state, invoices
│       └── webhook/              # Google Calendar push notifications
├── lib/
│   ├── supabase.ts               # supabaseAdmin (service-role) client
│   ├── supabase-server.ts        # createClient() cookie-based server client
│   ├── google-auth.ts            # OAuth token exchange + refresh
│   ├── google-calendar.ts        # Google Calendar API wrapper
│   ├── calendar-sync.ts          # Mirroring engine (event → busy blocks)
│   ├── recurring-events.ts       # RRULE expansion
│   ├── stripe.ts                 # Stripe client + STRIPE_PRICES lookup
│   └── types.ts                  # Shared TS types
├── utils/
│   ├── error-handler.ts          # Uniform error responses
│   ├── rate-limiter.ts           # In-memory rate limits (redeem endpoint uses this)
│   └── retry.ts                  # Exponential backoff helper
├── supabase/migrations/          # SQL migrations (see §7)
├── middleware.ts                 # Refresh Supabase session on each request
├── next.config.js
├── vercel.json                   # Cron schedules
└── project_docs/                 # Pre-existing product notes (untouched)
```

---

## 4. Architecture — how a mirror actually happens

```
[User adds event in Google Calendar]
        │
        ▼
[Google Calendar push notification]
   POST /api/webhook       ← "something changed on this channel"
        │
        ▼
[Look up channel_id → source_calendar_id → user_id]
        │
        ▼
[Fetch changed events from Google Calendar API using stored refresh token]
        │
        ▼
[lib/calendar-sync.ts]
   For each target calendar (all OTHER connected accounts for that user):
     - Upsert a "Busy" block matching the event's time window
     - Track mapping in `mirrored_events` (source_event → target_event)
     - On delete: delete the mirrored blocks
     - Recurring events: expand via rrule.ts, mirror each instance
        │
        ▼
[User sees "Busy" on all other calendars within seconds]
```

Push notifications require **channel renewal every 7 days**. That's what
`api/cron/renew-watches` does — Vercel Cron pings it daily, and it renews any
channel expiring within 24h.

---

## 5. Data model

All tables live in Supabase. RLS is ON for every user-scoped table (migration
009). Service-role bypasses RLS from `lib/supabase.ts` for cron + webhooks.

### Core tables

| Table | Purpose |
| --- | --- |
| `accounts` | One row per connected Google account. Stores email, google_user_id, encrypted refresh_token, watch_channel_id, watch_expiration, is_source_account, needs_reauth flag. |
| `mirrored_events` | Maps a source event on account A → target block on account B. Used to update/delete the right blocks when source changes. |
| `mirroring_state` | Per-user on/off flag for mirroring engine. |
| `deletion_events` | Tombstones for deleted events, used to reconcile late-arriving webhook deliveries. |
| `user_billing` | Stripe state: `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan` (`free`/`basic`/`pro`/`lifetime`), `subscription_status` (`trialing`/`active`/`past_due`/`canceled`), `trial_end_at`, `current_period_end`, `extra_calendar_quantity`. |
| `appsumo_codes` | Hash-based AppSumo LTD codes. `code_hash` (sha256), `redeemed_by`, `redeemed_at`, `revoked_at`. Never stores plaintext. |
| `redemption_attempts` | Rate-limit failed AppSumo redemption attempts (5/hour). |

### Plan → limit mapping

Enforced in dashboard client + `api/accounts` server:

| Plan | Base calendars | Extra add-on price |
| --- | --- | --- |
| Free | 2 | n/a |
| Basic | 3 | $4/mo per extra |
| Pro | 10 | $4/mo per extra |
| Lifetime (AppSumo) | 2 hard cap | not upgradeable via add-on |

---

## 6. Third-party integrations

### Supabase (`xhydclanpxkkuzasxxua.supabase.co`)
- Auth (Google OAuth + email/password)
- Postgres (all app data)
- Service-role key used server-side only (never in browser)

### Google Cloud (project: OAuth consent screen)
- **OAuth client:** used for Google login + Calendar API
- **Sensitive scopes:** `calendar.readonly`, `calendar.events`
- **Verification status:** unverified as of 2026-07-22 (video pending, submission after)
- **Push notifications:** Calendar Watch API → `POST /api/webhook`

### Stripe (live mode as of 2026-07-22)
- **Products:** CalConnect Basic, CalConnect Pro, Extra Calendar
- **Prices:** 5 total (monthly/yearly for Basic/Pro + monthly for Extra Calendar)
- **Coupons:** `NICKFRIEND100` (100% off for gifting)
- **Webhook endpoint:** `https://www.calconnect.io/api/stripe/webhook` listening to 6 events (checkout completed, subscription created/updated/deleted, invoice payment succeeded/failed)
- **Billing Portal:** activated with cancel-at-period-end + plan switching + payment method update
- **Fallback portal link (support):** `https://billing.stripe.com/p/login/fZu3cv7CWdGbfig5jw2Ji00`

### Vercel
- **Project:** connected to `nickyc1/calconnect-backend` on `main`
- **Cron:** `renew-watches` daily (defined in `vercel.json`)
- **Env vars:** ~15 (see §8)

---

## 7. Migrations history

Every schema change is a numbered SQL file in `supabase/migrations/`. Run in Supabase SQL editor in order.

| # | What it does |
| --- | --- |
| 001 | Initial schema: `accounts`, `mirrored_events`, `mirroring_state` |
| 002 | Google Calendar watch channel columns on `accounts` |
| 003 | `is_source_account` boolean |
| 004–006 | Iterative MVP schema cleanups + multi-source support |
| 007 | Recurring event support (`recurrence`, `recurring_event_id`, `original_start_time`) |
| 008 | Direct Google auth (drop Supabase-provided Google tokens, store our own) |
| 009 | Lock down RLS on every user-scoped table |
| 010 | `deletion_events` for late-arriving webhook reconciliation |
| 011 | `needs_reauth` flag on accounts (invalid_grant detection) |
| 012 | Stripe entitlements: `user_billing` table + subscription state |
| 013 | AppSumo redemption: `appsumo_codes` + `redemption_attempts` |
| 014 | Drop broken `create_billing_on_signup` trigger (was rolling back new signups) |

---

## 8. Environment variables

Set in Vercel → Project → Settings → Environment Variables (all `Production and Preview` unless noted).

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)

### Google
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = `https://www.calconnect.io/api/auth/google/callback`
- `GOOGLE_WEBHOOK_URL` = `https://www.calconnect.io/api/webhook`

### Stripe (live values as of 2026-07-22)
- `STRIPE_SECRET_KEY` = `sk_live_...`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
- `STRIPE_WEBHOOK_SECRET` = `whsec_...` (endpoint `we_1Tvmn0DYUaDN1g13AXL9BTjR`)
- `STRIPE_BASIC_MONTHLY_PRICE_ID`
- `STRIPE_BASIC_YEARLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_EXTRA_CALENDAR_PRICE_ID`

### App
- `NEXT_PUBLIC_APP_URL` = `https://www.calconnect.io`
- `CRON_SECRET` (guards `/api/cron/*` from unauthorized calls)

All live values are in 1Password: **CalConnect Stripe Live Keys (Production)**.

---

## 9. Feature ledger (what shipped, in the order it shipped)

### Marketing site
- Landing page V5 (product hero, warm indie tool aesthetic)
- Privacy Policy, Terms of Service, footer links
- Favicon + 120×120 app logo matching V5 wordmark
- next/font (Inter + Fraunces) — no @import (avoids FOIT)

### Auth
- Supabase Google OAuth + email/password
- Google warning pre-screen interstitial (explains unverified app screen)
- Split /signup and /login (previously one page for both)
- Sign out redirects to `/` via 303 (fixes 405 caused by 307 preserving POST → /login)
- Login page uses prefix-match whitelist for `?next=`, blocks open-redirect

### Onboarding
- After signup, force plan pick at `/onboarding`
- Auto-redirect to dashboard if already on a paid plan

### Dashboard
- Connected accounts list (limit-gated by plan)
- Source toggle with custom hover tooltip
- Mirroring engine on/off
- Trial badge showing days remaining
- Paywall modal when trying to connect past plan limit
- Reconnect banner (detects `invalid_grant`, flags account, prompts reconnect)
- Delete my account (rafter-guided: stops watches, revokes tokens, tombstones data, cascades)
- Cancel my subscription (opens Stripe Billing Portal)

### Mirroring engine (`lib/calendar-sync.ts`)
- Push-notification driven (not polling)
- Recurring event expansion via `rrule`
- Deletion reconciliation via `deletion_events`
- Daily cron renews watch channels within 24h of expiry

### Billing (Stripe)
- Checkout for Basic/Pro monthly and yearly, with 7-day trial (`trial_period_days: 7`)
- Extra Calendar add-on (quantity-based)
- Webhook handles 6 events (checkout, subscription lifecycle, invoice payments)
- Reads `current_period_end` from `subscription.items` (Stripe API 2024-06-20+ moved it)
- Billing Portal for self-service cancel + plan switch + card update

### AppSumo LTD redemption
- CSV code upload (SHA-256 hashed at rest, plaintext never persisted)
- Two-screen `/redeem` flow: enter code → create account → auto-claim
- localStorage fallback preserves code across OAuth roundtrip
- Atomic single-transaction UPDATE claim (`WHERE redeemed_by IS NULL AND revoked_at IS NULL`) prevents double-claim under race
- Rate limit: 5 failed attempts per hour per IP
- Uniform error copy so attackers can't probe for valid codes
- Blocks redemption when user has an active paid subscription (new-account-only rule)

---

## 10. Deploy runbook

```bash
cd /tmp/calconnect-backend
git add <files>
git commit -m "..."
git push
```

Vercel auto-deploys `main` in ~90 seconds. Watch progress at
https://vercel.com/nickyc1/calconnect-backend.

### Rollback

Vercel → Deployments → find last-good deploy → **⋯ → Promote to Production**.

### Env var changes

Vercel → Settings → Environment Variables → edit → **redeploy** (env vars only
take effect after a new build).

---

## 11. Ops runbook — common tasks

### Give someone a free lifetime code
Stripe → Product catalog → Coupons → `NICKFRIEND100` (100% off, forever). Send
them the Basic monthly or Pro monthly checkout link with the coupon field.

### Refund a customer
Stripe dashboard → find charge → Refund. Then in Supabase:
```sql
update user_billing
set subscription_plan = 'free', subscription_status = 'canceled'
where user_id = '<uuid>';
```

### Debug a broken webhook
- Stripe → Workbench → Webhooks → CalConnect production webhook → Event deliveries → click a red one for the request/response
- Vercel → Logs → filter by `/api/stripe/webhook`

### Nuke a test user for retest
```sql
delete from auth.users where email = '<email>' and email != 'nick@raxdigital.com';
```
(cascades to `accounts`, `user_billing`, `mirrored_events`, etc.)

### Reset an AppSumo code so it can be re-redeemed
```sql
update appsumo_codes
set redeemed_by = null, redeemed_at = null
where code_hash = encode(digest(upper('<code>'), 'sha256'), 'hex');
```

---

## 12. Known limitations / open work

- **Google OAuth verification:** unverified until submitted. Users see "Google hasn't verified this app" until then. Interstitial explains this.
- **Refresh token encryption at rest:** rafter-flagged critical. Tokens are stored in Supabase as-is right now. Encrypt with `pgcrypto` + a KMS-managed key.
- **Support inbox:** not wired up. Emails to `support@calconnect.io` currently bounce or 404.
- **Password reset flow:** Supabase's default reset email works, but the UI to trigger it isn't wired into `/login`.
- **Real-time mirroring latency:** ~2-8 seconds from source event → mirrored blocks. Acceptable but not instant.

---

## 13. Related docs

- Original product notes: [`project_docs/`](project_docs/) (untouched, pre-CalConnect era)
- Landing page origin story: see marketing site copy on [/](https://www.calconnect.io/)
- rafter security reviews: run `rafter run` from repo root for a fresh SAST + SCA + secrets sweep
