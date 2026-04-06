-- Migration 008: Replace Pipedream with direct Google Calendar API
-- Adds OAuth token storage to user_accounts and watch_channels table

-- Add OAuth token columns to user_accounts
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS google_email TEXT;

-- Add sync token for incremental event sync
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS sync_token TEXT;

-- Create watch_channels table for Google Calendar push notifications
CREATE TABLE IF NOT EXISTS watch_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT,
  expiration TIMESTAMPTZ NOT NULL,
  webhook_url TEXT NOT NULL,
  sync_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_channels_user ON watch_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_channels_channel ON watch_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_watch_channels_expiration ON watch_channels(expiration);

-- Drop the pipedream_sources table (no longer needed)
-- Keep it for now in case rollback is needed; can drop in future migration
-- DROP TABLE IF EXISTS pipedream_sources;
-- DROP TABLE IF EXISTS connect_tokens;
