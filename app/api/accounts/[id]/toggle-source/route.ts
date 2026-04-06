import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * POST /api/accounts/[id]/toggle-source
 * Toggle an account's source status. If mirroring is active,
 * dynamically creates or stops watch channels.
 */
export async function POST(
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
    const body = await request.json();
    const { isSource } = body;

    if (typeof isSource !== 'boolean') {
      return NextResponse.json({ error: 'isSource must be a boolean' }, { status: 400 });
    }

    // Verify user owns this account
    const { data: account, error: accountError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check if mirroring is currently active
    const { data: activeChannels } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('id, account_id')
      .eq('user_id', user.id)
      .limit(1);

    const mirroringActive = activeChannels && activeChannels.length > 0;

    // Update the source status
    const { error: updateError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ is_source_account: isSource })
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to toggle source status' }, { status: 500 });
    }

    // If mirroring is active, dynamically add/remove watch channels
    if (mirroringActive) {
      if (isSource) {
        try {
          const auth = await googleAuth.getClientByAccountId(user.id, accountId);
          const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook`;

          const watchResult = await googleCalendar.watchCalendar(auth, 'primary', webhookUrl);
          const { nextSyncToken } = await googleCalendar.listChangedEvents(auth, 'primary');

          await (supabaseAdmin as any)
            .from('watch_channels')
            .insert({
              user_id: user.id,
              account_id: accountId,
              calendar_id: 'primary',
              channel_id: watchResult.channelId,
              resource_id: watchResult.resourceId,
              expiration: watchResult.expiration,
              webhook_url: webhookUrl,
              sync_token: nextSyncToken,
            } as any);

          console.log(`Watch channel created for newly enabled source: ${accountId}`);
        } catch (deployError) {
          console.error('Error creating watch for new source:', deployError);
          // Revert
          await (supabaseAdmin as any)
            .from('user_accounts')
            .update({ is_source_account: false })
            .eq('account_id', accountId);

          return NextResponse.json({ error: 'Failed to set up watch for this account' }, { status: 500 });
        }
      } else {
        // Remove watch channels for this account
        try {
          const { data: channelsToRemove } = await (supabaseAdmin as any)
            .from('watch_channels')
            .select('*')
            .eq('user_id', user.id)
            .eq('account_id', accountId);

          if (channelsToRemove && channelsToRemove.length > 0) {
            for (const ch of channelsToRemove) {
              try {
                const auth = await googleAuth.getClientByAccountId(user.id, accountId);
                await googleCalendar.stopWatch(auth, (ch as any).channel_id, (ch as any).resource_id);
              } catch {
                // Channel may be expired
              }
            }

            await (supabaseAdmin as any)
              .from('watch_channels')
              .delete()
              .eq('user_id', user.id)
              .eq('account_id', accountId);

            console.log(`Watch channels removed for disabled source: ${accountId}`);
          }
        } catch (removeError) {
          console.error('Error removing watch channels:', removeError);
        }
      }
    }

    return NextResponse.json({ success: true, isSource });
  } catch (error: any) {
    console.error('Error toggling source account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
