import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/validate-code
 *
 * Pre-check whether an AppSumo code is valid without claiming it. Used on the
 * /redeem page before we ask a new visitor to create an account — so we can
 * bounce bad codes before making them sign up.
 *
 * Race note: between validate and the actual claim in /api/redeem-code,
 * another user could theoretically win the race. That's fine — the claim
 * endpoint does the atomic UPDATE with WHERE redeemed_by IS NULL, so at most
 * one user ever wins. Validate is a UX pre-check, not the security boundary.
 *
 * Uniform error message so attackers can't distinguish "code exists but used"
 * from "code doesn't exist" via error probing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_ERROR = 'That code is invalid or already redeemed.';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawCode = (body?.code || '').toString().trim().toUpperCase();

    if (!rawCode || rawCode.length < 5 || rawCode.length > 200) {
      return NextResponse.json({ valid: false, error: GENERIC_ERROR }, { status: 400 });
    }

    const codeHash = createHash('sha256').update(rawCode).digest('hex');

    const { data: existing } = await (supabaseAdmin as any)
      .from('appsumo_codes')
      .select('redeemed_by, revoked_at')
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (!existing || (existing as any).redeemed_by || (existing as any).revoked_at) {
      return NextResponse.json({ valid: false, error: GENERIC_ERROR }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch (err: any) {
    console.error('validate-code error:', err);
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500 });
  }
}
