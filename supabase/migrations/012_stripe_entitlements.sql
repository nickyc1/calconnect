-- Migration 012: Stripe subscription entitlements
--
-- Each user gets ONE user_billing row that mirrors their Stripe state.
-- Stripe is the source of truth for what they paid for; this table is a
-- cache we update via webhooks + treat as authoritative for enforcement
-- (per rafter-secure-design: never trust the client, enforce server-side
-- inside the transaction that inserts a calendar row).
--
-- plan semantics:
--   'free'     — signed up, hasn't purchased. entitled = 0 (can browse dashboard, can't mirror)
--   'lifetime' — bought $9 AppSumo LTD. base_calendars = 2, no recurring sub
--   'basic'    — $4/mo. base_calendars = 3
--   'pro'      — $10/mo. base_calendars = 10
-- extra_calendars is the quantity on the Extra Calendar subscription item.
-- Entitled total = base_calendars + extra_calendars.

CREATE TABLE IF NOT EXISTS user_billing (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT,
  base_calendars INT NOT NULL DEFAULT 0,
  extra_calendars INT NOT NULL DEFAULT 0,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_plan CHECK (plan IN ('free', 'lifetime', 'basic', 'pro')),
  CONSTRAINT non_negative_calendars CHECK (base_calendars >= 0 AND extra_calendars >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_billing_customer ON user_billing (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_billing_subscription ON user_billing (stripe_subscription_id);

ALTER TABLE user_billing ENABLE ROW LEVEL SECURITY;

-- Users can read their own billing row; only service_role writes.
CREATE POLICY "users_read_own_billing" ON user_billing
  FOR SELECT USING (auth.uid() = user_id);

-- Auto-create a free-tier billing row when a new user signs up.
CREATE OR REPLACE FUNCTION create_billing_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_billing (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_billing ON auth.users;
CREATE TRIGGER on_auth_user_created_billing
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_billing_on_signup();

-- Backfill any existing users who don't have a billing row yet.
INSERT INTO user_billing (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_billing)
ON CONFLICT DO NOTHING;

--
-- Idempotency table for Stripe webhooks (per rafter: dedupe on event.id).
-- Stripe re-delivers events on failure; without dedup we'd double-increment
-- quantity, double-credit refunds, etc.
--
CREATE TABLE IF NOT EXISTS processed_webhooks (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at
  ON processed_webhooks (processed_at DESC);

ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
-- Service role only. No client-side reads.
