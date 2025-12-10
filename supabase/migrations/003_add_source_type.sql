-- Migration 003: Add Source Type Column
-- Adds source_type to pipedream_sources to differentiate instant vs polling sources
-- This enables dual-source strategy: instant (create/update) + polling (deletions)
-- Run this migration to support event deletion detection

-- =============================================================================
-- STEP 1: Add source_type column with constraint
-- =============================================================================

-- Add column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pipedream_sources' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE pipedream_sources
    ADD COLUMN source_type TEXT;

    RAISE NOTICE 'Added source_type column to pipedream_sources';
  ELSE
    RAISE NOTICE 'source_type column already exists, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Set default value for existing rows
-- =============================================================================

-- Mark all existing sources as 'instant' (they are the new-or-updated-event sources)
UPDATE pipedream_sources
SET source_type = 'instant'
WHERE source_type IS NULL;

-- =============================================================================
-- STEP 3: Add constraints and make column required
-- =============================================================================

-- Add CHECK constraint to validate values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipedream_sources_source_type_check'
  ) THEN
    ALTER TABLE pipedream_sources
    ADD CONSTRAINT pipedream_sources_source_type_check
    CHECK (source_type IN ('instant', 'cancelled'));

    RAISE NOTICE 'Added CHECK constraint for source_type';
  ELSE
    RAISE NOTICE 'CHECK constraint already exists, skipping';
  END IF;
END $$;

-- Make column NOT NULL
ALTER TABLE pipedream_sources
ALTER COLUMN source_type SET NOT NULL;

-- =============================================================================
-- STEP 4: Add index for filtering by type
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pipedream_sources_type
ON pipedream_sources(source_type);

-- =============================================================================
-- STEP 5: Add composite index for common queries
-- =============================================================================

-- Optimize queries that filter by user_id, account_id, and source_type
CREATE INDEX IF NOT EXISTS idx_pipedream_sources_user_account_type
ON pipedream_sources(user_id, account_id, source_type);

-- =============================================================================
-- STEP 6: Add column comments for documentation
-- =============================================================================

COMMENT ON COLUMN pipedream_sources.source_type IS
  'Type of source: instant (new-or-updated-event) or cancelled (event-cancelled polling)';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verify the change
DO $$
DECLARE
  instant_count INTEGER;
  cancelled_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO instant_count FROM pipedream_sources WHERE source_type = 'instant';
  SELECT COUNT(*) INTO cancelled_count FROM pipedream_sources WHERE source_type = 'cancelled';
  SELECT COUNT(*) INTO total_count FROM pipedream_sources;

  RAISE NOTICE 'Migration 003 complete. Source type summary:';
  RAISE NOTICE '  - Total sources: %', total_count;
  RAISE NOTICE '  - Instant sources: %', instant_count;
  RAISE NOTICE '  - Cancelled sources: %', cancelled_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy new sources using updated deploy-source endpoint';
  RAISE NOTICE '  2. Each calendar will now have 2 sources: instant + cancelled';
  RAISE NOTICE '  3. Deletions will be detected via polling (5-minute interval)';
END $$;
