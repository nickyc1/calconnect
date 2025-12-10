import { NextRequest, NextResponse } from 'next/server';
import { pipedream } from '@/lib/pipedream';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { userId, accountId, calendarId } = await request.json();

    if (!userId || !accountId || !calendarId) {
      return NextResponse.json(
        { error: 'userId, accountId, and calendarId are required' },
        { status: 400 }
      );
    }

    // Construct webhook URL with metadata as query parameters
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook?userId=${encodeURIComponent(userId)}&accountId=${encodeURIComponent(accountId)}&calendarId=${encodeURIComponent(calendarId)}`;

    console.log('Deploying sources:', { userId, accountId, calendarId, webhookUrl });

    // Deploy BOTH sources: instant (create/update) and polling (delete)
    const instantSource = await pipedream.deploySource(
      userId,
      accountId,
      calendarId,
      webhookUrl
    );

    console.log('Instant source deployed:', instantSource.data.id);

    const cancelledSource = await pipedream.deployCancelledEventSource(
      userId,
      accountId,
      calendarId,
      webhookUrl,
      300 // Poll every 5 minutes
    );

    console.log('Cancelled source deployed:', cancelledSource.data.id);

    // Store both sources in database
    const sourcesToInsert = [
      {
        user_id: userId,
        account_id: accountId,
        source_id: instantSource.data.id,
        calendar_id: calendarId,
        webhook_url: webhookUrl,
        is_active: true,
        source_type: 'instant'
      },
      {
        user_id: userId,
        account_id: accountId,
        source_id: cancelledSource.data.id,
        calendar_id: calendarId,
        webhook_url: webhookUrl,
        is_active: true,
        source_type: 'cancelled'
      }
    ];

    const { data, error } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .insert(sourcesToInsert)
      .select();

    if (error) {
      console.error('Error storing sources:', error);
      // Try to clean up both deployed sources
      try {
        await pipedream.deleteSource(instantSource.data.id, userId);
        await pipedream.deleteSource(cancelledSource.data.id, userId);
      } catch (cleanupError) {
        console.error('Error cleaning up sources:', cleanupError);
      }
      return NextResponse.json(
        { error: 'Failed to store source configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sources: data
    });
  } catch (error: any) {
    console.error('Error deploying source:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deploy source' },
      { status: 500 }
    );
  }
}
