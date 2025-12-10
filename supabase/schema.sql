-- MirCal Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with Connect account mapping
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  external_user_id TEXT NOT NULL UNIQUE, -- Pipedream external user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Temporary tokens for Connect authentication flow
CREATE TABLE IF NOT EXISTS connect_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connect_token TEXT NOT NULL UNIQUE, -- Pipedream Connect token (ctok_...)
  user_id TEXT NOT NULL, -- Maps to external_user_id for simplicity in POC
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store connected Google Calendar accounts
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- External user ID (string for POC simplicity)
  account_id TEXT NOT NULL UNIQUE, -- Pipedream account ID (apn_...)
  app_name TEXT NOT NULL DEFAULT 'google_calendar',
  account_display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipedream source deployments tracking
CREATE TABLE IF NOT EXISTS pipedream_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES user_accounts(account_id),
  source_id TEXT NOT NULL UNIQUE, -- Pipedream source deployment ID
  calendar_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event mappings
CREATE TABLE IF NOT EXISTS event_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  source_calendar_id TEXT NOT NULL,
  mirrored_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- mirrored_events structure:
  -- [{
  --   "event_id": "abc123",
  --   "account_id": "apn_dest_456",
  --   "calendar_id": "dest@gmail.com"
  -- }]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_event_id, source_calendar_id)
);

-- Webhook deduplication
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_connect_tokens_token ON connect_tokens(connect_token);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_expires ON connect_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_account_id ON user_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_active ON user_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_event_mappings_user_source ON event_mappings(user_id, source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_mappings_mirrored ON event_mappings USING GIN(mirrored_events);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_user_id ON pipedream_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_active ON pipedream_sources(is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_accounts_updated_at
  BEFORE UPDATE ON user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_mappings_updated_at
  BEFORE UPDATE ON event_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
-- NOTE: For POC, we're disabling RLS and relying on service role key
-- In production, enable RLS with proper policies based on your auth strategy
ALTER TABLE connect_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipedream_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON connect_tokens, users, user_accounts, event_mappings, pipedream_sources, webhook_events TO authenticated;

-- Comments for documentation
COMMENT ON TABLE connect_tokens IS 'Temporary token mappings for Pipedream Connect authentication flow';
COMMENT ON TABLE users IS 'Multi-tenant user records with Pipedream external user ID mapping (optional for POC)';
COMMENT ON TABLE user_accounts IS 'Connected Google Calendar accounts via Pipedream Connect';
COMMENT ON TABLE event_mappings IS 'Maps source events to mirrored events across destination calendars';
COMMENT ON TABLE pipedream_sources IS 'Tracks deployed Pipedream sources for calendar monitoring';
COMMENT ON TABLE webhook_events IS 'Webhook event deduplication and audit trail';

COMMENT ON COLUMN connect_tokens.connect_token IS 'Short-lived Pipedream Connect token (ctok_...)';
COMMENT ON COLUMN user_accounts.account_id IS 'Pipedream Connect account ID (e.g., apn_1234567)';
COMMENT ON COLUMN event_mappings.mirrored_events IS 'JSONB array of mirror event details';
