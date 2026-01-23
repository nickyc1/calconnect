# MirCal - Specification Change: Multiple Source Accounts

**Date:** 2024-12-22
**Status:** CRITICAL SPEC CHANGE
**Priority:** P0 - Requires immediate implementation planning

---

## Overview

**CRITICAL CHANGE:** System must support **multiple source accounts per user** instead of the current single source account limitation.

This is a fundamental architectural change that affects database schema, UI, API endpoints, and event mirroring logic.

---

## Current Implementation (DEPRECATED)

**Single Source Model:**
- User can designate **ONE** account as source
- All other accounts are destinations
- `user_accounts.is_source_account` column with unique constraint
- "Set as Source" button to designate the single source
- Events mirror: 1 source → N destinations

**Database Constraint:**
```sql
-- Current (REMOVE THIS):
CREATE UNIQUE INDEX idx_user_accounts_source_unique
ON user_accounts(user_id)
WHERE is_source_account = true;
```

---

## New Specification

### Core Requirement

**Multiple Source Model:**
- User can designate **MULTIPLE** accounts as sources
- Events from ANY source account mirror to ALL other accounts
- **Exception:** Events do NOT mirror back to the account they originated from
- No fine-grained control (all sources → all non-source accounts)

### Example Scenario

**User has 3 accounts:**
1. `work@company.com` (source)
2. `personal@gmail.com` (source)
3. `family@shared.com` (destination only)

**Mirroring Behavior:**
- Event created in `work@company.com` → mirrors to `personal@gmail.com` AND `family@shared.com`
- Event created in `personal@gmail.com` → mirrors to `work@company.com` AND `family@shared.com`
- Event created in `family@shared.com` → NO mirrors (not a source)

**Key Rule:** Events never mirror back to originating account

---

## Implementation Changes Required

### 1. Database Schema Changes

**Migration 006: Enable Multiple Sources**

```sql
-- Drop unique constraint on is_source_account
DROP INDEX IF EXISTS idx_user_accounts_source_unique;

-- Column remains but constraint removed
-- user_accounts.is_source_account can now be true for multiple rows per user
```

**No new columns needed** - `is_source_account` BOOLEAN already supports this model

---

### 2. UI Changes

**Dashboard (app/dashboard/page.tsx):**

**Current UI:**
- Radio button selection (only one source)
- "Set as Source" button

**New UI:**
- **Checkbox for each account** - "Use as source calendar"
- Multiple accounts can be checked simultaneously
- Visual indicator: "SOURCE" badge on all source accounts
- Status shows: "N source calendar(s) mirroring to M destination calendar(s)"

**Example:**
```
Connected Accounts (3/3)
☑ work@company.com [SOURCE]
☑ personal@gmail.com [SOURCE]
☐ family@shared.com

Mirroring Status: Active
2 source calendars mirroring to 1 destination calendar
```

---

### 3. API Endpoint Changes

**Endpoint: POST /api/accounts/[id]/set-source**

**Rename to:** `POST /api/accounts/[id]/toggle-source`

**New Behavior:**
```typescript
// Toggle source status (checkbox model)
async function POST(req, { params }) {
  const accountId = params.id
  const { isSource } = await req.json() // true or false

  // No unique constraint check needed anymore
  await supabase
    .from('user_accounts')
    .update({ is_source_account: isSource })
    .eq('account_id', accountId)
    .eq('user_id', userId)

  // If toggling to true and mirroring active, deploy new sources
  if (isSource && hasActiveSources) {
    await deploySourcesForAccount(accountId)
  }

  // If toggling to false and mirroring active, remove sources
  if (!isSource && hasActiveSources) {
    await removeSourcesForAccount(accountId)
  }

  return { success: true }
}
```

---

### 4. Mirroring Logic Changes

**Current Logic:**
```typescript
// Get THE source account (singular)
const sourceAccount = await supabase
  .from('user_accounts')
  .select('*')
  .eq('is_source_account', true)
  .single() // ❌ Only one

// Get all destinations (everything except source)
const destAccounts = await supabase
  .from('user_accounts')
  .select('*')
  .eq('is_source_account', false)
```

**New Logic:**
```typescript
// Get ALL source accounts (plural)
const sourceAccounts = await supabase
  .from('user_accounts')
  .select('*')
  .eq('user_id', userId)
  .eq('is_source_account', true) // Can be multiple rows

// Get destinations for a specific source event
// = all accounts EXCEPT the one that originated the event
const destAccounts = await supabase
  .from('user_accounts')
  .select('*')
  .eq('user_id', userId)
  .eq('is_active', true)
  .neq('account_id', originatingAccountId) // Exclude origin

// Note: This includes OTHER sources as destinations
// Event from work@ can mirror to personal@ even if both are sources
```

---

### 5. Source Deployment Changes

**Endpoint: POST /api/mirroring/activate**

**Current:** Deploys 2 sources (instant + cancelled) for THE source account

**New:** Deploys 2 sources for EACH source account

