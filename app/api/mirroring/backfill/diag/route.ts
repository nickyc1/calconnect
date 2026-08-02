import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/mirroring/backfill/diag
 *
 * Read-only diagnostic. Returns, for every source account, the true state of
 * the backfill: DB status, how many event_mappings still exist that would
 * count toward cleanup, and how they break down (via_backfill vs recent).
 * This is here because the dashboard UI is optimistic and can get out of sync
 * with the actual DB state during high-churn cancellations.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: accts } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id, google_email, is_source_account, backfill_status, backfill_progress, backfill_total, backfill_started_at, mirror_existing_enabled')
    .eq('user_id', user.id)
    .eq('is_source_account', true);

  const results: any[] = [];
  for (const a of (accts as any[]) || []) {
    const { count: totalMappings } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_account_id', a.account_id);

    const { count: viaBackfill } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_account_id', a.account_id)
      .eq('via_backfill', true);

    const floor = a.backfill_started_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentSinceStart } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_account_id', a.account_id)
      .gte('created_at', floor);

    results.push({
      email: a.google_email,
      account_id: a.account_id,
      status: a.backfill_status,
      progress: a.backfill_progress,
      total: a.backfill_total,
      started_at: a.backfill_started_at,
      enabled: a.mirror_existing_enabled,
      mappings: {
        total: totalMappings || 0,
        via_backfill: viaBackfill || 0,
        recent_since_start: recentSinceStart || 0,
      },
    });
  }

  return NextResponse.json({ sources: results });
}
