import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/stats
 *
 * Aggregate usage snapshot. Requires the CRON_SECRET as a bearer token
 * (same secret used to protect the watch-renewal cron), so this can be
 * called from Nick's terminal without adding new credentials. Returns
 * only counts, never PII, never emails.
 *
 * Nick's own accounts are excluded from most metrics so the numbers
 * reflect real users, not internal testing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Nick's own emails, so we can subtract them from real-user counts.
const NICK_EMAILS = ['nick@appsumo.com', 'n.christensen4@gmail.com', 'nick@raxdigital.com'];

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Nick's user IDs (so we can exclude them everywhere)
  const { data: nickUsers } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('user_id, google_email')
    .in('google_email', NICK_EMAILS);
  const nickUserIds = Array.from(new Set(((nickUsers as any[]) || []).map((r) => r.user_id)));
  const nickFilter = nickUserIds.length > 0 ? `and(user_id.not.in.(${nickUserIds.join(',')}))` : '';

  // === Users ===
  const { count: totalUsers } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('user_id', { count: 'exact', head: true });

  const { count: nickUserCount } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('user_id', { count: 'exact', head: true })
    .in('user_id', nickUserIds.length ? nickUserIds : ['00000000-0000-0000-0000-000000000000']);

  const realUsers = (totalUsers || 0) - (nickUserCount || 0);

  // Plan breakdown for real users
  const { data: planRows } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('user_id, plan')
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

  const planBreakdown: Record<string, number> = {};
  for (const row of (planRows as any[]) || []) {
    const plan = (row.plan as string) || 'unknown';
    planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
  }

  // === Connected accounts (calendars) ===
  const { count: totalAccountsAll } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true });

  const { count: nickAccountCount } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .in('google_email', NICK_EMAILS);

  const realAccounts = (totalAccountsAll || 0) - (nickAccountCount || 0);

  // Users with 2+ calendars = actually using the product for its purpose
  const { data: byUser } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('user_id')
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  const perUser: Record<string, number> = {};
  for (const r of (byUser as any[]) || []) perUser[r.user_id] = (perUser[r.user_id] || 0) + 1;
  const usersWith2Plus = Object.values(perUser).filter((n) => n >= 2).length;
  const usersWith3Plus = Object.values(perUser).filter((n) => n >= 3).length;

  // === Active sources ===
  const { count: activeSourcesAll } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .eq('is_source_account', true);

  // === Event mirroring activity ===
  const { count: mappingsTotal } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

  const now = Date.now();
  const day1 = new Date(now - 24 * 3600_000).toISOString();
  const day7 = new Date(now - 7 * 24 * 3600_000).toISOString();
  const day30 = new Date(now - 30 * 24 * 3600_000).toISOString();

  const { count: mappingsLast24h } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', day1)
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

  const { count: mappingsLast7d } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', day7)
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

  // Users who had any mapping activity in the last 7 days = weekly actives
  const { data: recentUsers7d } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('user_id')
    .gte('created_at', day7)
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  const weeklyActives = new Set(((recentUsers7d as any[]) || []).map((r) => r.user_id)).size;

  const { data: recentUsers30d } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('user_id')
    .gte('created_at', day30)
    .not('user_id', 'in', `(${nickUserIds.length ? nickUserIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  const monthlyActives = new Set(((recentUsers30d as any[]) || []).map((r) => r.user_id)).size;

  return NextResponse.json({
    users: {
      total_including_nick: totalUsers || 0,
      real_users: realUsers,
      by_plan: planBreakdown,
    },
    connected_calendars: {
      total_including_nick: totalAccountsAll || 0,
      real_calendars: realAccounts,
      users_with_2_plus_calendars: usersWith2Plus,
      users_with_3_plus_calendars: usersWith3Plus,
      active_sources_across_all_users: activeSourcesAll || 0,
    },
    mirroring_activity: {
      total_mappings_ever: mappingsTotal || 0,
      new_mappings_last_24h: mappingsLast24h || 0,
      new_mappings_last_7d: mappingsLast7d || 0,
      weekly_active_users: weeklyActives,
      monthly_active_users: monthlyActives,
    },
    excluded_from_metrics: {
      nick_user_count: nickUserIds.length,
      nick_calendars: nickAccountCount || 0,
    },
  });
}
