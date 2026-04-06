import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * POST /api/mirroring/activate
 * Sets up Google Calendar push notification watch channels for each source account.
 */
export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for existing active watch channels
    const { data: existingChannels } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existingChannels && existingChannels.length > 0) {
      return NextResponse.json({
        error: 'Mirroring is already active',
      }, { status: 400 });
    }

    // Get ALL source accounts
    const { data: sourceAccounts, error: sourceError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_source_account', true);

    if (sourceError || !sourceAccounts || sourceAccounts.length === 0) {
      return NextResponse.json({
        error: 'No source accounts selected. Select at least one source account.',
      }, { status: 400 });
    }

    // Validate we have at least 2 total accounts
    const { data: allAccounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!allAccounts || allAccounts.length < 2) {
      return NextResponse.json({
        error: 'Need at least 2 accounts to enable mirroring',
      }, { status: 400 });
    }

    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook`;
    const channelRecords: any[] = [];

    // Set up watch channels for each source account
    for (const sourceAccount of sourceAccounts) {
      try {
        const auth = await googleAuth.getClientByAccountId(
          user.id,
          (sourceAccount as any).account_id
        );

        // Set up push notification watch channel
        const watchResult = await googleCalendar.watchCalendar(
          auth,
          'primary',
          webhookUrl
        );

        // Do an initial sync to get the sync token
        const { nextSyncToken } = await googleCalendar.listChangedEvents(
          auth,
          'primary'
        );

        channelRecords.push({
          user_id: user.id,
          account_id: (sourceAccount as any).account_id,
          calendar_id: 'primary',
          channel_id: watchResult.channelId,
          resource_id: watchResult.resourceId,
          expiration: watchResult.expiration,
          webhook_url: webhookUrl,
          sync_token: nextSyncToken,
        });

        console.log(
          `Watch channel created for ${(sourceAccount as any).account_display_name || (sourceAccount as any).account_id}`
        );
      } catch (deployError: any) {
        console.error(
          `Error creating watch for account ${(sourceAccount as any).account_id}:`,
          deployError
        );

        // Clean up any channels created so far
        for (const record of channelRecords) {
          try {
            const cleanupAuth = await googleAuth.getClientByAccountId(
              user.id,
              record.account_id
            );
            await googleCalendar.stopWatch(
              cleanupAuth,
              record.channel_id,
              record.resource_id
            );
          } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
          }
        }

        return NextResponse.json({
          error: `Failed to set up watch for account ${(sourceAccount as any).account_display_name}`,
        }, { status: 500 });
      }
    }

    // Store all channel records in database
    const { error: insertError } = await (supabaseAdmin as any)
      .from('watch_channels')
      .insert(channelRecords);

    if (insertError) {
      console.error('Error storing watch channels:', insertError);
      return NextResponse.json(
        { error: 'Failed to save watch configuration' },
        { status: 500 }
      );
    }

    console.log(
      `Mirroring activated: ${sourceAccounts.length} source(s), ${channelRecords.length} watch channel(s)`
    );

    return NextResponse.json({
      success: true,
      sourceAccountsCount: sourceAccounts.length,
      watchChannelsCreated: channelRecords.length,
    });
  } catch (error: any) {
    console.error('Error activating mirroring:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
