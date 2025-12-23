-- Migration 006: Enable Multiple Sources + Database Cleanup
-- Implements spec change for multiple source accounts per user
-- Fixes Bugs #2, #5, #6, #7

-- =============================================================================
-- PART 1: Enable Multiple Source Accounts (Spec Change)
-- =============================================================================

-- Drop unique constraint that limited to single source per user
DROP INDEX IF EXISTS idx_user_accounts_source_unique;

DO $$
BEGIN
  RAISE NOTICE 'Dropped unique constraint on is_source_account';
  RAISE NOTICE 'Users can now have multiple source accounts';
END $$;

-- =============================================================================
-- PART 2: Convert user_id Columns from TEXT to UUID (Required for FK Constraints)
-- =============================================================================

-- Convert user_accounts.user_id from TEXT to UUID
DO $$
BEGIN
  -- Check if column is already UUID type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_accounts'
    AND column_name = 'user_id'
    AND data_type = 'text'
  ) THEN
    -- Clean up any invalid UUIDs first
    DELETE FROM user_accounts
    WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    -- Convert column type
    ALTER TABLE user_accounts
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

    RAISE NOTICE 'Converted user_accounts.user_id from TEXT to UUID';
  END IF;
END $$;

-- Convert pipedream_sources.user_id from TEXT to UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipedream_sources'
    AND column_name = 'user_id'
    AND data_type = 'text'
  ) THEN
    DELETE FROM pipedream_sources
    WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE pipedream_sources
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

    RAISE NOTICE 'Converted pipedream_sources.user_id from TEXT to UUID';
  END IF;
END $$;

-- Convert event_mappings.user_id from TEXT to UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_mappings'
    AND column_name = 'user_id'
    AND data_type = 'text'
  ) THEN
    DELETE FROM event_mappings
    WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE event_mappings
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

    RAISE NOTICE 'Converted event_mappings.user_id from TEXT to UUID';
  END IF;
END $$;

-- Convert webhook_events.user_id from TEXT to UUID (if table exists and column is TEXT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'webhook_events'
      AND column_name = 'user_id'
      AND data_type = 'text'
    ) THEN
      -- Clean up invalid UUIDs
      DELETE FROM webhook_events
      WHERE user_id IS NOT NULL
      AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      ALTER TABLE webhook_events
      ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

      RAISE NOTICE 'Converted webhook_events.user_id from TEXT to UUID';
    END IF;
  END IF;
END $$;

-- Convert connect_tokens.user_id from TEXT to UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connect_tokens'
    AND column_name = 'user_id'
    AND data_type = 'text'
  ) THEN
    DELETE FROM connect_tokens
    WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE connect_tokens
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

    RAISE NOTICE 'Converted connect_tokens.user_id from TEXT to UUID';
  END IF;
END $$;

-- =============================================================================
-- PART 3: Add Foreign Key Constraints (Bug #2)
-- =============================================================================

-- Add FK for user_accounts (with CASCADE delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_accounts_user_id'
  ) THEN
    -- Clean up orphaned records (users not in users table)
    DELETE FROM user_accounts
    WHERE user_id NOT IN (SELECT id FROM users);

    ALTER TABLE user_accounts
    ADD CONSTRAINT fk_user_accounts_user_id
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

    RAISE NOTICE 'Added FK constraint: user_accounts.user_id → users.id';
  END IF;
END $$;

-- Add FK for pipedream_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pipedream_sources_user_id'
  ) THEN
    DELETE FROM pipedream_sources
    WHERE user_id NOT IN (SELECT id FROM users);

    ALTER TABLE pipedream_sources
    ADD CONSTRAINT fk_pipedream_sources_user_id
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

    RAISE NOTICE 'Added FK constraint: pipedream_sources.user_id → users.id';
  END IF;
END $$;

-- Add FK for event_mappings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_event_mappings_user_id'
  ) THEN
    DELETE FROM event_mappings
    WHERE user_id NOT IN (SELECT id FROM users);

    ALTER TABLE event_mappings
    ADD CONSTRAINT fk_event_mappings_user_id
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

    RAISE NOTICE 'Added FK constraint: event_mappings.user_id → users.id';
  END IF;
END $$;

-- Add FK for webhook_events (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_webhook_events_user_id'
    ) THEN
      DELETE FROM webhook_events
      WHERE user_id IS NOT NULL
      AND user_id NOT IN (SELECT id FROM users);

      ALTER TABLE webhook_events
      ADD CONSTRAINT fk_webhook_events_user_id
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE;

      RAISE NOTICE 'Added FK constraint: webhook_events.user_id → users.id';
    END IF;
  END IF;
