import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * POST /api/account/delete
 *
 * Self-service account deletion. Ordered teardown per rafter-secure-design:
 *   1. Confirm session + typed email match
 *   2. Stop every active Google watch channel (must happen BEFORE token revocation
 *      because channels.stop requires a valid auth client)
 *   3. Revoke each Google refresh token
 *   4. Write immutable tombstone to deletion_events
 *   5. Delete auth.users row — every user-owned table cascades via ON DELETE CASCADE
 *
 * Errors during step 2/3 are logged but don't block the delete: an orphaned
 * watch channel that fails to stop still expires within 7 days on Google's side.
 * The tombstone records how many succeeded so support can reconcile if needed.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const typedEmail: string | undefined = body?.confirmEmail;

    if (!typedEmail || typedEmail.toLowerCase() !== (user.email || '').toLowerCase()) {
      return NextResponse.json(
        { error: 'Email confirmation does not match your account email.' },
        { status: 400 }
      );
    }

    const userIdHash = createHash('sha256').update(user.id).digest('hex');
    const emailHash = createHash('sha256').update((user.email || '').toLowerCase()).digest('hex');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Write tombstone up-front (initiated). Completed_at gets set at the end.
    const { data: tombstone, error: tombstoneError } = await (supabaseAdmin as any)
      .from('deletion_events')
      .insert({
        user_id_hash: userIdHash,
        email_hash: emailHash,
        ip,
        user_agent: userAgent,
        reason: body?.reason || null,
      })
      .select('id')
      .single();

    if (tombstoneError) {
      console.error('deletion_events insert failed', tombstoneError);
      return NextResponse.json({ error: 'Failed to initiate deletion' }, { status: 500 });
    }

    // Step 2: stop all watch channels
    const { data: channels } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .eq('user_id', user.id);

    let stopped = 0;
    let failed = 0;
    for (const channel of (channels || [])) {
      try {
        const auth = await googleAuth.getClientByAccountId(user.id, (channel as any).account_id);
        await googleCalendar.stopWatch(auth, (channel as any).channel_id, (channel as any).resource_id);
        stopped += 1;
      } catch (err) {
        failed += 1;
        console.error(`delete: failed to stop channel ${(channel as any).channel_id}`, err);
      }
    }

    // Step 3: revoke refresh tokens for every connected account
    const { data: accounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('refresh_token, account_id')
      .eq('user_id', user.id);

    let tokensRevoked = 0;
    for (const acct of (accounts || [])) {
      const token = (acct as any).refresh_token;
      if (!token) continue;
      try {
        const revokeRes = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
        });
        if (revokeRes.ok) tokensRevoked += 1;
      } catch (err) {
        console.error(`delete: failed to revoke token for account ${(acct as any).account_id}`, err);
      }
    }

    // Step 4: update tombstone with results
    await (supabaseAdmin as any)
      .from('deletion_events')
      .update({
        completed_at: new Date().toISOString(),
        channels_stopped: stopped,
        channels_failed: failed,
        tokens_revoked: tokensRevoked,
      })
      .eq('id', (tombstone as any).id);

    // Step 5: delete auth.users → cascades every user-owned row
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      console.error('delete: auth.users delete failed', authDeleteError);
      return NextResponse.json(
        { error: 'Partial deletion: some data may remain. Contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      channelsStopped: stopped,
      channelsFailed: failed,
      tokensRevoked,
    });
  } catch (error: any) {
    console.error('delete: unexpected error', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
