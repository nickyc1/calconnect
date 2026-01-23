# MirCal MVP - Validation Checklist

**Last Updated:** 2024-12-22
**Status:** Validation Complete - Critical Bugs Found

## Overview
This document tracks validation of key specifications and constraints for the MVP. Items are marked as validated once tested and confirmed working.

## ⚠️ CRITICAL SPECIFICATION CHANGE (2024-12-22)

**Client has changed core requirement:**
- **OLD:** Single source account per user
- **NEW:** Multiple source accounts per user
- **Impact:** Affects database, UI, API endpoints, and mirroring logic
- **See:** `MirCal - Specification Change - Multiple Sources.md` for full details
- **Status:** Must be implemented before production

## ⚠️ CRITICAL BUGS DISCOVERED (2024-12-22)

**Bug #1: Recurring Events Not Mirrored** (P0 - CRITICAL)
- Only base recurring event mirrored, individual instances not created
- Blocks production release
- See `MirCal - Bug Tracker.md` for full details

**Bug #3: Dashboard Refresh Loop** (P1 - HIGH)
- Continuous API polling when connecting account
- UX issue affecting all users

**Full bug list:** See `MirCal - Bug Tracker.md` (8 bugs total)

---

## 1. Authentication & User Management

| Specification | Status | Notes |
|--------------|--------|-------|
| Google OAuth login works | ✅ VALIDATED | User can sign in with Google |
| User created in `auth.users` | ✅ VALIDATED | Supabase Auth handles this |
| User created in `public.users` | ✅ VALIDATED | Migration 005 + callback update |
| User email persisted correctly | ✅ VALIDATED | Verified in database |
| Sign out works | ⏳ PENDING | Need to test |
| Protected routes redirect to login | ✅ VALIDATED | Middleware working |

---

## 2. Pipedream Connect Integration

| Specification | Status | Notes |
|--------------|--------|-------|
| **External User ID Strategy** | ✅ CONFIRMED | Using `auth.users.id` (UUID) |
| External user provisioned lazily | ✅ VALIDATED | Created when first Connect token generated |
| Connect token generation works | ✅ VALIDATED | Popup opens correctly |
| Webhook callback receives account | ⏳ PENDING | Need to verify webhook receives account data |
| Account stored in `user_accounts` | ✅ VALIDATED | Accounts persist across sessions |
| Max 3 accounts enforced | ⏳ PENDING | Need to test limit |

