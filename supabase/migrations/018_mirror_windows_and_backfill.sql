-- Migration 018: Time/day mirror windows + backfill existing events
--
-- Two Pro-only features requested by our first AppSumo reviewer, Kristi.
--
-- Feature 1: mirror_window JSONB per source. If set, we only mirror events
-- whose start/end overlaps the configured day+time range. Null = 24/7,
-- matches current behavior.
--
-- Feature 2: mirror_existing toggle + backfill state. When turned on we
-- fetch all future-dated events (today → +5 years) from the source and
-- create mirrors on all target calendars. When turned off we delete the
-- mirrors we created via backfill (identified by event_mappings.via_backfill).

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS mirror_window JSONB;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS mirror_existing_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_progress INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_total INTEGER;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_started_at TIMESTAMPTZ;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_cursor TEXT;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS backfill_error TEXT;

ALTER TABLE user_accounts
  ADD CONSTRAINT backfill_status_valid
  CHECK (backfill_status IN ('idle', 'running', 'complete', 'failed', 'canceled'));

-- Flag on event_mappings so we know which mirrors came from a backfill (as
-- opposed to real-time push notifications). Lets us delete backfill-created
-- mirrors when the user turns the toggle off without touching mirrors for
-- events that happened after backfill was enabled.
ALTER TABLE event_mappings
  ADD COLUMN IF NOT EXISTS via_backfill BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_mappings_backfill
  ON event_mappings (source_account_id, via_backfill)
  WHERE via_backfill = true;
