import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * DELETE /api/accounts/[id]
 * Remove a connected Google Calendar account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = params.id;

    // Verify user owns this account
    const { data: account, error: fetchError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to you' },
        { status: 404 }
      );
    }

    // If this account has active watch channels, tear them down first so
    // Google stops pushing notifications for a calendar we're about to
    // forget about. We do NOT block the removal — mirroring on the user's
    // other calendars keeps running. Existing mirrored "Busy" blocks on
    // other calendars are left in place; the source event that spawned them
    // no longer exists to us, so they become static blocks the user can
    // clear manually if they want.
    const { data: activeChannels } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    if (activeChannels && activeChannels.length > 0) {
      for (const channel of activeChannels) {
        try {
          const auth = await googleAuth.getClientByAccountId(
            user.id,
            (channel as any).account_id,
          );
          await googleCalendar.stopWatch(
            auth,
            (channel as any).channel_id,
            (channel as any).resource_id,
          );
        } catch (err) {
          // Channel may already be expired or the token invalid — that's
          // fine, we still want to proceed with removal.
          console.error(
            `Failed to stop watch channel ${(channel as any).channel_id} during account removal:`,
            err,
          );
        }
      }
      await (supabaseAdmin as any)
        .from('watch_channels')
        .delete()
        .eq('account_id', accountId)
        .eq('user_id', user.id);
    }

    // Delete from database
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting account:', deleteError);
      return NextResponse.json({ error: 'Failed to remove account' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Account removed successfully' });
  } catch (error: any) {
    console.error('Error removing account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
