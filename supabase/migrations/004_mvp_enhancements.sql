-- Migration 004: MVP Enhancements
-- Adds is_source_account flag for tracking which account is the mirroring source

-- =============================================================================
-- STEP 1: Add is_source_account column
-- =============================================================================

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS is_source_account BOOLEAN DEFAULT false;

-- =============================================================================
-- STEP 2: Create unique partial index (only one source per user)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_source_unique
ON user_accounts(user_id)
WHERE is_source_account = true;

-- =============================================================================
-- STEP 3: Add user_id to webhook_events for debugging
-- =============================================================================

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- =============================================================================
-- STEP 4: Create index for common dashboard queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_accounts_user_active
ON user_accounts(user_id, is_active);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 004 complete:';
  RAISE NOTICE '  - Added is_source_account column to user_accounts';
  RAISE NOTICE '  - Added unique constraint for one source per user';
  RAISE NOTICE '  - Added user_id to webhook_events';
END $$;
