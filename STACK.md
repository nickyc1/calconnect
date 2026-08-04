# How CalConnect was built

I'm not a professional software engineer. I run marketing at AppSumo and consult on the side. CalConnect exists because I wanted a way to hide my personal calendar details from my work calendar without paying for a team seat of some enterprise tool, and I didn't want to learn a new framework from scratch to build it.

Everything you see in this repo was built by me directing AI coding agents. This doc is my attempt to be honest about what that actually looked like, what worked, what didn't, and the exact tools I used, in case anyone else wants to try the same approach.

## The tools

**Claude Code**, running in a terminal alongside my editor. This is the workhorse. Almost every commit in this repo was produced by me describing what I wanted in plain English, and Claude Code writing the diff, running commands, opening the browser to verify, and pushing.

The model matters. I mostly used Opus 4.7 for anything non-trivial. Sonnet is fine for small edits. Haiku is fast but tends to over-simplify architecture.

**Cursor**, when I wanted to read code without opening a terminal, or when I wanted a lower-latency inline edit.

**Vercel**, deploying on every push to main. This is the feedback loop: I ship, wait 90 seconds, refresh the browser, see if it worked. No staging environment. No PRs. If it breaks, I ship a fix in another 90 seconds.

**Supabase**, both the Postgres database and the auth layer. The SQL editor is right there in the browser so schema changes are one paste away.

**1Password CLI**, for pulling env vars into local shells without exposing them in the shell history. Every credential CalConnect touches lives in 1Password.

**GitHub**, obviously. I don't use PRs on this repo, just push to main. Would not recommend that pattern if you're on a team, but for a solo project shipping small commits fast, the branching overhead isn't worth it.

**Chrome DevTools console**, more than I expected. When something broke in production, the fastest debug loop was to paste a small `fetch(...)` script into DevTools while logged in as myself, watch what came back, then feed the result back to Claude Code as context.

## The process

The rhythm is:

1. I describe what I want to build, usually a few sentences.
2. Claude Code proposes a design, I push back if it's over-engineered.
3. Claude Code writes the code and commits it.
4. Vercel deploys.
5. I test it in the browser or via a DevTools script.
6. Screenshot goes back into the chat with what's wrong.
7. Loop until it works.

Every substantial feature in this repo (the AppSumo redeem flow, the encrypted refresh tokens, the multi-source cascade fix, the whole backfill flow) followed this loop.

The thing I underestimated at the start: how much of the work is describing what you want clearly, not writing code. When I'm sloppy about specifying what "cancel" should mean or which state should be the source of truth, the agent produces sloppy code. When I give it the failure scenario ("I clicked this and it did that instead of the expected thing"), it produces good fixes.

## Things I'd do differently

- Write integration tests earlier. The multi-source backfill cascade would have been caught in five minutes by a test that spun up three fake calendars and ran backfill on all of them. Instead it blew up in production on my own account and took several hours to unwind.

- Feature flag anything that touches destructive operations. My `user_billing.mirror_existing_beta` column exists because of the cascade. Should have been there from day one for anything that deletes.

- Take the security review pass seriously the first time. There is a `rafter-secure-design` skill I have configured that walks you through exactly the questions ("what if a delete fails halfway through", "what if two writers race") that would have caught the cascade before code was written. I skipped it. Won't skip it again.

- Don't remove a database row until the external side effect confirms. This one lesson is worth an entire doc on its own.

## Tech stack, opinionated

### Next.js 14 App Router

Fine. The serverless function model on Vercel is a great fit for a CRUD app like this. The App Router's file-based API routes made adding an endpoint a two-file diff. If I were doing it again I'd still pick it.

The 60-second serverless timeout was the single biggest constraint I hit. Anything that iterates over 1000+ external API calls has to be chunked and client-polled. The whole backfill design is shaped by this.

### Supabase

Excellent choice for a solo project. Postgres is Postgres, the auth layer is decent, RLS is powerful once you get past the syntax, and the free tier held up through the AppSumo launch.

The main gripe is that migrations don't run automatically on deploy. You edit a file, then paste it into the SQL editor by hand. Missable step.

### Google Calendar API

Push notifications via `events.watch` are the whole game. If you don't use them, you're polling, and polling doesn't scale past a few users. Watch channels expire after 7 days, so there's a cron that renews them. That's most of the moving parts.

The 2500 events per page limit on `events.list` shaped the preview endpoint design. The private `extendedProperties` field is how CalConnect tags its own events so it can distinguish them from real user events.

### Stripe

Live mode setup was the most stressful moment of the build. Test mode webhook secrets are different from live mode. Test mode price IDs are different from live mode. It's very easy to have half your env vars pointed at each and get a checkout that half-works.

Recommend building the whole checkout flow in test mode first, verifying the webhook path end to end, then flipping every env var to live in one deploy.

### AppSumo LTD flow

We're doing a Lifetime Deal launch on AppSumo. The `/redeem` page accepts a code, hits an admin endpoint that validates it against AppSumo's system, then flips the user to the lifetime plan. Codes are single-use. See `app/api/redeem/` for how it's wired up.

## What I spent

Not counting time:

- Vercel: $20/mo Pro plan.
- Supabase: free tier, will move to Pro when we outgrow it.
- Google Cloud: $0 in API costs so far, Google Calendar's free tier is generous.
- Stripe: standard 2.9% + 30 cents.
- Claude Code: usage-based, not going to say the number publicly but it's dramatically less than a contractor for the same output.

The single biggest cost was time spent yak-shaving on things AI still doesn't do well: OAuth verification submission, App Store style listing images, the delicate dance of Stripe test-to-live migration. Those still need a human.

## The one thing I want anyone reading this to take away

You don't need to be a "real developer" to build a real product. You need to be specific about what you want, honest about what's broken when you see it, and willing to describe both to an agent that can write code faster than you can type.

CalConnect took me about six weeks of nights and weekends to get from idea to AppSumo launch. I couldn't have done it three years ago. I could barely do it a year ago. Right now the tools are good enough that anyone motivated to ship something small and useful can, and that's the actual story worth telling.

Nick