**Key Decision:** Use `auth.users.id` as Pipedream `external_user_id`
- ✅ Immutable (doesn't change)
- ✅ Unique (guaranteed by Supabase)
- ✅ Already available at token generation time
- ❌ Email can change, not suitable for external ID

---

## 3. Calendar Account Management

| Specification | Status | Notes |
|--------------|--------|-------|
| Connect first calendar account | ✅ VALIDATED | Works via Pipedream Connect |
| Connect second calendar account | ✅ VALIDATED | Persisted correctly |
| Connect third calendar account | ✅ VALIDATED | Three accounts connected |
| Cannot connect 4th account | ⏳ PENDING | Should show error message |
| Accounts shown on dashboard | ✅ VALIDATED | List displays correctly |
| Set source account | ✅ VALIDATED | Button works after Migration 005 |
| Source indicator shown | ✅ VALIDATED | "SOURCE" badge displays correctly |

---

## 4. Mirroring Activation

| Specification | Status | Notes |
|--------------|--------|-------|
| Cannot activate with <2 accounts | ⏳ PENDING | Should show error/disable button |
| Cannot activate without source | ⏳ PENDING | Should show error/disable button |
| Activate button deploys sources | ✅ VALIDATED | Both instant + cancelled sources deployed |
| Sources stored in database | ✅ VALIDATED | `pipedream_sources` table populated |
| Status changes to "Active" | ✅ VALIDATED | UI updates correctly |
| **Only 1 source per user** | ✅ VALIDATED | Database constraint enforced |
| Initial sync completes | ✅ VALIDATED | 14 existing events synced successfully |

---

## 5. Event Mirroring (Create)

| Specification | Status | Notes |
|--------------|--------|-------|
| Webhook received for new event | ✅ VALIDATED | Webhooks received with full event data |
| Source event fetched via API | ✅ VALIDATED | Event data in webhook payload |
| Mirrors created in destinations | ✅ VALIDATED | 14 mirrors created in initial sync |
| Mirror event properties correct | ✅ VALIDATED | "Busy", private, opaque verified |
| Extended properties stored | ✅ VALIDATED | Source event tracking working |
| Mapping stored in database | ✅ VALIDATED | All 14 events in event_mappings |
| Idempotency works | ⏳ PENDING | Not yet tested |
| **Recurring events mirrored** | ❌ **BUG #1** | Only base event mirrored, instances missing |

---

## 6. Event Mirroring (Delete)

| Specification | Status | Notes |
|--------------|--------|-------|
| Deletion detected (cancelled source) | ⏳ PENDING | 5-min polling source |
| Deletion detected (status=cancelled) | ⏳ PENDING | Instant source fallback |
| All mirrors deleted | ⏳ PENDING | From all destination accounts |
| Mapping removed from database | ⏳ PENDING | `event_mappings` cleanup |

---

## 7. Mirroring Deactivation

| Specification | Status | Notes |
|--------------|--------|-------|
| Deactivate button removes sources | ⏳ PENDING | Pipedream API calls |
| Sources marked inactive in DB | ⏳ PENDING | `is_active = false` |
| Source flag cleared | ⏳ PENDING | `is_source_account = false` |
| Status changes to "Inactive" | ⏳ PENDING | UI updates correctly |
| Can reactivate after deactivating | ⏳ PENDING | Full cycle test |

---

## 8. Error Handling

| Specification | Status | Notes |
|--------------|--------|-------|
| Network errors handled gracefully | ⏳ PENDING | No crashes, user-friendly messages |
| 404 on deleted events | ⏳ PENDING | Should handle gracefully |
| 429 rate limiting | ⏳ PENDING | Exponential backoff retry |
| Partial failures handled | ⏳ PENDING | Some mirrors succeed, some fail |

---

## 9. Data Integrity

| Specification | Status | Notes |
|--------------|--------|-------|
| No orphaned mirrors | ⏳ PENDING | All mirrors have valid source |
| No duplicate events | ⏳ PENDING | Webhook deduplication works |
| User isolation | ⏳ PENDING | Users can't see each other's data |

---

## 10. Future: Billing Integration (Out of Scope for MVP)

| Specification | Status | Notes |
|--------------|--------|-------|
| `is_paid` column added | ✅ DONE | Migration 005 |
| `stripe_customer_id` column added | ✅ DONE | Migration 005 |
| Stripe webhook endpoint | ❌ NOT STARTED | Post-MVP |
| Payment guard on Connect button | ❌ NOT STARTED | Post-MVP |

---

## Testing Strategy

### Priority 1: Critical Path (Test First)
1. ✅ Google OAuth login
2. ✅ Connect 3 calendar accounts
3. ✅ Set source account
4. ✅ Activate mirroring (14 events synced initially)
5. ✅ **COMPLETED:** Verified 14 mirrors exist in destination calendar
6. ✅ **COMPLETED:** Created recurring event → only base event mirrored (BUG #1)
7. ✅ **COMPLETED:** Deleted recurring instances → mappings not found (BUG #1)

### Priority 2: Error Cases
7. ⏳ Try to connect 4th account (should fail)
8. ⏳ Try to activate without source (should fail)
9. ⏳ Try to change source while active (should fail)

### Priority 3: Edge Cases
10. ⏳ Deactivate and reactivate mirroring
11. ⏳ Sign out and sign back in (persistence)
12. ⏳ Duplicate webhook handling

---

## Bug Tracker

### FIXED (2024-12-10)

**Bug #1: No `public.users` row created on login**
- **Problem:** User exists in `auth.users` but not in `public.users` table
- **Root Cause:** No code created user row on login
- **Fix:** Updated `app/auth/callback/route.ts` to upsert user on login
- **Validation:** ✅ Working - user row verified in database

**Bug #2: "Set as Source" button fails with updated_at error**
- **Problem:** Error `record "new" has no field "updated_at"` when clicking button
- **Root Cause:** Migration 002 added UPDATE trigger but never added `updated_at` column
- **Fix:** Migration 005 adds missing `updated_at TIMESTAMPTZ` column to `user_accounts`
- **Validation:** ✅ Working - button sets source, badge appears

**Migration 005 Details:**
- Added `updated_at` column to `user_accounts` (critical fix)
- Added `is_paid` and `stripe_customer_id` to `users` (future billing)
- All migrations idempotent with `IF NOT EXISTS` checks

### OPEN
None currently

### MONITORING
- Webhook response times (all <3s currently)
- Event mapping integrity (14/14 events synced successfully)

---

## Next Actions

**Validation Results (2024-12-22):**
1. ✅ Migration 005 executed successfully
2. ✅ "Set as Source" button working correctly
3. ✅ "Activate Mirroring" deployed sources successfully
4. ✅ Verified 14 mirrors exist in destination calendar with correct properties
5. ✅ Database validation queries confirm correct data
6. ❌ **CRITICAL BUG DISCOVERED:** Recurring events not mirroring correctly (Bug #1)

**Database Validation Results:**

**Sources Deployed:**
```json
[
  { "source_id": "dc_4Ou0xA0", "source_type": "instant", "is_active": true },
  { "source_id": "dc_0dukdq3", "source_type": "cancelled", "is_active": true }
]
```

**Event Mappings Created:**
```json
[
  { "source_event_id": "2rar3n1op00e4988nqmfdt01hk_20251224T180000Z", "mirror_count": 1 },
  { "source_event_id": "2rar3n1op00e4988nqmfdt01hk", "mirror_count": 1 },
  { "source_event_id": "3a6alb6sgj4fncip4ija7jvack", "mirror_count": 1 },
  { "source_event_id": "5pr74e2cgl2hk91algiuifilg9", "mirror_count": 1 },
  { "source_event_id": "tqauekf9am4svcm1nsq2h8p6l0", "mirror_count": 1 }
]
```

**Critical Findings:**
- ✅ Basic event mirroring works (14/14 events from initial sync)
- ✅ Mirror properties correct (summary="Busy", visibility="private")
- ❌ Recurring events only mirror base event, not instances
- ❌ Dashboard refresh loop when connecting account (Bug #3)

**Before Production:**
- [ ] Enable RLS policies
- [ ] Add rate limiting to API endpoints
- [ ] Set up monitoring/logging
- [ ] Add loading states to dashboard buttons
- [ ] Add confirmation dialog for deactivate action
