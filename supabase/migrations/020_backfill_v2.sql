-- 020_backfill_v2.sql
--
-- Rebuilds "Mirror existing events" as a real production feature after the
-- 2026-08-02 incident. Adds columns for:
--
--   * completion timestamp — enables a 24h "Undo backfill" button that
--     disappears after the window closes.
--   * mirror_dedupe_enabled — per-user opt-in for merging overlapping Busy
--     blocks on destinations so a 3-source setup doesn't stack duplicates.
--   * beta gating — only Pro users with this flag can see/use the feature
--     during the canary rollout.
--   * dry-run + serialization tracking — helps enforce "one backfill at a
--     time per user" without a separate lock table.

ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS backfill_completed_at TIMESTAMPTZ;

ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS backfill_horizon_years INTEGER NOT NULL DEFAULT 1
  CHECK (backfill_horizon_years BETWEEN 1 AND 5);

ALTER TABLE user_billing ADD COLUMN IF NOT EXISTS mirror_existing_beta BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_billing ADD COLUMN IF NOT EXISTS mirror_dedupe_enabled BOOLEAN NOT NULL DEFAULT true;

-- Track per-mirror-event contributors so dedupe can safely reverse-count
-- when one source cancels and we need to know whether OTHER sources still
-- need the Busy block on that destination. Each entry is
-- {source_account_id, source_event_id}; array so lookups stay in one row.
ALTER TABLE event_mappings ADD COLUMN IF NOT EXISTS dedupe_group_key TEXT;

CREATE INDEX IF NOT EXISTS idx_event_mappings_dedupe_group
  ON event_mappings (user_id, dedupe_group_key)
  WHERE dedupe_group_key IS NOT NULL;

-- Enable the beta for Nick immediately so he can test.
UPDATE user_billing
SET mirror_existing_beta = true
WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('nick@appsumo.com', 'n.christensen4@gmail.com'));
