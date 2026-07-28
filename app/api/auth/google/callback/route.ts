import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { encryptTokenSafe } from '@/lib/token-crypto';

/**
 * GET /api/auth/google/callback
 * Handles the OAuth callback after user authorizes Google Calendar access.
 * Exchanges code for tokens, stores account in database.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(
        new URL('/dashboard?error=oauth_denied', request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard?error=missing_params', request.url)
      );
    }

    // Decode state to get userId
    let stateData: { userId: string; ts: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return NextResponse.redirect(
        new URL('/dashboard?error=invalid_state', request.url)
      );
    }

    // Verify state is not too old (10 min max)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/dashboard?error=expired_state', request.url)
      );
    }

    // Exchange code for tokens
    const { accessToken, refreshToken, expiryDate, email } =
      await googleAuth.exchangeCode(code);

    // Check if this email is already connected for this user
    const { data: existingAccount } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('id')
      .eq('user_id', stateData.userId)
      .eq('google_email', email)
      .single();

    if (existingAccount) {
      // Update existing account tokens; clear reauth flag if it was set.
      // Day 1 dual-write: plaintext (existing) + encrypted (new nullable columns).
      const encRefresh = encryptTokenSafe(refreshToken);
      const encAccess = encryptTokenSafe(accessToken);
      await (supabaseAdmin as any)
        .from('user_accounts')
        .update({
          refresh_token: refreshToken,
          access_token: accessToken,
          token_expiry: new Date(expiryDate).toISOString(),
          is_active: true,
          needs_reauth: false,
          reauth_flagged_at: null,
          refresh_token_encrypted: encRefresh.ciphertextPg,
          access_token_encrypted: encAccess.ciphertextPg,
          key_version: encRefresh.keyVersion,
        })
        .eq('id', (existingAccount as any).id);

      return NextResponse.redirect(
        new URL('/dashboard?success=account_updated', request.url)
      );
    }

    // Enforce plan calendar limits BEFORE inserting a new user_accounts row.
    // Per rafter-secure-design: the DB is the gatekeeper, Stripe is the reconciler.
    // We read entitlement + current count in a single flow; if a race lets a user
    // sneak through (very rare given OAuth latency), the next enable-mirroring
    // check will catch it.
    const { data: billing } = await (supabaseAdmin as any)
      .from('user_billing')
      .select('base_calendars, extra_calendars, plan')
      .eq('user_id', stateData.userId)
      .maybeSingle();

    const entitled = ((billing as any)?.base_calendars || 0) + ((billing as any)?.extra_calendars || 0);
    // Free tier gets 1 connected calendar for exploration (can't enable mirroring with only 1 anyway).
    // Free tier gets 2 calendars so users can experience the core mirroring
    // behavior without paying. Any additional connection requires an upgrade.
    const effectiveLimit = (billing as any)?.plan === 'free' || !billing ? Math.max(2, entitled) : entitled;

    const { count: currentCount } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', stateData.userId)
      .eq('is_active', true);

    if ((currentCount || 0) >= effectiveLimit) {
      return NextResponse.redirect(
        new URL('/dashboard?upgrade=needed&reason=calendar_limit', request.url)
      );
    }

    // Create new account record
    // Use email as the account_id (unique per user)
    const accountId = email;

    // Day 1 dual-write: plaintext (existing) + encrypted (new nullable columns).
    // encryptTokenSafe never throws — a missing key env just leaves the
    // encrypted columns NULL and reads still work off plaintext.
    const encRefresh = encryptTokenSafe(refreshToken);
    const encAccess = encryptTokenSafe(accessToken);

    const { error: insertError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .insert({
        user_id: stateData.userId,
        account_id: accountId,
        account_display_name: email,
        google_email: email,
        refresh_token: refreshToken,
        access_token: accessToken,
        token_expiry: new Date(expiryDate).toISOString(),
        is_active: true,
        is_source_account: false,
        refresh_token_encrypted: encRefresh.ciphertextPg,
        access_token_encrypted: encAccess.ciphertextPg,
        key_version: encRefresh.keyVersion,
      } as any);

    if (insertError) {
      console.error('Error storing account:', insertError);
      // Detect common failure modes and give the user a clear reason on the
      // dashboard error banner instead of a generic "store_failed."
      const code = (insertError as any)?.code;
      const message = ((insertError as any)?.message || '').toLowerCase();
      let reason = 'store_failed';
      if (code === '23505' || message.includes('duplicate') || message.includes('unique')) {
        // Unique constraint. In practice this means the same google_email is
        // already connected to this user (after migration 017 the constraint
        // is scoped per user_id).
        reason = 'already_connected';
      } else if (code === '23503' || message.includes('foreign')) {
        reason = 'user_not_found';
      }
      return NextResponse.redirect(
        new URL(`/dashboard?error=${reason}`, request.url),
      );
    }

    return NextResponse.redirect(
      new URL('/dashboard?success=account_connected', request.url)
    );
  } catch (error: any) {
    console.error('Error in Google callback:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=callback_failed', request.url)
    );
  }
}
