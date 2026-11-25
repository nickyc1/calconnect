# Billing and activation release

Release approved November 24, 2026. Migration 022 is applied in production. The
dedicated addon portal and production environment settings are saved. No live
customer subscription, invoice, refund, sender account, or customer email has
been changed. Eric's Basic and Pro subscriptions remain untouched.

## Release review

| Target | Proposed operation | Parameters / intended effect | Status |
| --- | --- | --- | --- |
| Supabase production | Apply migration 022 | Add durable billing locks/checkout attempts, lifetime entitlement flag, private activation/support/outbox tables, first-live-mirror trigger. Backfill milestone evidence only; no email enrollment. | Approved for release |
| Stripe Billing Portal | Verify configuration, stage any required changes | Allow existing Basic/Pro price changes and addon quantity changes; configure the intended proration policy. Existing-item confirmation must work before opening upgrades to customers. Do not create/cancel/refund subscriptions. | Approved and configured |
| Existing CalConnect deployment | Release exact reviewed commit after migration | Billing fixes, dashboard checklist, support queue, `/admin/activation`; set `CALCONNECT_ADMIN_EMAILS` to the owner's verified login email. Keep `LIFECYCLE_EMAIL_ENABLED=false`. | Approved for release |
| Email provider | Configure optional Resend transport | Verified sender, monitored reply-to, business postal address, API/signing secrets; verified webhook `/api/lifecycle/webhook` for bounced, complained, suppressed events. No credentials in source. | Provider configured and owner-tested; postal address pending |
| Lifecycle email delivery | Enable only after provider setup and recipient/copy review | Daily 14:00 UTC GET `/api/cron/lifecycle` with CRON_SECRET; maximum ten approved messages per run. Master delivery and automatic queueing switches remain off. | Disabled |
| Existing customers | Review enrollment individually | Explicit email opt-in required. Operator explicitly enrolls in the existing-customer sequence. Automatic queueing remains off pending launch; manual message review is available. | No customers enrolled |
| Eric's billing | No operation | No cancellation, refund, credit, subscription update, or customer merge. Existing duplicates return a support-review error. | Excluded |

## What changed

* Checkout reads all subscriptions. Nonterminal base plans go to the existing
  subscription's confirmation flow; two base subscriptions require human review.
  A portal error cannot fall back to new checkout. Extra calendars update an
  existing addon quantity when possible. Unsupported multi-item/status cases use
  Stripe's general billing portal rather than creating another subscription.
* A service-only database lock serializes billing requests. Durable checkout
  attempts provide Stripe idempotency keys and recover open sessions after DB
  save failure. Stale mappings and ambiguous old attempts fail closed. Only
  first-time base subscribers receive the trial.
* Webhooks compute access from current, paginated Stripe subscriptions, retaining
  the strongest valid plan and lifetime access. Deleting Basic cannot erase Pro.
  Database or Stripe failures return a retryable response. No bulk reconciliation
  or cleanup of existing subscriptions is performed by this release.
* Setup follows connected calendars, unexpired Source watches, reauthorization,
  first live mirror, and explicit visual confirmation. Historical backfill and
  empty recurring markers do not count as a first live mirror.
* Help requests record the customer's message and a minimal setup snapshot, not
  tokens or event contents. The admin queue shows the user's email and open
  requests. A monitored support inbox remains available by mail link. The queue
  must be checked by the operator; no support-notification email is sent yet.
* The connect button now respects the plan's actual allowance instead of a fixed
  five-account cap. The existing Google fonts are bundled with their OFL licenses
  because the installed Next font loader failed on Google's current CSS URLs.

## Email sequence and review operation

Product voice: Nick from CalConnect, signed Nick. All nine templates invite replies directly to Nick; the configured Reply-To remains his Gmail. Sender display name is applied in the review payload while preserving the configured sending address. Customer sending stays disabled. Copy updated to activation-v3 after reading both canonical Nick profiles.
Unchecked email opt-in is on the dashboard. New signups opting in within 14 days
can enter the new-user cohort. Older customers need operator enrollment after
opt-in. Known internal accounts/plus aliases are excluded at candidate creation.

