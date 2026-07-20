-- Migration 010: Deletion audit trail
-- Persists a tombstone row when a user self-deletes, so we can answer
-- "was this account deleted?" for chargebacks, GDPR SARs, and AppSumo
-- refund disputes long after the account rows are gone.

CREATE TABLE IF NOT EXISTS deletion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash TEXT NOT NULL,           -- sha256 of auth.users.id, so no PII stays behind
  email_hash TEXT NOT NULL,             -- sha256 of user email
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  channels_stopped INT DEFAULT 0,
  channels_failed INT DEFAULT 0,
  tokens_revoked INT DEFAULT 0,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_events_initiated
  ON deletion_events (initiated_at DESC);

ALTER TABLE deletion_events ENABLE ROW LEVEL SECURITY;

-- Only the service role can read this — never exposed to clients.
