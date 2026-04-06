import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';
import { calendarSync } from '@/lib/calendar-sync';

/**
 * POST /api/webhook
 *
 * Receives Google Calendar push notifications.
 * Google sends headers (not body) to tell us something changed:
 *   X-Goog-Channel-ID: our channel ID
 *   X-Goog-Resource-ID: the resource being watched
 *   X-Goog-Resource-State: "sync" | "exists" | "not_exists"
 *
 * On "exists": use incremental sync (syncToken) to get changed events,
 * then process creates/updates/deletes.
 */
export async function POST(request: NextRequest) {
  try {
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');
    const resourceState = request.headers.get('x-goog-resource-state');

    // Validate this is a real Google push notification
    if (!channelId || !resourceState) {
      return NextResponse.json({ error: 'Missing Google headers' }, { status: 400 });
    }

    console.log(`Webhook: channel=${channelId} state=${resourceState}`);

    // "sync" is sent when the watch channel is first created -- just acknowledge
    if (resourceState === 'sync') {
      console.log('Watch channel sync confirmation received');
      return NextResponse.json({ received: true });
    }

    // Look up the watch channel to find the user/account
    const { data: channel, error: channelError } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .eq('channel_id', channelId)
      .single();

    if (channelError || !channel) {
      console.error('Unknown channel ID:', channelId);
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 });
    }

    const { user_id: userId, account_id: accountId, calendar_id: calendarId } = channel as any;

    // Get the sync token for incremental sync
    const currentSyncToken = (channel as any).sync_token || undefined;

    // Get authenticated client for this account
    const auth = await googleAuth.getClientByAccountId(userId, accountId);

    // Fetch changed events using incremental sync
    const { events: changedEvents, nextSyncToken } =
      await googleCalendar.listChangedEvents(auth, calendarId, currentSyncToken);

    // Store the new sync token for next time
    if (nextSyncToken) {
      await (supabaseAdmin as any)
        .from('watch_channels')
        .update({ sync_token: nextSyncToken } as any)
        .eq('channel_id', channelId);
    }

    if (changedEvents.length === 0) {
      console.log('No changed events in this notification');
      return NextResponse.json({ received: true, changes: 0 });
    }

    console.log(`Processing ${changedEvents.length} changed event(s) for user ${userId}`);

    // Get destination accounts (all except the source of this notification)
    const { data: allAccounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    const destAccounts = (allAccounts || []).filter(
      (a: any) => a.account_id !== accountId
    );

    // Process each changed event
    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const event of changedEvents) {
      try {
        const eventId = (event as any).id;
        if (!eventId) continue;

        // Skip mirror events (prevent infinite loops)
        if ((event as any).extendedProperties?.private?.calconnect_is_mirror === 'true') {
          continue;
        }

        // Handle cancelled/deleted events
        if ((event as any).status === 'cancelled') {
          await calendarSync.handleEventDeleted(
            userId,
            userId, // externalUserId is the same now
            eventId,
            calendarId
          );
          deleted++;
          continue;
        }

        // Check if this event already has a mapping (update vs create)
        const { data: existingMapping } = await (supabaseAdmin as any)
          .from('event_mappings')
          .select('*')
          .eq('user_id', userId)
          .eq('source_event_id', eventId)
          .eq('source_calendar_id', calendarId)
          .maybeSingle();

        if (existingMapping) {
          // Validate source account matches
          if ((existingMapping as any).source_account_id !== accountId) {
            continue; // Skip sync events from other accounts
          }

          await calendarSync.updateMirrorEvents(
            userId,
            eventId,
            calendarId,
            event
          );
          updated++;
        } else {
          // New event -- create mirrors
          if (destAccounts.length > 0) {
            await calendarSync.createMirrorEvents(
              userId,
              accountId,
              calendarId,
              event,
              destAccounts
            );
            created++;
          }
        }
      } catch (eventError: any) {
        console.error(`Error processing event ${(event as any).id}:`, eventError.message);
      }
    }

    console.log(`Webhook processed: ${created} created, ${updated} updated, ${deleted} deleted`);

    return NextResponse.json({
      received: true,
      processed: changedEvents.length,
      created,
      updated,
      deleted,
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { received: true, error: error.message },
      { status: 500 }
    );
  }
}
