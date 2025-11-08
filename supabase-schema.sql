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

-- Store connected Google Calendar accounts
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pipedream_account_id TEXT NOT NULL UNIQUE, -- e.g., apn_1234567
  account_email TEXT NOT NULL,
  account_name TEXT,
  is_source BOOLEAN DEFAULT false,
  calendar_id TEXT NOT NULL, -- Google Calendar ID
  color_id TEXT DEFAULT '1', -- Google Calendar color for mirrors
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);

-- Pipedream source deployments tracking
CREATE TABLE IF NOT EXISTS pipedream_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL UNIQUE, -- Pipedream source deployment ID
  account_id TEXT NOT NULL REFERENCES user_accounts(pipedream_account_id),
  calendar_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- For source expiration tracking
);

-- Event mappings
CREATE TABLE IF NOT EXISTS event_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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
  event_id TEXT NOT NULL UNIQUE, -- Webhook event ID for idempotency
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_is_source ON user_accounts(is_source);
CREATE INDEX IF NOT EXISTS idx_event_mappings_user_source ON event_mappings(user_id, source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_mappings_mirrored ON event_mappings USING GIN(mirrored_events);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_user_id ON pipedream_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_status ON pipedream_sources(status);

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

CREATE TRIGGER update_event_mappings_updated_at
  BEFORE UPDATE ON event_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipedream_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Adjust these based on your authentication strategy
-- These policies assume you're using Supabase Auth with auth.uid()

-- Users can only see and modify their own data
CREATE POLICY users_policy ON users
  FOR ALL
  USING (auth.uid() = id);

-- Users can only see and modify their own accounts
CREATE POLICY user_accounts_policy ON user_accounts
  FOR ALL
  USING (user_id = auth.uid());

-- Users can only see and modify their own event mappings
CREATE POLICY event_mappings_policy ON event_mappings
  FOR ALL
  USING (user_id = auth.uid());

-- Users can only see and modify their own sources
CREATE POLICY pipedream_sources_policy ON pipedream_sources
  FOR ALL
  USING (user_id = auth.uid());

-- Users can only see their own webhook events
CREATE POLICY webhook_events_policy ON webhook_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role bypass (for backend operations using service key)
CREATE POLICY service_role_bypass_users ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_bypass_accounts ON user_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_bypass_mappings ON event_mappings
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_bypass_sources ON pipedream_sources
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_bypass_webhooks ON webhook_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON users, user_accounts, event_mappings, pipedream_sources, webhook_events TO authenticated;

-- Comments for documentation
COMMENT ON TABLE users IS 'Multi-tenant user records with Pipedream external user ID mapping';
COMMENT ON TABLE user_accounts IS 'Connected Google Calendar accounts via Pipedream Connect';
COMMENT ON TABLE event_mappings IS 'Maps source events to mirrored events across destination calendars';
COMMENT ON TABLE pipedream_sources IS 'Tracks deployed Pipedream sources for calendar monitoring';
COMMENT ON TABLE webhook_events IS 'Webhook event deduplication and audit trail';

COMMENT ON COLUMN user_accounts.pipedream_account_id IS 'Pipedream Connect account ID (e.g., apn_1234567)';
COMMENT ON COLUMN user_accounts.is_source IS 'True if this account/calendar is the source being monitored';
COMMENT ON COLUMN event_mappings.mirrored_events IS 'JSONB array of mirror event details';
