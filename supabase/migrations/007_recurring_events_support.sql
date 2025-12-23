-- Migration 007: Add Recurring Events Support
-- Adds columns to track recurring events and their instances

-- Add columns to event_mappings table
ALTER TABLE event_mappings
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE event_mappings
ADD COLUMN IF NOT EXISTS recurring_event_id TEXT;

-- Add index for querying instances by base event ID
CREATE INDEX IF NOT EXISTS idx_event_mappings_recurring_event_id
ON event_mappings(recurring_event_id)
WHERE recurring_event_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN event_mappings.is_recurring IS
  'Whether this mapping is for a recurring event instance. True for instances, false for base events or single events.';

COMMENT ON COLUMN event_mappings.recurring_event_id IS
  'For recurring event instances, this is the base event ID. Null for single events or base recurring events.';

-- Report completion
DO $$
DECLARE
  mappings_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mappings_count FROM event_mappings;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 007 Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '  ✓ Added is_recurring column to event_mappings';
  RAISE NOTICE '  ✓ Added recurring_event_id column to event_mappings';
  RAISE NOTICE '  ✓ Created index on recurring_event_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Current State:';
  RAISE NOTICE '  - Total event mappings: %', mappings_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Recurring Events Support:';
  RAISE NOTICE '  - Base recurring events will have is_recurring = false, recurring_event_id = null';
  RAISE NOTICE '  - Instance events will have is_recurring = true, recurring_event_id = <base_event_id>';
  RAISE NOTICE '  - System will expand RRULE and create mirrors for all instances';
  RAISE NOTICE '';
END $$;
