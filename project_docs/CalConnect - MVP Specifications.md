# CalConnect - MVP Specifications

**Last Updated:** December 9, 2025
**Status:** In Development
**Deadline:** Friday (7 hours remaining)

---

## MVP Scope Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Supabase Auth (Google OAuth) | IN SCOPE | Required for multi-tenant |
| User Dashboard | IN SCOPE | Minimal UI |
| Connect 2+ Google Accounts | DONE | Working in PoC |
| 1 Calendar Mirroring per User | IN SCOPE | Limit enforced in code |
| Max 2 Destination Calendars | IN SCOPE | Limit enforced in code |
| Event Create/Update/Delete Sync | DONE | Working in PoC |
| `calendar_mirrorings` Table | OUT OF SCOPE | Use implicit model |
| Selective Destination Calendars | OUT OF SCOPE | Mirror to all non-source accounts |
| Complex RLS Policies | OUT OF SCOPE | Server-side auth sufficient |
| Detailed Error Tracking | OUT OF SCOPE | Basic logging only |

---

## IN SCOPE: What We're Building

### 1. Supabase Authentication

**Requirement:** Multi-tenant user authentication via Supabase Auth with Google OAuth provider.

**Implementation:**
- Enable Google OAuth in Supabase Auth settings
- Create/update user record on first login (upsert pattern)
- Pass authenticated `userId` to all API calls
- Add auth middleware to protected API routes

**Database Change:** None required - `users` table already exists with correct structure.

### 2. User Dashboard

**Requirement:** Simple dashboard showing connected accounts and mirroring status.

**UI Components:**
1. **Header:** User email + logout button
2. **Connected Accounts List:** Shows all connected Google Calendar accounts
3. **Source Selection:** Radio buttons to pick which account is the "source"
4. **Activate/Deactivate Button:** Deploy or remove Pipedream sources
5. **Status Indicator:** Shows if mirroring is active

**Routes:**
- `/` - Redirect to dashboard if authenticated, login if not
- `/dashboard` - Main dashboard (protected)
- `/login` - Login page (Supabase Auth UI)

### 3. MVP Limits Enforcement

**Requirement:** Enforce limits appropriate for MVP.

**Limits:**
- 1 calendar mirroring per user (1 source account)
- Max 2 destination accounts (total 3 connected accounts)

**Implementation:** Add checks in API routes before deploying sources.

### 4. Source Account Tracking

**Requirement:** Track which account is the source for mirroring.

**Database Change:** Add `is_source_account` column to `user_accounts` table.

```sql
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS is_source_account BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_source_unique
ON user_accounts(user_id)
WHERE is_source_account = true;
```

### 5. Duplicate Source Prevention

**Requirement:** Prevent deploying duplicate sources for the same account.

**Implementation:** Check for existing active sources before deploying.

---

## OUT OF SCOPE: Deferred to Post-MVP

### 1. `calendar_mirrorings` Table

**Original Spec:**
> Each `calendar_mirroring` should have fields: ID, User ID, Source Account ID, Source Calendar ID, Destination Calendars JSONB, Deployed Source IDs...

**Decision:** DEFER

**Rationale:** The current implicit model works for MVP:
- Source account = account with deployed sources
- Destinations = all other connected accounts
- No need for explicit `calendar_mirrorings` entity when we only support 1 mirroring per user

### 2. Selective Destination Calendars

**Original Spec:**
> Destination Calendars (jsonb): object representing destination calendar configurations...

**Decision:** DEFER

**Rationale:** For MVP, all non-source accounts are automatically destinations. Selective destination config adds complexity without value for initial release.

### 3. Complex RLS Policies

**Original Spec:**
> All tables should have appropriate RLS policies for Anon. User Access: All tables should have RLS policies to only view that users rows.

**Decision:** DEFER

**Rationale:**
- All database access goes through API routes
- API routes authenticate user before operating
- RLS is defense-in-depth, not primary security
- Server-side auth check is sufficient for MVP

### 4. Detailed Error Tracking

**Original Spec:**
> The `webhook_events` table should include a column to track errors during processing...

**Decision:** DEFER

**Rationale:** Basic console logging is sufficient for MVP debugging. Detailed error tracking (error messages, affected mirrors, sync status) adds complexity without immediate value.

### 5. Foreign Key Relationships

