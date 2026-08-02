import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';
import { CalendarSyncService } from '@/lib/calendar-sync';

/**
 * Pro-only backfill: mirror events that already exist on a source calendar.
 *
 * Contract:
 *   POST { accountId, action: 'enable' }  → set enabled=true, run first chunk
 *   POST { accountId, action: 'tick' }    → process next chunk, return progress
 *   POST { accountId, action: 'disable' } → delete via_backfill mirrors, set enabled=false
 *   GET  ?accountId=X                     → current status (poll this every 2-3s)
 *
 * Chunked processing (max 50 events per tick) keeps each request under
 * Vercel's function timeout while giving the client real-time progress.
 *
 * Idempotency:
 *   - event_mappings has UNIQUE(user_id, source_event_id, source_calendar_id)
 *   - createMirrorEvents skips events with an existing mapping
 *   - Rerunning the backfill is safe (won't create duplicates)
 *
 * Cancellation:
 *   - action:'disable' sets status='canceled' and deletes via_backfill mirrors
 *   - Any in-flight tick completes but future ticks are rejected
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK_SIZE = 50;
// 5-year horizon for backfill. Anything past that is unlikely to be a real
// event that needs a Busy block; keeps runtime bounded for wild recurring rules.
const HORIZON_YEARS = 5;

const syncService = new CalendarSyncService();

async function requirePro(userId: string): Promise<boolean> {
  const { data } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as any)?.plan === 'pro';
}

async function getSourceAccount(userId: string, accountId: string) {
  const { data } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('id, account_id, google_email, is_active, is_source_account, backfill_status, backfill_progress, backfill_total, backfill_cursor, backfill_started_at, mirror_existing_enabled')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .maybeSingle();
  return data;
}

async function getDestAccounts(userId: string, excludeAccountId: string) {
  const { data } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id, google_email, is_active, mirror_color_id, mirror_label')
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('account_id', excludeAccountId);
  return (data as any[]) || [];
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const acct = await getSourceAccount(user.id, accountId);
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  return NextResponse.json({
    enabled: (acct as any).mirror_existing_enabled,
    status: (acct as any).backfill_status,
    progress: (acct as any).backfill_progress,
    total: (acct as any).backfill_total,
    startedAt: (acct as any).backfill_started_at,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId: string | undefined = body?.accountId;
  const action: string | undefined = body?.action;
  if (!accountId || !['enable', 'disable', 'tick'].includes(action || '')) {
    return NextResponse.json({ error: 'accountId + valid action required' }, { status: 400 });
  }

  const isPro = await requirePro(user.id);
  if (!isPro) {
    return NextResponse.json({ error: 'Mirroring existing events is a Pro feature.' }, { status: 402 });
  }

  const acct = await getSourceAccount(user.id, accountId);
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const acctRow = acct as any;

  // === disable: delete backfill mirrors + reset state ===
  if (action === 'disable') {
    // Find all backfill mirrors from this source and delete the Google Calendar
    // events + the mapping rows. via_backfill=true means WE created it during a
    // backfill; we're not touching real events created via push notifications.
    const { data: mappings } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id, mirrored_events')
      .eq('user_id', user.id)
      .eq('source_account_id', accountId)
      .eq('via_backfill', true);

    let deleted = 0;
    for (const row of (mappings as any[]) || []) {
      for (const mirror of (row.mirrored_events as any[]) || []) {
        try {
          const auth = await googleAuth.getClientByAccountId(user.id, mirror.account_id);
          await googleCalendar.deleteEvent(auth, mirror.calendar_id || 'primary', mirror.event_id);
          deleted++;
        } catch (err) {
          // Event may have been deleted manually — safe to skip and continue.
          console.warn(`backfill/disable: failed to delete mirror ${mirror.event_id}`, err);
        }
      }
      await (supabaseAdmin as any).from('event_mappings').delete().eq('id', row.id);
    }

    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({
        mirror_existing_enabled: false,
        backfill_status: 'canceled',
        backfill_progress: 0,
        backfill_total: null,
        backfill_cursor: null,
        backfill_started_at: null,
        backfill_error: null,
      })
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true, deleted, status: 'canceled' });
  }

  // === enable: kick off a fresh backfill (or restart if previously canceled) ===
  if (action === 'enable') {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({
        mirror_existing_enabled: true,
        backfill_status: 'running',
        backfill_progress: 0,
        backfill_total: null,
        backfill_cursor: null,
        backfill_started_at: new Date().toISOString(),
        backfill_error: null,
      })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    // Fall through to process first chunk immediately
  } else if (action === 'tick') {
    if (acctRow.backfill_status !== 'running') {
      return NextResponse.json({
        ok: true,
        status: acctRow.backfill_status,
        progress: acctRow.backfill_progress,
        total: acctRow.backfill_total,
      });
    }
  }

  // === process one chunk ===
  const dests = await getDestAccounts(user.id, accountId);
  if (dests.length === 0) {
    // No target calendars — nothing to backfill.
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'complete' })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true, status: 'complete', progress: 0, total: 0 });
  }

  let auth;
  try {
    auth = await googleAuth.getClientByAccountId(user.id, accountId);
  } catch (err: any) {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'failed', backfill_error: 'auth: ' + (err?.message || String(err)) })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'Auth failed for source calendar' }, { status: 500 });
  }

  const now = new Date();
  const horizon = new Date(now);
  horizon.setFullYear(now.getFullYear() + HORIZON_YEARS);

  // Get the currently-saved cursor for pagination
  const currentCursor = (await getSourceAccount(user.id, accountId) as any)?.backfill_cursor || undefined;

  // Fetch a page of events
  let events: any[] = [];
  let nextPageToken: string | undefined;
  try {
    const result = await googleCalendar.listEventsForBackfill(
      auth,
      'primary',
      now.toISOString(),
      horizon.toISOString(),
      CHUNK_SIZE,
      currentCursor,
    );
    events = result.events || [];
    nextPageToken = result.nextPageToken;
  } catch (err: any) {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'failed', backfill_error: 'list: ' + (err?.message || String(err)) })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'Failed to list events' }, { status: 500 });
  }

  // Mirror each event via the existing sync engine. Passing viaBackfill=true
  // tags the resulting event_mappings so we can find and delete them cleanly
  // if the user disables the backfill.
  let processed = 0;
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    try {
      await syncService.createMirrorEvents(user.id, accountId, 'primary', ev, dests, /* viaBackfill */ true);
      processed++;
    } catch (err) {
      console.warn(`backfill: mirror failed for event ${ev.id}`, err);
    }
  }

  // Update state. If no nextPageToken, we're done.
  const newProgress = acctRow.backfill_progress + processed;
  const done = !nextPageToken;
  await (supabaseAdmin as any)
    .from('user_accounts')
    .update({
      backfill_status: done ? 'complete' : 'running',
      backfill_progress: newProgress,
      backfill_cursor: nextPageToken || null,
      // Total is unknown until we've seen the last page; leave null while running.
      backfill_total: done ? newProgress : null,
    })
    .eq('account_id', accountId)
    .eq('user_id', user.id);

  return NextResponse.json({
    ok: true,
    status: done ? 'complete' : 'running',
    progress: newProgress,
    total: done ? newProgress : null,
    chunkProcessed: processed,
  });
}