| Sequence | Eligible timing | Purpose |
| --- | --- | --- |
| Welcome | First eligible review after new-user enrollment | Connect calendars and try one busy block |
| Next step | At least 24 hours after enrollment | Branch on zero/one calendar, missing Source, or test event |
| Help | At least 72 hours after enrollment | Offer setup assistance; replaces a missed next-step reminder |
| Success | Confirmed first busy block | Explain background operation and optional two-way mirroring; once |
| Existing 1 | Reviewed enrollment, incomplete setup | Resume the exact missing step |
| Existing 2 | At least 7 days after enrollment | Final reminder, then stop |

New setup reminders stop at 7 days. Existing reminders stop at 14 days. At most
one email per 24 hours, including success. An observed live mirror stops setup
reminders even before visual confirmation. Open support, reauthorization,
unsubscribe, suppression, lack of entitlement, and revoked lifetime codes pause
or exclude delivery. No email is based solely on absence of dashboard logins.

The daily lifecycle job runs at 14:00 UTC (8am Austin standard time / 9am daylight time).
`LIFECYCLE_EMAIL_ENABLED` is the master switch: unless exactly `true`, the job returns
before any database or provider access. `LIFECYCLE_AUTOMATION_ENABLED=true` additionally
allows automatic queueing of the approved template version for eligible, explicitly
opted-in and enrolled profiles. Both switches remain off by default; a configured
postal address and the other provider secrets are required before either path runs.
Existing customers still require explicit cohort enrollment; purchase is not consent.

Each run scans profiles in stable pages of 100, five accounts at a time, with a
20-second scan budget. It reports `scanComplete:false` if the budget is exhausted;
check this field before scaling enrollment and increase scan capacity or add a durable
cursor if it becomes false. It sends at most ten approved messages, stopping new sends
after 40 seconds to leave room for provider timeouts. At launch, review run receipts,
unknown/sending rows, and queue backlog daily. The daily schedule is suitable for the
initial small cohort; it does not promise immediate welcome delivery.

The worker holds a global run lock and per-user locks, never replaces sent or ambiguous
receipts, and rechecks eligibility and exact payload before sending. Changed or no-longer
eligible messages are skipped. The manual `/admin/activation` review flow remains
available when automation is disabled. Customer sending remains disabled after this release.

`scripts/test-lifecycle-owner.cjs` is an explicit operator-only E2E harness, never a web
route or scheduled command. It only targets Nick's verified Gmail account, uses a
synthetic welcome-stage scenario with real outbox records, provider transport, and the
live signed unsubscribe endpoint, and restores the account's email preference fields.
It never changes calendar connections or billing. Test receipts use `test:e2e-owner-v1:`
step names and cannot be sent through the normal internal-account-excluding worker.
The fixed marker prevents accidental repeat tests after provider acceptance or ambiguity.

Unknown provider responses and interrupted `sending` rows block further sends
for that user. Reconcile those rows with provider receipts manually; never reset
an ambiguous row blindly. Provider idempotency lasts only 24 hours. Bounce and
complaint callbacks are signature verified, and unsubscribe GET only renders a
confirmation; POST changes preferences and supports one-click unsubscribe.

## Validation

