-- 019_backfill_canceling_state.sql
--
-- Adds 'canceling' to the backfill_status CHECK constraint. This state is set
-- when a cancel is initiated but the chunked cleanup (Google API deletes for
-- every via_backfill mirror) is still in progress. Without this, force-stop
-- and chunked-disable both fail with a check constraint violation.

ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS backfill_status_valid;

ALTER TABLE user_accounts
  ADD CONSTRAINT backfill_status_valid
  CHECK (backfill_status IN ('idle', 'running', 'canceling', 'complete', 'failed', 'canceled'));
