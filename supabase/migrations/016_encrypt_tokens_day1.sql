-- Migration 016: Refresh token encryption at rest — Day 1 (schema only)
--
-- Day 1 is intentionally the lowest-risk step of the multi-day rollout:
--   * Add nullable columns for the ciphertext + key version
--   * Application code will dual-write (plaintext + encrypted) in the next
--     deploy; reads still go through the existing plaintext column
--   * If encryption fails at write time (e.g. missing env var), the plaintext
--     write still succeeds and the encrypted column is left NULL
--
-- Day 2 (later this week): backfill existing rows, flip read path to encrypted
-- Day 3: drop plaintext columns
--
-- Ciphertext format (Node-side AES-256-GCM, chosen over pgcrypto for
-- app-code simplicity — security properties are equivalent for our threat
-- model per the rafter-secure-design brief):
--   [12-byte IV][16-byte GCM auth tag][ciphertext bytes]
--
-- Key comes from REFRESH_TOKEN_ENCRYPTION_KEY_V{N} env vars, base64-decoded
-- to 32 raw bytes. key_version selects which key to use for decrypt.

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted BYTEA;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS access_token_encrypted BYTEA;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS key_version SMALLINT;

COMMENT ON COLUMN user_accounts.refresh_token_encrypted IS
  'AES-256-GCM ciphertext of refresh_token. Format: [12-byte IV][16-byte GCM tag][ciphertext]. Nullable during Day 1 dual-write; NOT NULL enforced in Day 3 cutover.';

COMMENT ON COLUMN user_accounts.access_token_encrypted IS
  'AES-256-GCM ciphertext of access_token. Same format as refresh_token_encrypted.';

COMMENT ON COLUMN user_accounts.key_version IS
  'Version of REFRESH_TOKEN_ENCRYPTION_KEY_V{N} used to encrypt this row. Enables key rotation without re-encrypting every row at once.';
