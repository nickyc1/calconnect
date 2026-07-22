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

    // Set up watch channels for every source in parallel. Sequential loops
    // over 3+ sources hit ~10s each because every source triggers a Google
    // OAuth token refresh + a watch API call + an initial-sync fetch. Running
    // in parallel drops enable-mirroring latency to the slowest single account
    // (usually 3-8s), not the sum.
    type WatchOutcome =
      | { ok: true; record: any; displayName: string }
      | { ok: false; displayName: string; error: any };

    const outcomes: WatchOutcome[] = await Promise.all(
      sourceAccounts.map(async (sourceAccount: any): Promise<WatchOutcome> => {
        const displayName =
          sourceAccount.account_display_name || sourceAccount.account_id;
        try {
          const auth = await googleAuth.getClientByAccountId(
            user.id,
            sourceAccount.account_id,
          );

          // Set up push notification watch channel + initial sync token in
          // parallel — they don't depend on each other and both add latency.
          const [watchResult, syncResult] = await Promise.all([
            googleCalendar.watchCalendar(auth, 'primary', webhookUrl),
            googleCalendar.listChangedEvents(auth, 'primary'),
          ]);

          console.log(`Watch channel created for ${displayName}`);
          return {
            ok: true,
            displayName,
            record: {
              user_id: user.id,
              account_id: sourceAccount.account_id,
              calendar_id: 'primary',
              channel_id: watchResult.channelId,
              resource_id: watchResult.resourceId,
              expiration: watchResult.expiration,
              webhook_url: webhookUrl,
              sync_token: syncResult.nextSyncToken,
            },
          };
        } catch (err) {
          console.error(
            `Error creating watch for account ${sourceAccount.account_id}:`,
            err,
          );
          return { ok: false, displayName, error: err };
        }
      }),
    );

    const failures = outcomes.filter((o): o is Extract<WatchOutcome, { ok: false }> => !o.ok);
    const successes = outcomes.filter((o): o is Extract<WatchOutcome, { ok: true }> => o.ok);

    // If any account failed, tear down the ones that succeeded so we don't
    // leave a partial mirroring config running. Cleanups also in parallel.
    if (failures.length > 0) {
      await Promise.all(
        successes.map(async (s) => {
          try {
            const cleanupAuth = await googleAuth.getClientByAccountId(
              user.id,
              s.record.account_id,
            );
            await googleCalendar.stopWatch(
              cleanupAuth,
              s.record.channel_id,
              s.record.resource_id,
            );
          } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
          }
        }),
      );

      return NextResponse.json(
        {
          error: `Failed to set up watch for account ${failures[0].displayName}`,
        },
        { status: 500 },
      );
    }

    const channelRecords = successes.map((s) => s.record);

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
