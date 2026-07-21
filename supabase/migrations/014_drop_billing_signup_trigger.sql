-- Migration 014: Drop the auth.users signup trigger for user_billing
--
-- The trigger from migration 012 was throwing during auth.users INSERT,
-- rolling back new user creation and causing "Database error saving new user"
-- on every new signup. Likely cause: RLS interaction with SECURITY DEFINER
-- in Supabase's newer Postgres setup.
--
-- Safe to drop: every code path that reads user_billing already handles a
-- missing row (via maybeSingle + defaults). Every code path that writes
-- (stripe/checkout, redeem-code, webhook) uses upsert with ON CONFLICT.
-- So the row gets created just-in-time when first needed.

DROP TRIGGER IF EXISTS on_auth_user_created_billing ON auth.users;
DROP FUNCTION IF EXISTS create_billing_on_signup();
