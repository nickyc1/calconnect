# CalConnect

Mirror your busy blocks across Google Calendars without leaking event details.

Live at [calconnect.io](https://calconnect.io). Also on [AppSumo](https://appsumo.com/products/calconnect).

## What it does

Point CalConnect at a source calendar. Every event on that calendar gets mirrored to your other connected Google Calendars as a private "Busy" block. Your teammates, your family, your booking pages all see the block. They never see the title, the attendees, the notes, the meeting link.

- Real-time push sync via Google Calendar watch channels. New events show up on other calendars within seconds.
- Recurring events expand cleanly. Cancel one instance on the source and the mirror updates.
- Bidirectional. Any calendar can be a source, a destination, or both.
- Multi-source. Add up to 10 Google accounts on the Pro plan.
- Optional time and day windows. Only mirror between 9am and 5pm Monday to Friday, for example.
- Optional backfill. Import events already on your calendar with one click.

## Why it exists

Every existing "hide my calendar" tool either uploads your event data to a third party, exposes titles, or costs $10 to $20 per user per month for a team-wide feature you only need for one person.

CalConnect runs on push notifications from Google itself. The event never leaves Google's infrastructure except as a start time, an end time, and the label "Busy" on the destination calendar. Same visibility signal, none of the leakage.

## Tech stack

- **Next.js 14 (App Router) + TypeScript** for the app.
- **Supabase (Postgres + Auth)** for storage and user auth. Row-level security everywhere, refresh tokens encrypted with pgcrypto.
- **Google Calendar API** for reading events, creating mirror events, and receiving push notifications.
- **Stripe** for subscription billing and metered add-on calendars.
- **Vercel** for hosting and cron. All backend routes are serverless functions.
- **AppSumo** for the LTD launch, with a /redeem flow tied to a plan-upgrade webhook.

See [STACK.md](./STACK.md) for how it was built, the tools used, and the vibe-coding process behind it.

## Local setup

```bash
git clone https://github.com/nickyc1/calconnect.git
cd calconnect
npm install
cp .env.example .env.local
# fill in Supabase URL + keys, Google OAuth client, Stripe keys
npm run dev
```

The Supabase schema is in [supabase/migrations/](./supabase/migrations/). Run them in numeric order in the Supabase SQL editor.

You will also need:

- A Google Cloud Console project with the Calendar API enabled and an OAuth 2.0 client (Web application, with your dev URL in Authorized redirect URIs).
- A Stripe account in test mode with two subscription products (Basic and Pro) and a per-calendar add-on price.
- A Supabase project. Free tier is fine for local dev.

## Repository layout

```
app/                      Next.js App Router pages and API routes
  api/mirroring/          Backfill, activate, disable endpoints
  api/webhook/            Google Calendar push notifications land here
  api/accounts/           Per-account config (color, label, mirror window)
  api/redeem/             AppSumo code redemption
  api/stripe/             Checkout + customer portal
  dashboard/              The main app UI
  onboarding/             New-user plan pick flow
  redeem/                 AppSumo code entry
lib/                      Shared server code
  calendar-sync.ts        The sync engine (create/update/delete mirrors)
  google-calendar.ts      Google Calendar API client
  google-auth.ts          OAuth token refresh + encryption
  mirror-window.ts        Time/day window overlap logic
supabase/migrations/      Schema migrations in order (001..020+)
```

## Contributing

Not currently accepting outside PRs, this is a solo project running in production with paying customers. If you spot a bug or want to suggest something, open an issue.

If you want to fork this to build your own calendar tool, go for it. MIT-licensed.

## License

MIT. See [LICENSE](./LICENSE).
