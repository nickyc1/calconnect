import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';

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
      await (supabaseAdmin as any)
        .from('user_accounts')
        .update({
          refresh_token: refreshToken,
          access_token: accessToken,
          token_expiry: new Date(expiryDate).toISOString(),
          is_active: true,
          needs_reauth: false,
          reauth_flagged_at: null,
        })
        .eq('id', (existingAccount as any).id);

      return NextResponse.redirect(
        new URL('/dashboard?success=account_updated', request.url)
      );
    }

    // Create new account record
    // Use email as the account_id (unique per user)
    const accountId = email;

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
      } as any);

    if (insertError) {
      console.error('Error storing account:', insertError);
      return NextResponse.redirect(
        new URL('/dashboard?error=store_failed', request.url)
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
