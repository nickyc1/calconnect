import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { google } from 'googleapis';

/**
 * POST /api/admin/strip-reminders?email=X&cursor=N
 *
 * One-shot sweep that patches reminders:{useDefault:false, overrides:[]}
 * onto every existing mirror event owned by the given user. Needed because
 * the fix to disable reminders on new mirrors (shipped 2026-10-13) only
 * affects events created after that point. Pre-existing Busy blocks still
 * carry whatever reminder settings they were created with and keep firing
 * popup/email notifications to the user.
 *
 * Chunked at CHUNK mappings per call to stay under Vercel's 60s function
 * budget. Caller polls with the returned nextCursor until done:true.
 *
 * CRON_SECRET-gated. Idempotent (patching a mirror twice is harmless).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 25;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email');
  const cursor = Math.max(0, Number(req.nextUrl.searchParams.get('cursor')) || 0);
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Resolve email → user_id via auth.users
  let authUser: any = null;
  try {
    let page = 1;
    while (page < 20 && !authUser) {
      const { data } = await (supabaseAdmin as any).auth.admin.listUsers({ page, perPage: 200 });
      const users = data?.users || [];
      authUser = users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!users.length || users.length < 200) break;
      page++;
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'auth lookup failed: ' + e.message }, { status: 500 });
  }
  if (!authUser) return NextResponse.json({ error: 'No user with that email' }, { status: 404 });
  const userId = authUser.id;

  // Total count up front so caller can show progress
  const { count: totalMappings } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // One chunk of mappings, ordered by id for stable pagination
  const { data: mappings } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id, mirrored_events')
    .eq('user_id', userId)
    .order('id', { ascending: true })
    .range(cursor, cursor + CHUNK - 1);

  const rows = (mappings as any[]) || [];
  let patched = 0;
  let failed = 0;
  let skipped = 0;

  // Cache OAuth clients per destination account so we don't re-fetch tokens
  // for every mirror in the chunk.
  const authCache = new Map<string, any>();

  for (const row of rows) {
    for (const mirror of (row.mirrored_events as any[]) || []) {
      try {
        let destAuth = authCache.get(mirror.account_id);
        if (!destAuth) {
          destAuth = await googleAuth.getClientByAccountId(userId, mirror.account_id);
          authCache.set(mirror.account_id, destAuth);
        }
        const calendar = google.calendar({ version: 'v3', auth: destAuth });
        await calendar.events.patch({
          calendarId: mirror.calendar_id || 'primary',
          eventId: mirror.event_id,
          requestBody: {
            reminders: { useDefault: false, overrides: [] },
          },
        });
        patched++;
      } catch (err: any) {
        const code = err?.code || err?.status;
        // 404/410 means the mirror is gone (deleted on Google side). Nothing
        // to strip, treat as skipped not failed so we don't look alarmed.
        if (code === 404 || code === 410) {
          skipped++;
        } else {
          failed++;
          console.warn(`strip-reminders: patch failed for ${mirror.event_id}`, err?.message);
        }
      }
    }
  }

  const nextCursor = cursor + rows.length;
  const done = rows.length === 0 || nextCursor >= (totalMappings || 0);

  return NextResponse.json({
    ok: true,
    email,
    cursor,
    nextCursor,
    chunkMappings: rows.length,
    patched,
    skipped,
    failed,
    totalMappings: totalMappings || 0,
    done,
  });
}