```typescript
async function POST() {
  // Get ALL source accounts
  const sourceAccounts = await supabase
    .from('user_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_source_account', true)

  if (sourceAccounts.length === 0) {
    return { error: 'No source accounts selected' }
  }

  // Check at least one non-source account exists
  const otherAccounts = await supabase
    .from('user_accounts')
    .select('count')
    .eq('user_id', userId)
    .eq('is_source_account', false)

  if (otherAccounts.count === 0) {
    return { error: 'Need at least one destination account' }
  }

  // Deploy sources for EACH source account
  const deployments = []
  for (const sourceAccount of sourceAccounts) {
    const webhookUrl = buildWebhookUrl(userId, sourceAccount.account_id)

    // Deploy instant source
    const instant = await pipedream.deploySource(
      userId,
      sourceAccount.account_id,
      'primary',
      webhookUrl
    )

    // Deploy cancelled source
    const cancelled = await pipedream.deployCancelledEventSource(
      userId,
      sourceAccount.account_id,
      'primary',
      webhookUrl,
      300
    )

    deployments.push({ instant, cancelled, accountId: sourceAccount.account_id })
  }

  // Store ALL deployed sources
  const sourceRecords = deployments.flatMap(d => [
    {
      user_id: userId,
      account_id: d.accountId,
      source_id: d.instant.data.id,
      source_type: 'instant',
      ...
    },
    {
      user_id: userId,
      account_id: d.accountId,
      source_id: d.cancelled.data.id,
      source_type: 'cancelled',
      ...
    }
  ])

  await supabase.from('pipedream_sources').insert(sourceRecords)

  return { success: true, sourcesDeployed: deployments.length * 2 }
}
```

---

### 6. Webhook Handler Changes

**File:** `app/api/webhook/route.ts`

**Critical Change:** Exclude originating account from destinations

```typescript
export async function POST(req) {
  const { userId, accountId, calendarId } = query // accountId = where event came from
  const event = await req.json()

  // Get ALL accounts for user
  const allAccounts = await supabase
    .from('user_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  // Destinations = all accounts EXCEPT the originating one
  const destinationAccounts = allAccounts.filter(
    acc => acc.account_id !== accountId // ✅ Exclude origin
  )

  if (destinationAccounts.length === 0) {
    return NextResponse.json({
      message: 'No destination accounts (all mirrors would be to origin)',
      skipped: true
    })
  }

  // Process event (create/update/delete mirrors)
  await processEvent(event, userId, accountId, destinationAccounts)

  return NextResponse.json({ success: true })
}
```

---

### 7. UI Status Display Changes

**Current:**
```
Mirroring Status: Active
Events from work@company.com are being mirrored to 2 destination calendar(s).
```

**New:**
```
Mirroring Status: Active
2 source calendar(s) → 1 destination calendar(s)

Sources:
• work@company.com
• personal@gmail.com

Destinations:
• family@shared.com
```

Or simpler:
```
Mirroring Status: Active
Mirroring from 2 source(s) to 1 destination(s)
```

---

## Validation Requirements

After implementation, verify:

1. **Multiple sources can be enabled simultaneously**
   - User selects 2+ accounts as sources
   - All show SOURCE badge
   - All have sources deployed in `pipedream_sources`

2. **Events mirror correctly**
   - Create event in source 1 → mirrors to source 2 AND destinations
   - Create event in source 2 → mirrors to source 1 AND destinations
   - Create event in destination → NO mirrors created

3. **Events don't mirror to origin**
   - Event from work@ does NOT create mirror in work@
   - Only creates mirrors in personal@ and family@

4. **Activation works with multiple sources**
   - "Enable Mirroring" deploys 2 sources × N source accounts
   - Database has 2N rows in `pipedream_sources`

5. **Deactivation works**
   - "Disable Mirroring" removes all sources from Pipedream
   - Database rows deleted (not marked inactive per Bug #7)

6. **Toggle source while active**
   - If mirroring enabled, checking/unchecking source checkbox deploys/removes sources dynamically

---

## Future Enhancement (NOT Required Now)

**Fine-Grained Control:**
- Per-calendar source/destination mapping
- User specifies: "Mirror work@ to personal@ only"
- Requires UI for configuring mappings
- More complex database schema

**Client Notes:**
> Future functionality requirements will probably involve fine-grained control over which accounts are sources and which are destinations, but that can be addressed in a future version. If helpful to address now it can also be addressed now.

**Recommendation:** Implement current spec first (all sources → all destinations except origin), then add fine-grained control in v2 if needed.

---

## Implementation Checklist

**Phase 1: Database (Migration 006)**
- [ ] Drop unique index on `is_source_account`
- [ ] Add foreign key constraints (Bug #2)
- [ ] Remove `is_active` column from `pipedream_sources` (Bug #7)
- [ ] Remove redundant `external_user_id` column (Bug #5)
- [ ] Add RLS policies to `connect_tokens` (Bug #6)

**Phase 2: API Updates**
- [ ] Rename `/set-source` → `/toggle-source`
- [ ] Update activate endpoint to deploy multiple sources
- [ ] Update deactivate endpoint to delete rows instead of marking inactive
- [ ] Update webhook handler to exclude originating account

**Phase 3: UI Updates**
- [ ] Replace radio buttons with checkboxes
- [ ] Update status display for multiple sources
- [ ] Show list of source accounts
- [ ] Show list of destination accounts

**Phase 4: Testing**
- [ ] Test with 2 sources, 1 destination
- [ ] Test with 3 sources (all accounts as sources)
- [ ] Verify events don't mirror to origin
- [ ] Test toggling source status while mirroring active
- [ ] Test activation/deactivation with multiple sources

**Phase 5: Fix Critical Bugs**
- [ ] Fix recurring events (Bug #1) - CRITICAL
- [ ] Fix dashboard refresh loop (Bug #3)
- [ ] Implement remove account (Bug #4)

---

## Migration Priority

**CRITICAL:** This spec change must be implemented BEFORE fixing Bug #1 (recurring events), because the recurring event fix will need to work with the new multi-source model.

**Implementation Order:**
1. ✅ Create Migration 006 (database changes)
2. ✅ Update API endpoints (activate, toggle-source, webhook)
3. ✅ Update UI (checkboxes, status display)
4. ✅ Test multi-source functionality
5. ✅ Fix Bug #1 (recurring events) using new model
6. ✅ Fix remaining bugs

---

*Last updated: 2024-12-22*
