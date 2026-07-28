-- Migration 017: Scope the account_id unique constraint per user_id
--
-- Original constraint (migration 002) was UNIQUE (account_id), which meant
-- the same Google account (identified by email) could only be connected to
-- ONE CalConnect user in the entire system. That broke legitimate cases:
--   - Nick has a real personal CalConnect account with nick@appsumo.com
--     connected, then tries to test with nick+1234@appsumo.com and can't
--     connect the same Google account
--   - Two different CalConnect users legitimately sharing a Google account
--     (e.g., household calendars, freelancer clients)
--
-- Fix: replace the global unique with (user_id, account_id) composite. One
-- CalConnect user can still only connect a given Google account once, but
-- different CalConnect users can each connect their own instance of it.

ALTER TABLE user_accounts
  DROP CONSTRAINT IF EXISTS user_accounts_account_id_key;

ALTER TABLE user_accounts
  ADD CONSTRAINT user_accounts_user_id_account_id_key UNIQUE (user_id, account_id);