Use Node 22.23.x (the repository's engine requirement).

```
npm ci
npm test -- --runInBand
npm run test:db
npm run build
```

`test:db` runs migration 022 against an isolated PGlite database, not Supabase.
It verifies milestone exclusions, consent defaults, lock contention/expiry,
support-request deduplication, RLS, and restricted RPC access. Jest covers upgrade
routing, existing duplicates, idempotent recovery, failure behavior, aggregated
entitlements, sequence eligibility, unsubscribe integrity, disabled delivery, and
webhook authentication.

The real checklist component was exercised in headless Chrome with mocked APIs,
at 390px and 1100px. Verified connect action, unchecked default, opt-in, support
submission, hide/reopen, visual confirmation, no mobile overflow, and no browser
errors. This is not an authenticated end-to-end production test.

Before production enablement, verify a Stripe test-mode Basic→Pro confirmation,
same-plan request, addon increment, two concurrent checkout requests, canceled
checkout retry, and webhook replay with the actual portal configuration. This
requires approved test-account operations; no paid customer is a test fixture.
After deployment, verify authenticated onboarding/support in a designated test
user. Release email delivery separately with an explicitly approved internal
recipient, verified sender/webhook, and unsubscribe check.

## Operational limits / rollback

The migration is additive; apply it before deploying the code. Do not drop tables
while the new code is running. On rollback, turn email delivery off, stop its
schedule if one was added, and preserve outbox receipts. An old checkout route
reintroduces duplicate-subscription risk; prefer disabling checkout temporarily
over restoring the buggy route. Do not remove or reset a billing lock while its
request is still running. Ambiguous checkout attempts should be reconciled in
Stripe before clearing them.

Existing dependency warnings/audit findings were not upgraded as part of this
bounded change. Build output also includes existing dynamic-route prerender
messages and a Browserslist warning; they do not fail the build. No Rafter scan
was run because this was implementation work, not an explicit final public-launch
review request.

## November 24 release checks

Dedicated live addon configuration: `bpc_1UfRK4DYUaDN1g130wFvGAQJ`.
Only Extra Calendar quantity updates (1–50), no price switching, immediate
proration/invoicing. Stripe requires payment-method updates enabled. The default
Basic/Pro configuration was not modified. Production environment has
`STRIPE_ADDON_PORTAL_CONFIGURATION_ID` set to this configuration,
`LIFECYCLE_EMAIL_ENABLED=false`, and the verified owner login in
`CALCONNECT_ADMIN_EMAILS`. No email cron is configured.

39 Jest tests pass, including signed webhook replay/deduplication and failed
reconciliation retry. Production build passes on Node 22.23.0. Test-mode Stripe
accepted existing-item Basic-to-Pro and addon confirmation sessions; API-applied
updates retained subscription/item IDs with no duplicate. Concurrent idempotency
requests and open-session retry resolved to one Checkout session. These are API
checks, not a completed customer browser purchase; webhook replay uses mocked
storage and current subscriptions.

Disposable test customer/subscriptions were removed and Checkout expired. The
addon test configuration was deactivated. Stripe refused to deactivate the first
base test configuration because it became the test-mode default; it remains in
test mode only (`bpc_1UfRMwDHVuFynZ39BEG6yIeG`).

Production migration verification: five new tables have RLS, zero queued emails,
zero enrolled or opted-in profiles. Read-only comparison against the original
Stripe snapshot confirmed all live subscription statuses, item IDs, prices,
quantities and cancellation settings unchanged, including Eric.

## Existing active customer guidance (activation-v2)

Delivery remains disabled; no schedule, enrollment, or recipient approval is
created by this update. Help copy now asks whether the customer needs help;
success and engagement emails link with “Open your dashboard”.

Explicitly enrolled existing customers with email consent, a recorded live mirror,
a confirmed first busy block, and currently healthy connections can receive three
reviewed tips after the success email. Timing uses the later of enrollment and
confirmation: day 7 (Source direction), day 21 (schedule changes), day 45 (support
check-in). Missed windows are skipped; eligibility ends at day 60. Engagement
messages are at least seven days after any previous email. Existing suppression,
reauthorization, support, entitlement, verified-email and internal-account rules
still apply. This is a bounded tips series, not an indefinitely recurring campaign.

The admin enrollment label now describes existing-customer guidance, including
both unfinished setup and confirmed-active branches. No schema migration needed.
42 tests pass, including engagement timing, missed windows, consent, current setup
health, weekly spacing and CTA selection. No billing code or customer billing
records changed.

## Automatic queue and owner E2E validation

47 Jest tests and the production build pass. The owner-only welcome fixture
passed real queue deduplication, provider acceptance, replay protection, read-only
unsubscribe GET, and one-click unsubscribe POST. Original email preference values
were restored; no calendar or billing state changed. The scheduled worker remains
disabled in production until the postal address and customer activation are ready.
Earlier release-check sections above describe their historical release snapshots.
