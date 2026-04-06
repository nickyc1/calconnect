import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * GET /api/cron/renew-watches
 * Vercel Cron job: renews Google Calendar watch channels expiring in the next 24 hours.
 * Google watch channels expire after ~7 days max.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron call (Vercel sets this header)
    const authHeader = request.headers.get('authorization');
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Find channels expiring in the next 24 hours
    const { data: expiringChannels, error } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .lt('expiration', tomorrow);

    if (error) {
      console.error('Error fetching expiring channels:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!expiringChannels || expiringChannels.length === 0) {
      return NextResponse.json({ renewed: 0, message: 'No channels need renewal' });
    }

    console.log(`Renewing ${expiringChannels.length} expiring watch channel(s)`);

    let renewed = 0;
    let failed = 0;

    for (const channel of expiringChannels) {
      try {
        const ch = channel as any;
        const auth = await googleAuth.getClientByAccountId(ch.user_id, ch.account_id);

        // Stop the old channel (may already be expired, that's fine)
        try {
          await googleCalendar.stopWatch(auth, ch.channel_id, ch.resource_id);
        } catch {
          // Ignore errors stopping expired channels
        }

        // Create a new watch channel
        const watchResult = await googleCalendar.watchCalendar(
          auth,
          ch.calendar_id,
          ch.webhook_url
        );

        // Update the database record
        await (supabaseAdmin as any)
          .from('watch_channels')
          .update({
            channel_id: watchResult.channelId,
            resource_id: watchResult.resourceId,
            expiration: watchResult.expiration,
          })
          .eq('id', ch.id);

        renewed++;
        console.log(`Renewed channel for account ${ch.account_id}`);
      } catch (err) {
        failed++;
        console.error(`Failed to renew channel ${(channel as any).channel_id}:`, err);
      }
    }

    return NextResponse.json({ renewed, failed });
  } catch (error: any) {
    console.error('Cron renew-watches error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
