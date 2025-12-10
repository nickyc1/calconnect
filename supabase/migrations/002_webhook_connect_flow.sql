-- Migration 002: Webhook-based Connect Flow
-- Adds connect_tokens table and restructures tables for POC simplicity
-- Run this migration to update your existing database

-- =============================================================================
-- STEP 1: Create connect_tokens table
-- =============================================================================

CREATE TABLE IF NOT EXISTS connect_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connect_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connect_tokens_token ON connect_tokens(connect_token);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_expires ON connect_tokens(expires_at);

COMMENT ON TABLE connect_tokens IS 'Temporary token mappings for Pipedream Connect authentication flow';
COMMENT ON COLUMN connect_tokens.connect_token IS 'Short-lived Pipedream Connect token (ctok_...)';

-- =============================================================================
-- STEP 2: Restructure user_accounts table
-- =============================================================================

-- Drop RLS policies first (they prevent column type changes)
DROP POLICY IF EXISTS user_accounts_policy ON user_accounts;
DROP POLICY IF EXISTS user_accounts_select_policy ON user_accounts;
DROP POLICY IF EXISTS user_accounts_insert_policy ON user_accounts;
DROP POLICY IF EXISTS user_accounts_update_policy ON user_accounts;
DROP POLICY IF EXISTS user_accounts_delete_policy ON user_accounts;

-- Drop old constraints and indexes that will change
DROP INDEX IF EXISTS idx_user_accounts_is_source;
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS user_accounts_user_id_fkey;
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS user_accounts_user_id_calendar_id_key;

-- Rename columns to match new schema
DO $$
BEGIN
  -- Rename pipedream_account_id to account_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'pipedream_account_id'
  ) THEN
    ALTER TABLE user_accounts RENAME COLUMN pipedream_account_id TO account_id;
  END IF;

  -- Drop old columns we don't need
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'account_email'
  ) THEN
    ALTER TABLE user_accounts DROP COLUMN account_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'account_name'
  ) THEN
    ALTER TABLE user_accounts DROP COLUMN account_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'is_source'
  ) THEN
    ALTER TABLE user_accounts DROP COLUMN is_source;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'calendar_id'
  ) THEN
    ALTER TABLE user_accounts DROP COLUMN calendar_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts' AND column_name = 'color_id'
  ) THEN
    ALTER TABLE user_accounts DROP COLUMN color_id;
  END IF;
END $$;

-- Change user_id to TEXT (for POC simplicity - external_user_id is a string)
ALTER TABLE user_accounts ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Add new columns
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS app_name TEXT NOT NULL DEFAULT 'google_calendar';
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS account_display_name TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update constraint on account_id (CASCADE drops dependent foreign keys)
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS user_accounts_pipedream_account_id_key CASCADE;
ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_account_id_key UNIQUE (account_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_user_accounts_updated_at ON user_accounts;
CREATE TRIGGER update_user_accounts_updated_at
  BEFORE UPDATE ON user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_user_accounts_account_id ON user_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_active ON user_accounts(is_active);

COMMENT ON COLUMN user_accounts.account_id IS 'Pipedream Connect account ID (e.g., apn_1234567)';

-- =============================================================================
-- STEP 3: Restructure pipedream_sources table
-- =============================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS pipedream_sources_policy ON pipedream_sources;
DROP POLICY IF EXISTS pipedream_sources_select_policy ON pipedream_sources;
DROP POLICY IF EXISTS pipedream_sources_insert_policy ON pipedream_sources;
DROP POLICY IF EXISTS pipedream_sources_update_policy ON pipedream_sources;
DROP POLICY IF EXISTS pipedream_sources_delete_policy ON pipedream_sources;

-- Drop old constraints
ALTER TABLE pipedream_sources DROP CONSTRAINT IF EXISTS pipedream_sources_user_id_fkey;
ALTER TABLE pipedream_sources DROP CONSTRAINT IF EXISTS pipedream_sources_account_id_fkey;

-- Change user_id to TEXT
ALTER TABLE pipedream_sources ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Drop/rename columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipedream_sources' AND column_name = 'status'
  ) THEN
    ALTER TABLE pipedream_sources DROP COLUMN status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipedream_sources' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE pipedream_sources DROP COLUMN expires_at;
  END IF;
END $$;

-- Add is_active column
ALTER TABLE pipedream_sources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Re-add foreign key to user_accounts
ALTER TABLE pipedream_sources
  DROP CONSTRAINT IF EXISTS pipedream_sources_account_id_fkey,
  ADD CONSTRAINT pipedream_sources_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES user_accounts(account_id);

-- Update indexes
DROP INDEX IF EXISTS idx_pipedream_sources_status;
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_active ON pipedream_sources(is_active);

-- =============================================================================
-- STEP 4: Restructure event_mappings table
-- =============================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS event_mappings_policy ON event_mappings;
DROP POLICY IF EXISTS event_mappings_select_policy ON event_mappings;
DROP POLICY IF EXISTS event_mappings_insert_policy ON event_mappings;
DROP POLICY IF EXISTS event_mappings_update_policy ON event_mappings;
DROP POLICY IF EXISTS event_mappings_delete_policy ON event_mappings;

-- Drop old foreign key
ALTER TABLE event_mappings DROP CONSTRAINT IF EXISTS event_mappings_user_id_fkey;

-- Change user_id to TEXT
ALTER TABLE event_mappings ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- =============================================================================
-- STEP 5: Restructure webhook_events table
-- =============================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS webhook_events_policy ON webhook_events;
DROP POLICY IF EXISTS webhook_events_select_policy ON webhook_events;
DROP POLICY IF EXISTS webhook_events_insert_policy ON webhook_events;
DROP POLICY IF EXISTS webhook_events_update_policy ON webhook_events;
DROP POLICY IF EXISTS webhook_events_delete_policy ON webhook_events;

-- Drop old constraints
ALTER TABLE webhook_events DROP CONSTRAINT IF EXISTS webhook_events_user_id_fkey;
ALTER TABLE webhook_events DROP CONSTRAINT IF EXISTS webhook_events_event_id_key;

-- Drop/rename columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE webhook_events DROP COLUMN event_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE webhook_events DROP COLUMN user_id;
  END IF;
END $$;

-- Add new columns
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'calendar_event';
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Rename processed_at to allow nulls
ALTER TABLE webhook_events ALTER COLUMN processed_at DROP NOT NULL;

-- Update indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- =============================================================================
-- STEP 6: Grant permissions and RLS
-- =============================================================================

ALTER TABLE connect_tokens DISABLE ROW LEVEL SECURITY;

GRANT INSERT, UPDATE, DELETE ON connect_tokens TO authenticated;
GRANT ALL ON connect_tokens TO service_role;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verify tables exist
DO $$
BEGIN
  RAISE NOTICE 'Migration 002 complete. Tables updated:';
  RAISE NOTICE '  - connect_tokens (new)';
  RAISE NOTICE '  - user_accounts (restructured)';
  RAISE NOTICE '  - pipedream_sources (restructured)';
  RAISE NOTICE '  - event_mappings (restructured)';
  RAISE NOTICE '  - webhook_events (restructured)';
END $$;