**Original Spec:**
> All tables with a `user_id` column should include foreign key relationships to the `users` table...

**Decision:** PARTIAL

**Rationale:** Current schema already has appropriate constraints. Additional FK enforcement is nice-to-have but not blocking.

---

## Database Schema (Current State)

The following tables exist and are working:

| Table | Purpose | Status |
|-------|---------|--------|
| `users` | User records | EXISTS (needs Auth integration) |
| `user_accounts` | Connected Google accounts | EXISTS (needs `is_source_account` column) |
| `pipedream_sources` | Deployed source tracking | EXISTS with `source_type` |
| `event_mappings` | Source event to mirror mappings | EXISTS |
| `webhook_events` | Webhook logging | EXISTS |
| `connect_tokens` | Temporary OAuth tokens | EXISTS |

### Required Migration (004)

```sql
-- Migration 004: MVP Enhancements
-- Adds is_source_account flag for source tracking

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS is_source_account BOOLEAN DEFAULT false;

-- Ensure only one source account per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_source_unique
ON user_accounts(user_id)
WHERE is_source_account = true;

-- Add user_id to webhook_events for debugging (optional)
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS user_id TEXT;
```

---

## API Endpoints (Current + New)

### Existing (Working)
- `POST /api/connect/token` - Generate Pipedream Connect token
- `POST /api/connect/callback` - Handle account connection webhook
- `POST /api/deploy-source` - Deploy Pipedream sources
- `POST /api/webhook` - Handle calendar event webhooks

### New (To Build)
- `GET /api/accounts` - List user's connected accounts
- `POST /api/accounts/:id/set-source` - Mark account as source
- `DELETE /api/accounts/:id` - Disconnect account
- `POST /api/mirroring/activate` - Deploy sources for source account
- `POST /api/mirroring/deactivate` - Remove deployed sources

---

## REST Actions for Calendar Mirroring

### CREATE (Activate Mirroring)

When user clicks "Activate Mirroring":
1. Verify user has 2+ connected accounts
2. Verify user has selected a source account
3. Check no existing active sources for this user
4. Deploy both instant + cancelled sources for source account
5. Mark account as `is_source_account = true`

### DELETE (Deactivate Mirroring)

When user clicks "Deactivate Mirroring":
1. Get all active sources for user
2. Delete sources from Pipedream
3. Mark sources as `is_active = false` in database
4. Set `is_source_account = false` on the account

**Note:** Per MVP approach, we do NOT delete mirror events from Google Calendar when deactivating. They remain as orphaned "Busy" events. Users can manually delete them if desired.

---

## Edge Cases

### Creating a Mirroring with Existing Events

**Approach for MVP:** Skip existing events.

When a calendar mirroring is activated:
- Only NEW events after activation will be mirrored
- Existing events are NOT retroactively mirrored
- This is documented behavior for MVP

**Future Enhancement:** Add option to sync existing events within a date range.

### Handling Notifications for Unmapped Events

If a webhook arrives for an event that's not in `event_mappings`:
- **Update notification:** Create mirror events (treat as new)
- **Delete notification:** Do nothing (no mirrors to delete)

This handles the case where events existed before mirroring was activated.

---

## Technical Constraints

### MVP Limits
- 1 calendar mirroring per user
- Max 2 destination calendars (3 total connected accounts)
- Primary calendar only (no secondary calendar selection)
- 5-minute polling interval for deletions

### Known Limitations
1. **Deletion Latency:** Deleted events detected via 5-minute polling
2. **Single Source:** Only one source calendar per user
3. **Primary Calendar:** Mirrors always go to primary calendar
4. **No Existing Events:** Only new events are mirrored

---

## Success Criteria

MVP is complete when:

- [ ] User can log in with Google account via Supabase Auth
- [ ] User can connect 2+ Google Calendar accounts
- [ ] User can select which account is the "source"
- [ ] User can activate mirroring (deploys sources)
- [ ] User can deactivate mirroring (removes sources)
- [ ] Events created in source calendar appear in destination calendars
- [ ] Events updated in source calendar update in destination calendars
- [ ] Events deleted in source calendar are removed from destination calendars
- [ ] Dashboard shows connected accounts and mirroring status
- [ ] System enforces 1 mirroring per user limit
- [ ] System enforces max 3 connected accounts limit
