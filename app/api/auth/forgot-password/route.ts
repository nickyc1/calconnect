import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/forgot-password
 *
 * Handles the "forgot password" flow with a Google-signup detection twist:
 * if the email belongs to a user who ONLY has a Google identity (no
 * email/password identity), we tell the client to redirect them to the
 * Google sign-in button instead of sending a reset email that will never
 * arrive at a login mechanism they can use.
 *
 * If the email doesn't exist in auth.users, we still respond as if we sent
 * the email — prevents email enumeration attacks.
 *
 * Response shape:
 *   { result: 'use_google' }    → user only has Google identity
 *   { result: 'email_sent' }    → we triggered a reset email (or pretended to)
 *   { result: 'error', ... }    → 4xx/5xx
 *
 * Body: { email: string }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = (body?.email || '').toString().trim().toLowerCase();

    // Loose email validation — we don't reveal invalid vs unknown to the client.
    if (!rawEmail || rawEmail.length < 3 || rawEmail.length > 320 || !rawEmail.includes('@')) {
      return NextResponse.json({ result: 'error', error: 'Enter a valid email.' }, { status: 400 });
    }

    // Look up whether this email exists and what identities it has. We use
    // listUsers() and filter in-memory — fine at CalConnect's scale (< a few
    // thousand users). Swap to a Postgres RPC if this ever gets slow.
    let user: any = null;
    try {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      user = data.users.find((u: any) => (u.email || '').toLowerCase() === rawEmail) || null;
    } catch (err: any) {
      console.error('forgot-password listUsers failed:', err?.message || err);
      // Fall through — we'll respond as if the email was sent to avoid leaking state.
    }

    if (user) {
      // Supabase reports "how did this user sign up" in two places:
      //   - user.app_metadata.provider  (the FIRST/primary auth method)
      //   - user.app_metadata.providers (all providers used, sometimes)
      //   - user.identities             (per-provider identity rows)
      // For Google OAuth signups Supabase often auto-populates BOTH a
      // 'google' identity AND an 'email' identity (because Google returns
      // a verified email), which broke our earlier `has google AND not
      // email` check. The reliable signal is the PRIMARY provider — if
      // that's 'google', they signed up via Google and either never set
      // a password or set one later (in which case reset still works).
      // We use the primary-provider check to route Google-primary users
      // to the sign-in-with-Google button.
      const primaryProvider: string | undefined = user.app_metadata?.provider;
      const identityProviders: string[] = (user.identities || []).map((i: any) => i.provider);

      console.log('[forgot-password] user lookup', {
        email: rawEmail,
        primary_provider: primaryProvider,
        providers_meta: user.app_metadata?.providers,
        identity_providers: identityProviders,
      });

      if (primaryProvider === 'google') {
        return NextResponse.json({ result: 'use_google' });
      }
    }

    // Trigger a real reset email via Supabase Auth. We use a fresh anon
    // client for this because the admin client's generateLink doesn't send
    // an email — only returns a URL. resetPasswordForEmail on the anon
    // client actually sends via Supabase's SMTP.
    const supabaseAnon = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const origin =
      req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io';

    // Fire and forget. Supabase silently no-ops if the email doesn't exist,
    // which is exactly the behavior we want (no enumeration leak).
    await supabaseAnon.auth.resetPasswordForEmail(rawEmail, {
      redirectTo: `${origin}/reset-password`,
    });

    return NextResponse.json({ result: 'email_sent' });
  } catch (err: any) {
    console.error('forgot-password error:', err);
    // Still respond as-if-sent so attackers can't tell errors from unknowns.
    return NextResponse.json({ result: 'email_sent' });
  }
}
