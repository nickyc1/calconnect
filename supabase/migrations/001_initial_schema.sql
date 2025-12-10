-- Migration 001: Initial Schema
-- This represents the baseline schema before webhook implementation
-- Run this ONLY if starting fresh (most users skip this)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (optional for POC)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  external_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store connected Google Calendar accounts (original structure)
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pipedream_account_id TEXT NOT NULL UNIQUE,
  account_email TEXT NOT NULL,
  account_name TEXT,
  is_source BOOLEAN DEFAULT false,
  calendar_id TEXT NOT NULL,
  color_id TEXT DEFAULT '1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);

-- Pipedream source deployments tracking
CREATE TABLE IF NOT EXISTS pipedream_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES user_accounts(pipedream_account_id),
  calendar_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Event mappings
CREATE TABLE IF NOT EXISTS event_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_event_id TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  source_calendar_id TEXT NOT NULL,
  mirrored_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_event_id, source_calendar_id)
);

-- Webhook deduplication
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_is_source ON user_accounts(is_source);
CREATE INDEX IF NOT EXISTS idx_event_mappings_user_source ON event_mappings(user_id, source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_mappings_mirrored ON event_mappings USING GIN(mirrored_events);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_user_id ON pipedream_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_status ON pipedream_sources(status);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_mappings_updated_at
  BEFORE UPDATE ON event_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (disabled for POC)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipedream_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;

-- Permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
