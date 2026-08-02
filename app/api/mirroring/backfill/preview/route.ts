import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';

/**
 * GET /api/mirroring/backfill/preview?accountId=X
 *
 * Called before opening the backfill confirmation modal. Estimates how many
 * events sit on the source calendar (now → +5 years) and how long the backfill
 * will roughly take. Only fetches the first page (2500 events max) so it
 * returns in under 2 seconds even for large calendars.
 *
 * Response:
 *   { estimateEvents: 4321, isExact: true, minutesLow: 2, minutesHigh: 4 }
 *   { estimateEvents: 2500, isExact: false, minutesLow: 5, minutesHigh: 30 }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HORIZON_YEARS = 5;
const MAX_SAMPLE = 2500;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

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
    return NextResponse.json({ error: 'Auth failed for source calendar' }, { status: 500 });
  }

  const now = new Date();
  const horizon = new Date(now);
  horizon.setFullYear(now.getFullYear() + HORIZON_YEARS);

  let events: any[] = [];
  let nextPageToken: string | undefined;
  try {
    const result = await googleCalendar.listEventsForBackfill(
      auth,
      'primary',
      now.toISOString(),
      horizon.toISOString(),
      MAX_SAMPLE,
      undefined,
    );
    events = result.events || [];
    nextPageToken = result.nextPageToken;
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to preview calendar' }, { status: 500 });
  }

  const activeCount = events.filter((e) => e.status !== 'cancelled').length;
  const isExact = !nextPageToken;
  // Backfill processes ~50 events per chunk, each chunk ~5-10s.
  // Multiply by number of destination calendars to get rough total.
  const { data: dests } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .neq('account_id', accountId);
  const destCount = ((dests as any[]) || []).length;

  const estimateEvents = isExact ? activeCount : activeCount + Math.round(activeCount * 0.5);
  const chunksNeeded = Math.max(1, Math.ceil(estimateEvents / 50));
  const secondsLow = chunksNeeded * 4 * Math.max(1, destCount);
  const secondsHigh = chunksNeeded * 10 * Math.max(1, destCount);

  return NextResponse.json({
    estimateEvents,
    isExact,
    destCount,
    minutesLow: Math.max(1, Math.round(secondsLow / 60)),
    minutesHigh: Math.max(1, Math.round(secondsHigh / 60)),
  });
}
