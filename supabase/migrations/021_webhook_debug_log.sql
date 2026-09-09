-- 021_webhook_debug_log.sql
--
-- Ephemeral debug capture table for investigating specific webhook bugs
-- (like Eric's recurring-instance-move issue in Sep 2026). Written to only
-- by targeted debug code in the webhook route, read only by admin
-- endpoints. Rows are cheap to accumulate and safe to purge whenever.
-- Not tied to any user-facing feature.

CREATE TABLE IF NOT EXISTS webhook_debug_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  account_id TEXT,
  tag TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_debug_log_user_created
  ON webhook_debug_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_debug_log_tag_created
  ON webhook_debug_log (tag, created_at DESC);

ALTER TABLE webhook_debug_log ENABLE ROW LEVEL SECURITY;
-- Only service_role can read/write. No user-facing access.
