# MirCal MVP - Testing Summary & Next Steps

**Date:** 2024-12-09
**Status:** Phase 1 Testing Complete - Ready for Migration 005

---

## ✅ What's Working (Validated)

### 1. Authentication Flow
- ✅ Google OAuth login successful
- ✅ User persisted in `auth.users` table
- ✅ Session management working (sign out → sign in preserves data)
- ✅ Protected routes redirect correctly

### 2. Pipedream Connect Integration
- ✅ External user provisioned correctly (ID: `e9c0f2f4-9623-466c-94d4-974e13a0f880`)
- ✅ Connect token generation works
- ✅ Account connection persists across sessions
- ✅ Two calendar accounts displayed on dashboard

### 3. Data Persistence
- ✅ Accounts stored in `user_accounts` table
- ✅ Accounts persist after sign out/sign in cycle

---

## 🐛 Bug Fixed

### Missing `public.users` Row
**Problem:** User exists in `auth.users` but not in `public.users` table

**Root Cause:** No code created user row on login

**Fix Implemented:**
1. ✅ Created `migration 005_enable_public_users.sql`
2. ✅ Updated `app/auth/callback/route.ts` to upsert user on login
3. ✅ Added columns for future Stripe billing (`is_paid`, `stripe_customer_id`)

**Schema:**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- auth.users.id
  email TEXT NOT NULL UNIQUE,       -- user's email
  external_user_id TEXT NOT NULL,   -- same as id (for Pipedream)
  is_paid BOOLEAN DEFAULT false,    -- for future billing
  stripe_customer_id TEXT UNIQUE,   -- for future Stripe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📋 Pipedream External User Strategy - CONFIRMED

### Decision: Use Current Approach (No Changes Needed)

| Aspect | Implementation | Status |
|--------|---------------|--------|
| **External User ID** | `auth.users.id` (UUID) | ✅ Optimal |
| **Provisioning Time** | Lazy (on first Connect click) | ✅ Efficient |
| **Value Used** | `e9c0f2f4-9623-466c-94d4-974e13a0f880` | ✅ Immutable |
| **Alternative Considered** | Use email | ❌ Rejected (mutable) |

### Why This Works

1. **Immutable:** UUID never changes
2. **Unique:** Guaranteed by Supabase
3. **Efficient:** Only provision users who actually use features
4. **Simple:** Pipedream handles creation automatically

### Data Flow

```
User Registers (Google OAuth)
    ↓
auth.users created (Supabase)
    ↓
public.users created (migration 005)
    ↓
User clicks "Connect Google Calendar"
    ↓
POST /api/connect/token
    ↓
pipedream.generateConnectToken(user.id)
    ↓
Pipedream creates external user (lazy)
    ↓
Account stored in user_accounts
```

---

## 🔄 Next Actions

### Immediate (Required Before Testing)

1. **Run Migration 005:**
   ```bash
   # In Supabase Dashboard → SQL Editor
   # Copy contents of:
   # supabase/migrations/005_enable_public_users.sql
   # Execute
   ```

2. **Verify Migration Success:**
   ```sql
   -- Check table structure
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'users';

   -- Should show: id, email, external_user_id, is_paid, stripe_customer_id
   ```

3. **Test Login Flow:**
   - Clear browser cookies
   - Sign in with Google OAuth
   - Check `public.users` table has row with your email
   - Verify `id` = `external_user_id` = Supabase auth UUID

### Phase 2 Testing (After Migration 005)

Follow the **MirCal - MVP Validation Checklist.md** critical path:

1. ✅ Google OAuth login (DONE)
2. ⏳ Connect 2 calendar accounts
3. ⏳ Set source account (radio button)
4. ⏳ Activate mirroring
5. ⏳ Create event in source → verify mirrors appear
6. ⏳ Delete event in source → verify mirrors removed

---

## 📚 Documentation Created

1. **MirCal - MVP Validation Checklist.md**
   - Comprehensive testing checklist
   - Validation status tracking
   - Testing strategy priorities

2. **MirCal - Pipedream External User Strategy.md**
   - Detailed analysis of provisioning options
   - Decision rationale
   - Future billing integration plans

3. **TESTING_SUMMARY.md** (this file)
   - Testing progress summary
   - Next action items

---

## 🎯 Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Authentication | ✅ Working | Bug fixed pending migration |
| Account Connection | ✅ Working | Persists correctly |
| Source Selection | ⏳ Pending | Needs testing |
| Mirroring Activation | ⏳ Pending | Needs testing |
| Event Mirroring | ⏳ Pending | Needs testing |
| Dashboard UI | ✅ Deployed | Needs UX testing |

---

## ⚠️ Important Notes

1. **Migration 005 is REQUIRED** before continuing testing
2. **External user ID strategy is FINAL** - no changes needed
3. **Billing columns added** - ready for future Stripe integration
4. **Current architecture is optimal** - lazy provisioning working as designed

---

## 🔍 What to Look For in Next Tests

### When Testing "Set Source Account":
- [ ] Only one account can be source at a time
- [ ] Source indicator ("SOURCE" badge) appears
- [ ] Cannot change source while mirroring is active

### When Testing "Activate Mirroring":
- [ ] Button disabled if <2 accounts
- [ ] Button disabled if no source selected
- [ ] Status changes to "Active"
- [ ] Both sources deployed (instant + cancelled)

### When Testing Event Mirroring:
- [ ] New event in source → mirrors appear in destinations
- [ ] Mirror events say "Busy"
- [ ] Mirror events are private
- [ ] Delete source event → mirrors removed

---

## 📞 Reporting Issues

When reporting bugs/findings, include:
1. **What you did** (step-by-step)
2. **What you expected**
3. **What happened instead**
4. **Server logs** (if applicable)
5. **Database state** (relevant table rows)
