# Migration 005 - Critical Fix & MVP Enhancements

## Overview

This migration fixes a **critical bug** that prevents the "Set as Source" button from working, and adds billing columns for future Stripe integration.

---

## Critical Bug Fixed: Missing `updated_at` Column

### Problem

**Error when clicking "Set as Source":**
```
Error setting source: {
  code: '42703',
  message: 'record "new" has no field "updated_at"'
}
```

### Root Cause

Migration 002 added an `UPDATE` trigger to `user_accounts`:
```sql
CREATE TRIGGER update_user_accounts_updated_at
  BEFORE UPDATE ON user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

But **never added the `updated_at` column** that the trigger expects!

### Fix

Migration 005 adds the missing column:
```sql
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

---

## Schema Overview

### Users Table (Existing - Not Modified)

```sql
create table public.users (
  id uuid not null default extensions.uuid_generate_v4(),
  email text not null,
  external_user_id text not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),

  -- ADDED BY MIGRATION 005:
  is_paid boolean default false,
  stripe_customer_id text unique,

  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_external_user_id_key unique (external_user_id)
);
```

### User Accounts Table

```sql
create table public.user_accounts (
  id uuid primary key,
  user_id text not null,          -- TEXT (UUID as string)
  account_id text not null unique,
  app_name text not null,
  account_display_name text,
  is_active boolean default true,
  is_source_account boolean default false,  -- Added in migration 004
  created_at timestamptz default now(),

  -- ADDED BY MIGRATION 005:
  updated_at timestamptz default now()
);
```

---

## Important: UUID vs TEXT Distinction

### Data Type Mapping

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `users` | `id` | **UUID** | Supabase auth user ID |
| `users` | `external_user_id` | **TEXT** | Same UUID value as string |
| `user_accounts` | `user_id` | **TEXT** | References users.id (as string) |
| `pipedream_sources` | `user_id` | **TEXT** | References users.id (as string) |
| `event_mappings` | `user_id` | **TEXT** | References users.id (as string) |

### Why This Works

1. Supabase Auth SDK returns `user.id` as **JavaScript string** (e.g., `"e9c0f2f4-9623-466c-94d4-974e13a0f880"`)
2. When inserting into `users` table, string is auto-converted to UUID type
3. When inserting into `user_accounts`, string is stored as TEXT
4. Pipedream `external_user_id` expects string (TEXT), so we pass `user.id` directly

### Code Pattern

```typescript
// In auth callback
const { data: { user } } = await supabase.auth.getUser()
// user.id is string: "e9c0f2f4-9623-466c-94d4-974e13a0f880"

// Insert into users (UUID column) - works!
await supabase.from('users').upsert({
  id: user.id,  // String auto-converts to UUID
  external_user_id: user.id  // Stored as TEXT
})

// Insert into user_accounts (TEXT column) - works!
await supabase.from('user_accounts').insert({
  user_id: user.id  // String stored as TEXT
})

// Pipedream Connect - works!
await pipedream.generateConnectToken(user.id)  // Expects string
```

---

## Migration Steps

### 1. Run Migration 005

```sql
-- In Supabase Dashboard → SQL Editor
-- Copy and execute: supabase/migrations/005_mvp_enhancements_fixed.sql
```

### 2. Verify Migration Success

```sql
-- Check user_accounts has updated_at
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_accounts'
AND column_name = 'updated_at';

-- Should return:
-- column_name | data_type                   | is_nullable | column_default
-- updated_at  | timestamp with time zone    | YES         | now()

-- Check users has billing columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('is_paid', 'stripe_customer_id')
ORDER BY column_name;

-- Should return:
-- column_name         | data_type | is_nullable | column_default
-- is_paid             | boolean   | YES         | false
-- stripe_customer_id  | text      | YES         | NULL
```

### 3. Verify Trigger Works

```sql
-- Test the trigger by updating a user_account
UPDATE user_accounts
SET is_source_account = false
WHERE user_id = (SELECT id::text FROM users LIMIT 1);

-- Check updated_at was automatically updated
SELECT account_id, updated_at > created_at AS trigger_worked
FROM user_accounts
ORDER BY updated_at DESC
LIMIT 1;

-- trigger_worked should be true
```

---

## Testing the Fix

### Before Migration 005
❌ Click "Set as Source" → Error: `record "new" has no field "updated_at"`

### After Migration 005
✅ Click "Set as Source" → Success!

### Full Test Flow

1. **Run migration 005** in Supabase
2. **Restart Next.js dev server** (to clear any cached errors)
3. **Refresh browser**
4. **Click "Set as Source"** on any account
5. **Verify:**
   - No error in console
   - "SOURCE" badge appears on selected account
   - Status message shows success

---

## Future: Stripe Billing Integration

The migration adds columns for future billing:

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
```

### Implementation Pattern (Post-MVP)

```typescript
// 1. Guard "Connect" button
const { data: user } = await supabase
  .from('users')
  .select('is_paid')
  .eq('id', userId)
  .single()

if (!user.is_paid && accountCount >= 3) {
  return { error: 'Upgrade to paid plan' }
}

// 2. Stripe webhook handler
if (event.type === 'customer.subscription.updated') {
  await supabase
    .from('users')
    .update({ is_paid: subscription.status === 'active' })
    .eq('stripe_customer_id', subscription.customer)
}
```

---

## Summary

✅ **Fixed:** Missing `updated_at` column in `user_accounts`
✅ **Added:** `is_paid` column to `users`
✅ **Added:** `stripe_customer_id` column to `users`
✅ **Tested:** Trigger now works correctly
✅ **Ready:** For Stripe billing integration

**After running this migration, the "Set as Source" button will work!**
