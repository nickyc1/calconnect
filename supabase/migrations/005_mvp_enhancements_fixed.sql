-- Migration 005: MVP Enhancements - Fixed
-- Adds missing updated_at to user_accounts and billing columns to users table

-- =============================================================================
-- STEP 1: Add updated_at column to user_accounts (CRITICAL FIX)
-- =============================================================================
-- The update trigger was added in migration 002 but the column was never created!

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  RAISE NOTICE 'Added updated_at column to user_accounts';
END $$;

-- =============================================================================
-- STEP 2: Add billing columns to existing users table
-- =============================================================================
-- The users table already exists with UUID id, so we just ADD new columns

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

DO $$
BEGIN
  RAISE NOTICE 'Added billing columns to users table';
END $$;

-- =============================================================================
-- STEP 3: Add indexes for billing columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id
ON users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

-- =============================================================================
-- STEP 4: Add column comments
-- =============================================================================

COMMENT ON COLUMN user_accounts.updated_at IS 'Timestamp of last update to this account record';
COMMENT ON COLUMN users.is_paid IS 'Whether user has active paid subscription (for future Stripe integration)';
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for billing (for future Stripe integration)';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
DECLARE
  users_count INTEGER;
  accounts_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM users;
  SELECT COUNT(*) INTO accounts_count FROM user_accounts;

  RAISE NOTICE 'Migration 005 complete:';
  RAISE NOTICE '  - Added updated_at to user_accounts (fixes trigger error)';
  RAISE NOTICE '  - Added is_paid to users table';
  RAISE NOTICE '  - Added stripe_customer_id to users table';
  RAISE NOTICE '  - Total users: %', users_count;
  RAISE NOTICE '  - Total accounts: %', accounts_count;
  RAISE NOTICE '';
  RAISE NOTICE 'CRITICAL FIX: user_accounts.updated_at now exists!';
  RAISE NOTICE 'Set Source button should now work correctly.';
END $$;
