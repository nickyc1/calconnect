import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { google } from 'googleapis';

/**
 * POST /api/mirroring/refresh
 *
 * Body: { accountId, cursor? }
 *
 * User-triggered reconciliation for a single source calendar. Walks the
 * event_mappings for that source and, for each one, checks whether the
 * source event still exists on Google. If it does not (404/410 from a
 * .get call, or status === 'cancelled'), we delete the mirrors and the
 * mapping. This cleans up orphans that accumulated because Google's push
 * notifications are not reliable for every edit (series deletions, bulk
 * reschedules, moved instances that never fired an exception event).
 *
 * Chunked at CHUNK mappings per call so the function stays under Vercel's
 * 60s budget. Client polls with the returned nextCursor until done:true.
 *
 * Gated by the normal user session (not CRON_SECRET) since this is a
 * user-facing button. Only operates on account_ids the caller owns.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 20;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId: string | undefined = body?.accountId;
  const cursor: number = Math.max(0, Number(body?.cursor) || 0);
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  // Verify ownership of the source account
  const { data: acct } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Total count up front so client can show progress
  const { count: totalMappings } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('source_account_id', accountId);

  const { data: mappings } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id, source_event_id, source_calendar_id, mirrored_events')
    .eq('user_id', user.id)
    .eq('source_account_id', accountId)
    .order('id', { ascending: true })
    .range(cursor, cursor + CHUNK - 1);

  const rows = (mappings as any[]) || [];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      accountId,
      cursor,
      nextCursor: cursor,
      chunkMappings: 0,
      orphansRemoved: 0,
      mirrorsDeleted: 0,
      stillExists: 0,
      sourceCheckFailed: 0,
      totalMappings: totalMappings || 0,
      done: true,
    });
  }

  let sourceAuth;
  try {
    sourceAuth = await googleAuth.getClientByAccountId(user.id, accountId);
  } catch (err: any) {
    return NextResponse.json({ error: 'Source auth failed' }, { status: 500 });
  }
  const sourceCalendar = google.calendar({ version: 'v3', auth: sourceAuth });

  // Cache dest OAuth clients per account_id so we don't re-fetch for each mirror
  const destAuthCache = new Map<string, any>();

  let orphansRemoved = 0;
  let mirrorsDeleted = 0;
  let stillExists = 0;
  let sourceCheckFailed = 0;

  for (const row of rows) {
    // Ask Google whether the source event still exists. 404/410 = orphan.
    // Also treat status='cancelled' as orphan since cancelled events linger.
    let isOrphan = false;
    try {
      const { data: srcEvent } = await sourceCalendar.events.get({
        calendarId: row.source_calendar_id || 'primary',
        eventId: row.source_event_id,
      });
      if ((srcEvent as any)?.status === 'cancelled') isOrphan = true;
    } catch (err: any) {
      const code = err?.code || err?.status;
      if (code === 404 || code === 410) {
        isOrphan = true;
      } else {
        sourceCheckFailed++;
        continue;
      }
    }

    if (!isOrphan) {
      stillExists++;
      continue;
    }

    // Delete every mirror for this orphan mapping. We only delete the mapping
    // row AFTER every mirror delete succeeds (or returns 404/410). Belt and
    // suspenders against silent orphan creation.
    let allDeleted = true;
    for (const mirror of (row.mirrored_events as any[]) || []) {
      try {
        let destAuth = destAuthCache.get(mirror.account_id);
        if (!destAuth) {
          destAuth = await googleAuth.getClientByAccountId(user.id, mirror.account_id);
          destAuthCache.set(mirror.account_id, destAuth);
        }
        const destCalendar = google.calendar({ version: 'v3', auth: destAuth });
        await destCalendar.events.delete({
          calendarId: mirror.calendar_id || 'primary',
          eventId: mirror.event_id,
        });
        mirrorsDeleted++;
      } catch (err: any) {
        const code = err?.code || err?.status;
        if (code === 404 || code === 410) {
          mirrorsDeleted++;
        } else {
          allDeleted = false;
          console.warn(`refresh: failed to delete mirror ${mirror.event_id}`, err?.message);
        }
      }
    }

    if (allDeleted) {
      await (supabaseAdmin as any).from('event_mappings').delete().eq('id', row.id);
      orphansRemoved++;
    }
  }

  const nextCursor = cursor + rows.length;
  const done = nextCursor >= (totalMappings || 0);

  return NextResponse.json({
    ok: true,
    accountId,
    cursor,
    nextCursor,
    chunkMappings: rows.length,
    orphansRemoved,
    mirrorsDeleted,
    stillExists,
    sourceCheckFailed,
    totalMappings: totalMappings || 0,
    done,
  });
}
