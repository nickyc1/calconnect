import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';

/**
 * GET /api/auth/google/connect
 * Redirects user to Google OAuth consent screen to connect a new calendar account.
 * State param carries the userId so callback can link the account.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check account limit (max 5)
    const { count } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (count && count >= 5) {
      return NextResponse.redirect(
        new URL('/dashboard?error=max_accounts', request.url)
      );
    }

    // Generate state token with userId for the callback
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      ts: Date.now(),
    })).toString('base64url');

    const authUrl = googleAuth.getAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Error initiating Google connect:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=connect_failed', request.url)
    );
  }
}
