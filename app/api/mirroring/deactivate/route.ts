import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * POST /api/mirroring/deactivate
 * Stops all Google Calendar push notification watch channels for the user.
 */
export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active watch channels for this user
    const { data: activeChannels, error: channelsError } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .eq('user_id', user.id);

    if (channelsError) {
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
    }

    if (!activeChannels || activeChannels.length === 0) {
      return NextResponse.json({ error: 'No active mirroring to deactivate' }, { status: 400 });
    }

    console.log(`Deactivating ${activeChannels.length} watch channel(s) for user ${user.id}`);

    // Stop each watch channel
    for (const channel of activeChannels) {
      try {
        const auth = await googleAuth.getClientByAccountId(
          user.id,
          (channel as any).account_id
        );
        await googleCalendar.stopWatch(
          auth,
          (channel as any).channel_id,
          (channel as any).resource_id
        );
      } catch (err) {
        // Channel may already be expired; that's fine
        console.error(`Failed to stop channel ${(channel as any).channel_id}:`, err);
      }
    }

    // Delete channel records from database
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('watch_channels')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting channels from database:', deleteError);
    }

    console.log(`Mirroring deactivated, stopped ${activeChannels.length} channel(s)`);

    return NextResponse.json({
      success: true,
      channelsStopped: activeChannels.length,
    });
  } catch (error: any) {
    console.error('Error deactivating mirroring:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