END $$;

-- Add FK for connect_tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_connect_tokens_user_id'
  ) THEN
    DELETE FROM connect_tokens
    WHERE user_id NOT IN (SELECT id FROM users);

    ALTER TABLE connect_tokens
    ADD CONSTRAINT fk_connect_tokens_user_id
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

    RAISE NOTICE 'Added FK constraint: connect_tokens.user_id → users.id';
  END IF;
END $$;

-- =============================================================================
-- PART 4: Remove is_active Column from pipedream_sources (Bug #7)
-- =============================================================================

-- First, delete all inactive sources (should already be deleted from Pipedream)
DELETE FROM pipedream_sources WHERE is_active = false;

-- Then drop the column
ALTER TABLE pipedream_sources DROP COLUMN IF EXISTS is_active;

DO $$
BEGIN
  RAISE NOTICE 'Removed is_active column from pipedream_sources';
  RAISE NOTICE 'Only active sources should have rows in database';
END $$;

-- =============================================================================
-- PART 5: Remove Redundant external_user_id Column (Bug #5)
-- =============================================================================

-- Drop unique constraint first
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_external_user_id_key;

-- Drop the column
ALTER TABLE users DROP COLUMN IF EXISTS external_user_id;

DO $$
BEGIN
  RAISE NOTICE 'Removed redundant external_user_id column from users';
  RAISE NOTICE 'Use users.id for Pipedream externalUserId (will be converted to string in code)';
END $$;

-- =============================================================================
-- PART 6: Add RLS Policies to connect_tokens (Bug #6)
-- =============================================================================

-- Enable RLS on connect_tokens table
ALTER TABLE connect_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS select_own_tokens ON connect_tokens;
DROP POLICY IF EXISTS service_all_tokens ON connect_tokens;

-- Policy: Users can only see their own tokens
CREATE POLICY select_own_tokens ON connect_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY service_all_tokens ON connect_tokens
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

DO $$
BEGIN
  RAISE NOTICE 'Enabled RLS on connect_tokens table';
  RAISE NOTICE 'Added policies: select_own_tokens, service_all_tokens';
END $$;

-- =============================================================================
-- PART 7: Add Comments for New Multi-Source Behavior
-- =============================================================================

COMMENT ON COLUMN user_accounts.is_source_account IS
  'Whether this account is a source for mirroring. Multiple accounts per user can be sources. Events from source accounts mirror to ALL other accounts except origin.';

COMMENT ON TABLE pipedream_sources IS
  'Active Pipedream sources for calendar monitoring. Each source account has 2 sources (instant + cancelled). Only active sources have rows - deleted sources remove rows.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
DECLARE
  users_count INTEGER;
  accounts_count INTEGER;
  sources_count INTEGER;
  source_accounts_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM users;
  SELECT COUNT(*) INTO accounts_count FROM user_accounts;
  SELECT COUNT(*) INTO sources_count FROM pipedream_sources;
  SELECT COUNT(*) INTO source_accounts_count FROM user_accounts WHERE is_source_account = true;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 006 Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '  ✓ Multiple sources enabled (dropped unique constraint)';
  RAISE NOTICE '  ✓ Converted user_id columns from TEXT to UUID (5 tables)';
  RAISE NOTICE '  ✓ Foreign key constraints added (5 tables)';
  RAISE NOTICE '  ✓ is_active column removed from pipedream_sources';
  RAISE NOTICE '  ✓ external_user_id column removed from users';
  RAISE NOTICE '  ✓ RLS policies added to connect_tokens';
  RAISE NOTICE '';
  RAISE NOTICE 'Current State:';
  RAISE NOTICE '  - Total users: %', users_count;
  RAISE NOTICE '  - Total accounts: %', accounts_count;
  RAISE NOTICE '  - Source accounts: %', source_accounts_count;
  RAISE NOTICE '  - Active sources: %', sources_count;
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update code to use user.id directly instead of external_user_id';
  RAISE NOTICE '  - Pipedream calls: user.id will be auto-converted to string';
  RAISE NOTICE '  - Database queries: user_id is now UUID type';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Update API endpoints for multiple sources';
  RAISE NOTICE '  2. Update UI to use checkboxes for source selection';
  RAISE NOTICE '  3. Test with multiple source accounts';
  RAISE NOTICE '';
END $$;
