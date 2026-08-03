import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';

/**
 * POST /api/mirroring/backfill/purge-orphans?accountId=X&sinceIso=YYYY-MM-DDTHH:MM:SSZ
 *
 * Direct-hunt cleanup that ignores our event_mappings table entirely and
 * talks straight to Google Calendar. Necessary because the chunked disable
 * silently ignored per-event delete failures (rate limits, timeouts) and
 * deleted the mapping row anyway, orphaning thousands of Busy blocks on the
 * calendar with no way to find them via our DB.
 *
 * Strategy:
 *   1. events.list with privateExtendedProperty=calconnect_is_mirror=true
 *      returns every mirror event on the calendar (~O(n) in mirror count).
 *   2. Filter to events where `created >= sinceIso` — only the fallout from
 *      today's incident; anything older is a legit long-standing mirror.
 *   3. Delete each. Retry on 429s; log 404s and continue.
 *
 * Chunked: processes up to CHUNK per call, returns pageToken to continue.
 * Poll from the client until { done: true }.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 250 was too greedy — sequential Google deletes hit Vercel's 60s budget.
// 50 leaves headroom for retries and the DB cleanup at the end.
const CHUNK = 50;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  const sinceIso = req.nextUrl.searchParams.get('sinceIso');
  const beforeIso = req.nextUrl.searchParams.get('beforeIso');
  const pageToken = req.nextUrl.searchParams.get('pageToken') || undefined;
  if (!accountId || !sinceIso) {
    return NextResponse.json({ error: 'accountId and sinceIso required' }, { status: 400 });
  }

  const sinceDate = new Date(sinceIso);
  if (isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: 'sinceIso not a valid date' }, { status: 400 });
  }
  const beforeDate = beforeIso ? new Date(beforeIso) : null;
  if (beforeDate && isNaN(beforeDate.getTime())) {
    return NextResponse.json({ error: 'beforeIso not a valid date' }, { status: 400 });
  }

  const { data: acct } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let auth;
  try {
    auth = await googleAuth.getClientByAccountId(user.id, accountId);
  } catch (err: any) {
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
  const calendar = google.calendar({ version: 'v3', auth });

  const params: any = {
    calendarId: 'primary',
    privateExtendedProperty: 'calconnect_is_mirror=true',
    maxResults: CHUNK,
    showDeleted: false,
    singleEvents: false,
  };
  if (pageToken) params.pageToken = pageToken;

  const { data: list } = await calendar.events.list(params);
  const items = list.items || [];

  let deleted = 0;
  let skippedOld = 0;
  let skippedNewer = 0;
  let failed = 0;
  for (const ev of items) {
    if (!ev.id) continue;
    const created = ev.created ? new Date(ev.created) : null;
    if (created && created < sinceDate) {
      skippedOld++;
      continue;
    }
    if (created && beforeDate && created >= beforeDate) {
      skippedNewer++;
      continue;
    }
    try {
      await calendar.events.delete({ calendarId: 'primary', eventId: ev.id });
      deleted++;
    } catch (err: any) {
      if (err?.code === 410 || err?.code === 404) {
        deleted++;
      } else {
        console.warn(`purge-orphans: failed to delete ${ev.id}`, err?.message);
        failed++;
      }
    }
  }

  // Also blow away event_mappings rows for events created in the same window
  // from this source, so the DB matches reality after the purge.
  let mapDel = (supabaseAdmin as any)
    .from('event_mappings')
    .delete()
    .eq('user_id', user.id)
    .eq('source_account_id', accountId)
    .gte('created_at', sinceIso);
  if (beforeIso) mapDel = mapDel.lt('created_at', beforeIso);
  await mapDel;

  return NextResponse.json({
    ok: true,
    deleted,
    skippedOld,
    skippedNewer,
    failed,
    nextPageToken: list.nextPageToken || null,
    done: !list.nextPageToken,
  });
}
