-- Migration 011: Track when a connected Google account's refresh token has
-- become invalid (revoked by user, expired past Google's testing-mode 7-day
-- window, or scope changed). We flip `needs_reauth` whenever a token refresh
-- returns invalid_grant, and clear it on the next successful OAuth callback.

ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS reauth_flagged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_accounts_needs_reauth
  ON user_accounts (user_id) WHERE needs_reauth = true;
