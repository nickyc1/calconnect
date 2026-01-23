# MirCal Backend - Project Summary

**Last Updated:** November 18, 2024
**Status:** POC Development Phase

## Overview

Multi-tenant calendar mirroring service that creates privacy-preserving "Busy" events in destination calendars when events are added to source calendars.

## Current Implementation Status

### ✅ Completed

- [x] **Infrastructure Setup**
  - Next.js 14 project with TypeScript
  - Pipedream SDK wrapper (`lib/pipedream.ts`)
  - Supabase client (`lib/supabase.ts`)
  - Environment configuration

- [x] **Database Schema**
  - Migrated to numbered migrations system
  - `001_initial_schema.sql` - Baseline schema
  - `002_webhook_connect_flow.sql` - Webhook flow updates
  - Tables: `connect_tokens`, `user_accounts`, `pipedream_sources`, `event_mappings`, `webhook_events`

- [x] **Pipedream Connect Integration**
  - Connect token generation with webhook URI
  - Webhook-based account connection (no manual Account ID copying)
  - Multi-account support architecture

- [x] **API Endpoints**
  - `POST /api/connect/token` - Generate Connect tokens
  - `POST /api/connect/callback` - Webhook for account connections
  - `POST /api/deploy-source` - Deploy calendar sources
  - `POST /api/webhook` - Receive calendar events (partial)

- [x] **Test Interface**
  - `/test` route for POC testing
  - Step-by-step test flow
  - Server log integration

- [x] **Documentation**
  - Organized docs folder
  - Database migration guide
  - Setup instructions
  - SDK corrections documented

### 🚧 In Progress

- [ ] **Event Mirroring Logic**
  - `lib/calendar-sync.ts` created but not fully implemented
  - Need to complete `createMirrorEvents` function
  - Need to add event update/deletion handling

### 📋 Pending

- [ ] **Error Handling**
  - Retry logic with exponential backoff
  - Centralized error handler
  - Webhook error notifications

- [ ] **Testing**
  - Unit tests for core functions
  - Integration tests for API endpoints
  - End-to-end POC testing

- [ ] **Deployment**
  - Production environment setup
  - Monitoring and logging
  - Error tracking

## Technology Stack

### Core
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Pipedream SDK v2.2.0** - Connect API & OAuth management
- **Supabase** - PostgreSQL database

### Key Features
- Server-side rendering (SSR)
- API routes for backend logic
- Type-safe database operations
- Webhook-based account connections
- Multi-tenant architecture

## Project Structure

```
mircal_backend/
├── app/
│   ├── api/
│   │   ├── connect/
│   │   │   ├── token/route.ts      # Generate Connect tokens
│   │   │   └── callback/route.ts   # Webhook for account connections
│   │   ├── deploy-source/route.ts  # Deploy Pipedream sources
│   │   └── webhook/route.ts        # Calendar event webhooks
│   └── test/page.tsx               # POC test interface
│
├── lib/
│   ├── pipedream.ts                # Pipedream SDK wrapper
│   ├── supabase.ts                 # Supabase client
│   ├── calendar-sync.ts            # Mirror event logic (in progress)
│   └── types.ts                    # TypeScript definitions
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql  # Baseline schema
│   │   └── 002_webhook_connect_flow.sql  # Webhook updates
│   ├── schema.sql                  # Current schema reference
│   └── README.md                   # Database setup guide
│
├── docs/
│   ├── PROJECT_SUMMARY.md          # This file
│   ├── SETUP.md                    # Setup instructions
│   ├── MIGRATION_GUIDE.md          # Database migration help
│   ├── SDK_CORRECTIONS.md          # Pipedream SDK fixes
│   ├── FIXES.md                    # Package installation fixes
│   └── MAINTENANCE.md              # Dependency maintenance
│
├── utils/
│   ├── retry.ts                    # Retry logic (created, not used)
│   └── error-handler.ts            # Error handling (created, not used)
│
├── .env.example                    # Environment variables template
├── package.json                    # Dependencies
└── README.md                       # Main documentation
```

## Key Architecture Decisions

### 1. Webhook-Based Account Connection

**Decision:** Use Pipedream Connect webhooks instead of manual Account ID entry

**Rationale:**
- Better user experience (no manual copying)
- Automatic account storage in database
- More reliable than user input

**Implementation:**
```typescript
// Store token → userId mapping
await supabaseAdmin.from('connect_tokens').insert({
  connect_token: result.token,
  user_id: userId,
  expires_at: result.expiresAt
});

// Webhook receives account details
// Lookup userId, store account, delete token
```

### 2. Numbered Migrations

**Decision:** Use numbered migration files instead of monolithic schema

**Rationale:**
- Version control for schema changes
- Easier to apply incremental updates
- Clear audit trail of database evolution

**Implementation:**
```
migrations/
  001_initial_schema.sql       # Baseline
  002_webhook_connect_flow.sql # Update
  003_future_feature.sql       # Future
```

### 3. Simplified POC Schema

**Decision:** Use TEXT for `user_id` instead of UUID with foreign keys

