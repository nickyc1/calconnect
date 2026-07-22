import crypto from 'crypto';

/**
 * Symmetric encryption for OAuth tokens at rest.
 *
 * AES-256-GCM. Ciphertext format: [12-byte IV][16-byte auth tag][ciphertext].
 *
 * Keys live in REFRESH_TOKEN_ENCRYPTION_KEY_V{N} env vars, base64-encoded to
 * 32 raw bytes. To rotate, add a new version and switch the current-version
 * pointer below; existing rows keep their key_version so we can still decrypt
 * them until a background re-encrypt sweep flips them forward.
 *
 * Design notes:
 *  - Reads use decryptToken with the row's stored key_version so mixed-version
 *    tables work during rotation windows.
 *  - Writes use encryptToken with CURRENT_KEY_VERSION.
 *  - encryptTokenSafe never throws: during Day 1 dual-write we prefer to lose
 *    the ciphertext (leaves the encrypted column NULL) over blocking the
 *    plaintext write. Once we cut over to encrypted-preferred reads, callers
 *    should use encryptToken and fail-closed.
 */

const CURRENT_KEY_VERSION = 1;

function getKey(version: number): Buffer {
  const envName = `REFRESH_TOKEN_ENCRYPTION_KEY_V${version}`;
  const raw = process.env[envName];
  if (!raw) throw new Error(`Missing encryption key env var: ${envName}`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `${envName} must be 32 bytes when base64-decoded (got ${key.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return key;
}

export interface EncryptedToken {
  /** Raw ciphertext buffer: [12-byte IV][16-byte GCM tag][ciphertext]. */
  ciphertext: Buffer;
  /** Same ciphertext formatted for supabase-js / PostgREST BYTEA columns: '\x<hex>'. */
  ciphertextPg: string;
  keyVersion: number;
}

/** Format a Buffer for insertion into a Postgres BYTEA column via supabase-js. */
export function bufferToPgBytea(buf: Buffer): string {
  return '\\x' + buf.toString('hex');
}

/** Reverse of bufferToPgBytea — decode BYTEA column returned by supabase-js. */
export function pgByteaToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value !== 'string') {
    throw new Error(`Expected BYTEA string or Buffer, got ${typeof value}`);
  }
  // PostgREST returns BYTEA as '\x<hex>' by default.
  if (value.startsWith('\\x') || value.startsWith('\\X')) {
    return Buffer.from(value.slice(2), 'hex');
  }
  // Fallback: base64 (PostgREST alternate encoding).
  return Buffer.from(value, 'base64');
}

export function encryptToken(plaintext: string, version: number = CURRENT_KEY_VERSION): EncryptedToken {
  const key = getKey(version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertextPart = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const buf = Buffer.concat([iv, tag, ciphertextPart]);
  return {
    ciphertext: buf,
    ciphertextPg: bufferToPgBytea(buf),
    keyVersion: version,
  };
}

/**
 * Encrypt WITHOUT throwing. Used by Day 1 dual-write paths where a missing
 * env var or transient crypto error should NOT block the plaintext write.
 * Returns { ciphertext: null, keyVersion: null } on failure and logs a
 * warning so we can spot bad deploys before Day 2 cutover.
 */
export function encryptTokenSafe(
  plaintext: string | null | undefined,
): { ciphertextPg: string | null; keyVersion: number | null } {
  if (!plaintext) return { ciphertextPg: null, keyVersion: null };
  try {
    const { ciphertextPg, keyVersion } = encryptToken(plaintext);
    return { ciphertextPg, keyVersion };
  } catch (err: any) {
    console.warn('[token-crypto] encrypt failed, leaving ciphertext NULL:', err?.message || err);
    return { ciphertextPg: null, keyVersion: null };
  }
}

export function decryptToken(ciphertext: Buffer, keyVersion: number): string {
  const key = getKey(keyVersion);
  if (ciphertext.length < 12 + 16 + 1) {
    throw new Error(`Ciphertext too short (${ciphertext.length} bytes) — likely corrupted or misformatted.`);
  }
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const ct = ciphertext.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
