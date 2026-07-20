-- Migration 013: AppSumo LTD code redemption
--
-- Codes are stored as sha256(raw_code) — never plaintext — so a DB or backup
-- leak doesn't expose usable codes to the world. The redemption endpoint hashes
-- the buyer-provided code and looks up by hash.
--
-- Atomic single-transaction claim (per rafter-secure-design):
--   UPDATE appsumo_codes
--     SET redeemed_by = $user, redeemed_at = now()
--     WHERE code_hash = $hash AND redeemed_by IS NULL AND revoked_at IS NULL
--     RETURNING *;
-- Zero rows means "already used" or "invalid" — we treat both with a uniform
-- error message so attackers can't distinguish "code exists but used" from
-- "code doesn't exist" via error probing.

CREATE TABLE IF NOT EXISTS appsumo_codes (
  code_hash TEXT PRIMARY KEY,           -- sha256 hex of the raw code
  batch TEXT NOT NULL,                  -- e.g. 'radar-launch-2026-07'
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,               -- set if AppSumo notifies of a refund
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_appsumo_codes_redeemed_by
  ON appsumo_codes (redeemed_by) WHERE redeemed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appsumo_codes_batch ON appsumo_codes (batch);

ALTER TABLE appsumo_codes ENABLE ROW LEVEL SECURITY;
-- Service role only. No policies — clients never read this table directly.

--
-- Append-only redemption audit log. Every attempt (success or failure) leaves
-- a tombstone so support can reproduce chargeback / refund disputes long after
-- the code was used. code_prefix is the first 8 chars of the raw code —
-- enough for support to correlate with a buyer's AppSumo receipt without
-- storing the full code that could be re-used.
--
CREATE TABLE IF NOT EXISTS redemption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code_hash TEXT,
  code_prefix TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'invalid', 'already_used', 'revoked', 'rate_limited', 'error')),
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_redemption_events_user
  ON redemption_events (user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_events_result
  ON redemption_events (result, attempted_at DESC);

ALTER TABLE redemption_events ENABLE ROW LEVEL SECURITY;
-- Service role only.
