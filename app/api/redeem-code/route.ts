import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/redeem-code
 *
 * Redeems an AppSumo lifetime code and grants the user the 'lifetime' plan
 * (base_calendars = 2). Follows rafter-secure-design guidance:
 *
 *   1. Uniform error message on all failure modes (invalid, used, revoked,
 *      malformed) — prevents attackers from enumerating valid codes via
 *      error probing.
 *   2. Rate limit: 5 failed attempts per user per hour. Brute-forcing the
 *      code space (30-char alphabet, 10 chars = 30^10 ≈ 5.9 × 10^14
 *      combinations) is infeasible, but rate limiting stops noise attempts
 *      from leaking timing information.
 *   3. Atomic single-transaction claim: UPDATE ... WHERE redeemed_by IS NULL
 *      RETURNING *. Zero rows returned means the code was already claimed —
 *      no TOCTOU window.
 *   4. Idempotent for the redeemer: if the same user re-submits their own
 *      already-redeemed code, we return success (don't punish double-clicks).
 *   5. Audit log entry for every attempt (success + failure) — retained
 *      indefinitely for chargeback defense.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_ERROR = 'That code is invalid or already redeemed.';

async function logEvent(
  userId: string | null,
  codeHash: string | null,
  codePrefix: string,
  result: 'success' | 'invalid' | 'already_used' | 'revoked' | 'rate_limited' | 'error',
  ip: string | null,
  userAgent: string | null,
) {
  await (supabaseAdmin as any)
    .from('redemption_events')
    .insert({
      user_id: userId,
      code_hash: codeHash,
      code_prefix: codePrefix.slice(0, 8),
      result,
      ip,
      user_agent: userAgent,
    });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in with Google before redeeming your code.' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    const body = await req.json().catch(() => ({}));
    const rawCode = (body?.code || '').toString().trim().toUpperCase();
    const codePrefix = rawCode.slice(0, 8);

    // Rate limit: block if this user has 5+ non-success attempts in the last hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentFailures } = await (supabaseAdmin as any)
      .from('redemption_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('result', 'success')
      .gte('attempted_at', oneHourAgo);

    if ((recentFailures || 0) >= 5) {
      await logEvent(user.id, null, codePrefix, 'rate_limited', ip, userAgent);
      return NextResponse.json(
        { error: 'Too many attempts. Please wait an hour and try again, or contact support.' },
        { status: 429 },
      );
    }

    // Reject obviously malformed input (uniform error to caller).
    if (!rawCode || rawCode.length < 5 || rawCode.length > 200) {
      await logEvent(user.id, null, codePrefix, 'invalid', ip, userAgent);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const codeHash = createHash('sha256').update(rawCode).digest('hex');

    // Check what state the code is in without granting yet — needed to
    // distinguish idempotent success ("same user re-submitting their own
    // code") from a race-condition claim.
    const { data: existing } = await (supabaseAdmin as any)
      .from('appsumo_codes')
      .select('redeemed_by, revoked_at')
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (!existing) {
      await logEvent(user.id, codeHash, codePrefix, 'invalid', ip, userAgent);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    if ((existing as any).revoked_at) {
      await logEvent(user.id, codeHash, codePrefix, 'revoked', ip, userAgent);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    if ((existing as any).redeemed_by === user.id) {
      // Same user re-submitting — idempotent success. Make sure their
      // billing row reflects lifetime in case anything got out of sync.
      await (supabaseAdmin as any)
        .from('user_billing')
        .upsert(
          {
            user_id: user.id,
            plan: 'lifetime',
            base_calendars: 2,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      return NextResponse.json({ success: true, alreadyRedeemed: true });
    }

    if ((existing as any).redeemed_by !== null) {
      await logEvent(user.id, codeHash, codePrefix, 'already_used', ip, userAgent);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    // Atomic claim. WHERE redeemed_by IS NULL AND revoked_at IS NULL means
    // this UPDATE only succeeds if the code is still redeemable — the DB
    // enforces the invariant, so a concurrent second request can't also win.
    const { data: claimed, error: claimError } = await (supabaseAdmin as any)
      .from('appsumo_codes')
      .update({
        redeemed_by: user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq('code_hash', codeHash)
      .is('redeemed_by', null)
      .is('revoked_at', null)
      .select();

    if (claimError || !claimed || claimed.length === 0) {
      // Lost the race — someone else claimed it between check and update.
      await logEvent(user.id, codeHash, codePrefix, 'already_used', ip, userAgent);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    // Grant lifetime plan. If they already had 'basic' or 'pro', lifetime
    // supersedes only the LTD entitlement — we don't cancel their Stripe sub
    // here (they'd have to do that themselves). Extra_calendars stays.
    await (supabaseAdmin as any)
      .from('user_billing')
      .upsert(
        {
          user_id: user.id,
          plan: 'lifetime',
          base_calendars: 2,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    await logEvent(user.id, codeHash, codePrefix, 'success', ip, userAgent);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('redeem-code error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again or contact support.' },
      { status: 500 },
    );
  }
}
