import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { pipedream } from '@/lib/pipedream';
import { calendarSync } from '@/lib/calendar-sync';

export async function POST(request: NextRequest) {
  try {
    // Extract metadata from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const accountId = searchParams.get('accountId');
    const calendarId = searchParams.get('calendarId');

    if (!userId || !accountId || !calendarId) {
      console.error('Missing required query parameters');
      return NextResponse.json({
        error: 'Missing userId, accountId, or calendarId in query parameters'
      }, { status: 400 });
    }

    // Parse the raw Google Calendar event payload
    const event = await request.json();

    console.log('Webhook received:', JSON.stringify(event, null, 2));
    console.log('Metadata from query params:', { userId, accountId, calendarId });

    // Log webhook event for debugging
    await (supabaseAdmin as any).from('webhook_events').insert({
      event_type: 'calendar_event',
      payload: event,
      processed: false
    });

    const eventId = event.id;

    if (!eventId) {
      console.warn('No event ID in payload');
      return NextResponse.json({ received: true });
    }

    // Fetch full event details from Google Calendar
    let sourceEvent;
    try {
      sourceEvent = await pipedream.getCalendarEvent(
        userId,
        accountId,
        calendarId,
        eventId
      );
    } catch (error: any) {
      // 404 or 410 means event was deleted
      if (error.status === 404 || error.status === 410) {
        console.log(`Event ${eventId} deleted (${error.status}), processing deletion`);
        await calendarSync.handleEventDeleted(userId, userId, eventId, calendarId);
        return NextResponse.json({ received: true, processed: true, action: 'deleted' });
      }
      throw error; // Re-throw other errors
    }

    // Check if event was cancelled (soft delete)
    if ((sourceEvent as any).status === 'cancelled') {
      console.log(`Event ${eventId} cancelled, processing deletion`);
      await calendarSync.handleEventDeleted(userId, userId, eventId, calendarId);
      return NextResponse.json({ received: true, processed: true, action: 'deleted' });
    }

    // Skip if this is already a mirror event
    if ((sourceEvent as any).extendedProperties?.private?.mircal_is_mirror === 'true') {
      console.log('Skipping mirror event');
      return NextResponse.json({ received: true, skipped: 'mirror_event' });
    }

    // Get user's destination accounts
    const { data: destAccounts, error: accountsError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('account_id', accountId); // Exclude source account

    console.log(`Found ${destAccounts?.length || 0} destination account(s) for user ${userId}`);

    if (accountsError || !destAccounts || destAccounts.length === 0) {
      console.log(`No destination accounts found for user ${userId}. Source account: ${accountId}. User needs to connect additional accounts to enable mirroring.`);
      return NextResponse.json({
        received: true,
        skipped: 'no_destinations',
        message: 'No destination accounts configured. Connect at least 2 accounts to enable mirroring.'
      });
    }

    // Check if this is a new event or an update
    const { data: existingMapping } = await supabaseAdmin
      .from('event_mappings')
      .select('id')
      .eq('user_id', userId)
      .eq('source_event_id', eventId)
      .eq('source_calendar_id', calendarId)
      .maybeSingle();

    let result;
    if (existingMapping) {
      // Event exists - this is an update
      console.log(`Event ${eventId} exists, processing as update`);
      result = await calendarSync.updateMirrorEvents(
        userId,
        eventId,
        calendarId,
        sourceEvent
      );
    } else {
      // New event - create mirrors
      console.log(`Event ${eventId} is new, creating mirrors`);
      result = await calendarSync.createMirrorEvents(
        userId,
        accountId,
        calendarId,
        sourceEvent,
        destAccounts
      );
    }

    // Mark webhook as processed
    await (supabaseAdmin as any)
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('payload->event->id', eventId);

    return NextResponse.json({
      received: true,
      processed: true,
      mirrors_created: result.successful.length,
      mirrors_failed: result.failed.length
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { received: true, error: error.message },
      { status: 500 }
    );
  }
}
