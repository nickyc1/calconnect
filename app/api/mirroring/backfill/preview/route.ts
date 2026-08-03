import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';
import { eventOverlapsWindow } from '@/lib/mirror-window';

/**
 * GET /api/mirroring/backfill/preview?accountId=X&horizonYears=1
 *
 * Fast estimate of how many events would be mirrored if the user starts a
 * backfill right now. Fetches the first page of events (up to MAX_SAMPLE) so
 * it always returns quickly, then filters by:
 *
 *   - status !== 'cancelled'
 *   - not one of our own mirror events (calconnect_is_mirror=true)
 *   - inside the source's mirror_window if the source has one configured
 *
 * The last filter is what makes "About X events" match what the user will
 * actually see land on their destination calendars.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_HORIZON_YEARS = 1;
const MAX_HORIZON_YEARS = 5;
const MAX_SAMPLE = 2500;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const horizonYears = Math.max(
    1,
    Math.min(MAX_HORIZON_YEARS, Number(req.nextUrl.searchParams.get('horizonYears')) || DEFAULT_HORIZON_YEARS),
  );

  const { data: acct } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id, mirror_window')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  const mirrorWindow = (acct as any).mirror_window || null;

  let auth;
  try {
    auth = await googleAuth.getClientByAccountId(user.id, accountId);
  } catch (err: any) {
    return NextResponse.json({ error: 'Auth failed for source calendar' }, { status: 500 });
  }

  const now = new Date();
  const horizon = new Date(now);
  horizon.setFullYear(now.getFullYear() + horizonYears);

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

  // Filter to what will actually mirror.
  const filtered = events.filter((e: any) => {
    if (e.status === 'cancelled') return false;
    if (e.extendedProperties?.private?.calconnect_is_mirror === 'true') return false;
    if (mirrorWindow) {
      const overlaps = eventOverlapsWindow(
        {
          startDateTime: e.start?.dateTime,
          endDateTime: e.end?.dateTime,
          startDate: e.start?.date,
          endDate: e.end?.date,
          timeZone: e.start?.timeZone,
        },
        mirrorWindow,
      );
      if (!overlaps) return false;
    }
    return true;
  });

  const activeCount = filtered.length;
  const isExact = !nextPageToken;

  const { data: dests } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .neq('account_id', accountId);
  const destCount = ((dests as any[]) || []).length;

  const estimateEvents = isExact ? activeCount : activeCount + Math.round(activeCount * 0.5);
  const chunksNeeded = Math.max(1, Math.ceil(estimateEvents / 40));
  const secondsLow = chunksNeeded * 4 * Math.max(1, destCount);
  const secondsHigh = chunksNeeded * 10 * Math.max(1, destCount);

  return NextResponse.json({
    estimateEvents,
    isExact,
    destCount,
    windowActive: !!mirrorWindow,
    horizonYears,
    minutesLow: Math.max(1, Math.round(secondsLow / 60)),
    minutesHigh: Math.max(1, Math.round(secondsHigh / 60)),
  });
}