**Rationale:**
- POC doesn't need full user auth system
- Simpler for testing with external_user_id strings
- Can upgrade to UUID + auth in production

### 4. Service Role Key for Backend

**Decision:** Use `SUPABASE_SERVICE_ROLE_KEY` in backend, disable RLS

**Rationale:**
- POC bypasses Row Level Security for simplicity
- Backend has full database access
- Production will enable RLS with proper policies

## Environment Configuration

### Required Variables

```env
# Pipedream Connect
PIPEDREAM_CLIENT_ID=              # From Pipedream OAuth settings
PIPEDREAM_CLIENT_SECRET=          # From Pipedream OAuth settings
PIPEDREAM_PROJECT_ID=proj_xxx     # From Pipedream project
PIPEDREAM_ENVIRONMENT=development # or production

# Supabase
NEXT_PUBLIC_SUPABASE_URL=         # Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Public anon key
SUPABASE_SERVICE_ROLE_KEY=        # Backend service key

# Webhooks (Local Dev)
WEBHOOK_BASE_URL=                 # ngrok URL (https://xxx.ngrok-free.dev)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Local Development Setup

1. Install ngrok: `brew install ngrok`
2. Start ngrok: `ngrok http 3000`
3. Copy forwarding URL to `WEBHOOK_BASE_URL`
4. Restart dev server

## Testing the POC

### Manual Test Flow

1. **Start Services:**
   ```bash
   # Terminal 1: Start ngrok
   ngrok http 3000

   # Terminal 2: Start Next.js
   npm run dev
   ```

2. **Generate Token:**
   - Visit http://localhost:3000/test
   - Click "Generate Token"
   - Copy Connect URL

3. **Connect Account:**
   - Click Connect URL
   - Authorize Google Calendar
   - Webhook automatically saves account

4. **Deploy Source:**
   - Check server logs for Account ID
   - Or query Supabase: `SELECT * FROM user_accounts;`
   - Paste Account ID in test UI
   - Click "Deploy Source"

5. **Create Test Event:**
   - Create event in Google Calendar
   - Check server logs for webhook
   - Query `webhook_events` table

### Verification Queries

```sql
-- Check connected accounts
SELECT * FROM user_accounts WHERE user_id = 'test-user-123';

-- Check deployed sources
SELECT * FROM pipedream_sources;

-- Check webhook events
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;

-- Check event mappings
SELECT * FROM event_mappings;
```

## Known Issues & Limitations

### POC Limitations

1. **Single source per user** - Multi-source not yet implemented
2. **No event updates** - Only creation/deletion (not updates)
3. **No auth system** - Using hardcoded `test-user-123`
4. **ngrok required** - Webhooks need public URL
5. **Manual Account ID** - Still need to query database for deploy

### Technical Debt

1. **Event mirroring incomplete** - `calendar-sync.ts` not fully implemented
2. **No retry logic** - `utils/retry.ts` created but not integrated
3. **No error tracking** - `error-handler.ts` created but not used
4. **No tests** - `__tests__/` folder empty
5. **ESLint 8.x deprecated** - Needs update to v9 (waiting for Next.js)

## Next Steps

### Immediate (To Complete POC)

1. **Implement Event Mirroring:**
   - Complete `createMirrorEvents` in `calendar-sync.ts`
   - Integrate with webhook handler
   - Test end-to-end flow

2. **Add Error Handling:**
   - Integrate retry logic
   - Add error notifications
   - Log failures to database

3. **Test POC:**
   - Create test event → verify mirror created
   - Delete test event → verify mirror deleted
   - Multiple accounts → verify isolation

### Short-term (Production Prep)

1. **User Authentication:**
   - Add NextAuth or Supabase Auth
   - Update schema for real user IDs
   - Enable RLS policies

2. **Multi-source Support:**
   - Allow users to configure which calendar is source
   - Deploy multiple sources per user
   - Update UI for source selection

3. **Monitoring:**
   - Add Sentry or similar for error tracking
   - Log webhook failures
   - Alert on source deployment failures

### Long-term (v2 Features)

1. **Event Updates:**
   - Handle event modifications
   - Propagate changes to mirrors
   - Detect and resolve conflicts

2. **Advanced Features:**
   - Custom mirror event titles
   - Selective mirroring (by calendar, by time, etc.)
   - Bidirectional sync (mirror edits back to source)

3. **Scale & Performance:**
   - Optimize database queries
   - Add caching layer
   - Batch webhook processing

## Resources

### Documentation
- [README.md](../README.md) - Main documentation
- [supabase/README.md](../supabase/README.md) - Database setup
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migration help

### External Docs
- [Next.js Docs](https://nextjs.org/docs)
- [Pipedream Connect Docs](https://pipedream.com/docs/connect)
- [Supabase Docs](https://supabase.com/docs)

### Related Projects
- `mircal_resources/` - Project planning & external docs
- `mircal_workflows/` - Deprecated workflow approach
- `pipedream_source_code/` - Reference implementation

## Contact & Support

**Project Repository:** git@github.com:mh550/mircal-backend.git
**Documentation:** See `docs/` folder
**Issues:** Check `docs/FIXES.md` and `docs/MAINTENANCE.md`
