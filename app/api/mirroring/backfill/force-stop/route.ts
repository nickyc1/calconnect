import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/mirroring/backfill/force-stop
 *
 * Nuclear option. Flips backfill_status to 'canceling' for ALL sources on the
 * signed-in user in a single atomic write, no Google API calls, no chunking.
 * Any in-flight tick will find status != 'running' when it does its guarded
 * write and will refuse to overwrite (see the conditional update in the tick
 * handler). New ticks return immediately. The dashboard poll loop then picks
 * up 'canceling' and drives the chunked cleanup as normal.
 *
 * Use when the UI-driven Cancel button is fighting a live backfill and losing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: stopped, error } = await (supabaseAdmin as any)
    .from('user_accounts')
    .update({
      mirror_existing_enabled: false,
      backfill_status: 'canceling',
      backfill_cursor: null,
    })
    .eq('user_id', user.id)
    .in('backfill_status', ['running', 'complete', 'failed'])
    .select('account_id, google_email, backfill_status');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, stopped: stopped || [] });
}
