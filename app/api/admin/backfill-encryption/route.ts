import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptToken, decryptToken } from '@/lib/token-crypto';

/**
 * POST /api/admin/backfill-encryption
 *
 * Day 2 of the encryption rollout: encrypt existing plaintext OAuth tokens
 * into the *_encrypted BYTEA columns. Idempotent — only touches rows where
 * the encrypted column is currently NULL. Safe to run multiple times.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` header. The secret
 * lives in Vercel env, never in the codebase. Public callers get 401.
 *
 * Preflight: encrypts+decrypts a known string to prove the encryption key
 * env var is set correctly BEFORE touching any rows. If preflight fails,
 * returns a diagnostic and aborts — no partial writes.
 *
 * Response shape:
 *   { ok: true, processed, encrypted, skipped, errors: [{ id, reason }] }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  // Auth: bearer token match against CRON_SECRET
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Preflight: prove the encryption key works before touching any rows.
  try {
    const canary = 'canary-' + Date.now();
    const { ciphertext, keyVersion } = encryptToken(canary);
    const decoded = decryptToken(ciphertext, keyVersion);
    if (decoded !== canary) {
      return NextResponse.json(
        { error: 'Preflight failed: encryption round-trip did not match. Aborting to protect data.' },
        { status: 500 },
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Preflight failed: encryption key is not usable. Aborting to protect data.',
        detail: err?.message || String(err),
        hint: 'Verify REFRESH_TOKEN_ENCRYPTION_KEY_V1 is set in Vercel env, is 32 bytes base64-encoded, and the deployment picked it up (redeploy after adding the var).',
      },
      { status: 500 },
    );
  }

  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  // Loop until no more rows need backfill. Each iteration handles up to
  // BATCH_SIZE rows to keep individual queries small.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: batch, error } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('id, refresh_token, access_token')
      .is('refresh_token_encrypted', null)
      .not('refresh_token', 'is', null)
      .limit(BATCH_SIZE);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch rows for backfill', detail: error.message, processed, encrypted, skipped, errors },
        { status: 500 },
      );
    }
    if (!batch || batch.length === 0) break;

    for (const row of batch as any[]) {
      processed++;
      try {
        const encRefresh = row.refresh_token ? encryptToken(row.refresh_token) : null;
        const encAccess = row.access_token ? encryptToken(row.access_token) : null;

        // If both are null, nothing to encrypt — skip so we don't set key_version needlessly.
        if (!encRefresh && !encAccess) {
          skipped++;
          continue;
        }

        const patch: Record<string, any> = {
          refresh_token_encrypted: encRefresh?.ciphertextPg ?? null,
          access_token_encrypted: encAccess?.ciphertextPg ?? null,
          key_version: (encRefresh || encAccess)!.keyVersion,
        };

        const { error: updateError } = await (supabaseAdmin as any)
          .from('user_accounts')
          .update(patch)
          .eq('id', row.id)
          .is('refresh_token_encrypted', null); // idempotency guard

        if (updateError) {
          errors.push({ id: row.id, reason: updateError.message });
        } else {
          encrypted++;
        }
      } catch (err: any) {
        errors.push({ id: row.id, reason: err?.message || String(err) });
      }
    }

    // Safety: if we processed a full batch and made no progress, break to
    // avoid infinite loop on a stuck row.
    if (batch.length < BATCH_SIZE) break;
  }

  return NextResponse.json({ ok: true, processed, encrypted, skipped, errors });
}
