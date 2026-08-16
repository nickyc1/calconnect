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

  // ==================== HEALTH CHECK ====================
  // Signals worth surfacing every time we pull stats:
  //   - accounts that need reauth (Google refresh token dead → mirroring paused for them)
  //   - stuck backfills (status running/canceling with no updates in >10min)
  //   - watch channels expiring soon (<24h) → mirrors go dark when they expire
  //   - failed backfills (backfill_status=failed)
  //   - webhook liveness: any event_mapping updated in last 60min = sync is alive
  const { count: needsReauth } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .eq('needs_reauth', true);

  const { count: failedBackfills } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .eq('backfill_status', 'failed');

  const stuckThreshold = new Date(now - 10 * 60_000).toISOString();
  const { count: stuckBackfills } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .in('backfill_status', ['running', 'canceling'])
    .lt('backfill_started_at', stuckThreshold);

  // Watch channels expiring in the next 24h — cron should catch these but
  // if it isn't running, mirrors stop working when they lapse.
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const { count: watchesExpiringSoon } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .eq('is_source_account', true)
    .not('watch_expiration', 'is', null)
    .lt('watch_expiration', in24h);

  // Watches ALREADY expired (worse than expiring)
  const { count: watchesExpired } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id', { count: 'exact', head: true })
    .eq('is_source_account', true)
    .not('watch_expiration', 'is', null)
    .lt('watch_expiration', new Date(now).toISOString());

  // Webhook liveness: last event_mapping created OR updated across all users
  const { data: lastMapping } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastActivityAt = (lastMapping as any)?.updated_at || (lastMapping as any)?.created_at || null;
  const lastActivityAgeMinutes = lastActivityAt
    ? Math.round((now - new Date(lastActivityAt).getTime()) / 60_000)
    : null;

  // Overall status: green if nothing serious, yellow if warnings, red if broken
  const redFlags: string[] = [];
  const yellowFlags: string[] = [];
  if ((watchesExpired || 0) > 0) redFlags.push(`${watchesExpired} watch channel(s) expired`);
  if ((stuckBackfills || 0) > 0) redFlags.push(`${stuckBackfills} backfill(s) stuck > 10min`);
  if ((needsReauth || 0) > 3) redFlags.push(`${needsReauth} accounts need reauth`);
  if ((watchesExpiringSoon || 0) > 0) yellowFlags.push(`${watchesExpiringSoon} watch channel(s) expire in <24h`);
  if ((failedBackfills || 0) > 0) yellowFlags.push(`${failedBackfills} failed backfill(s)`);
  if ((needsReauth || 0) > 0 && (needsReauth || 0) <= 3) yellowFlags.push(`${needsReauth} account(s) need reauth`);
  if (lastActivityAgeMinutes !== null && lastActivityAgeMinutes > 60) {
    yellowFlags.push(`no mapping activity in last ${lastActivityAgeMinutes}min`);
  }
  const overallStatus = redFlags.length > 0 ? 'RED' : yellowFlags.length > 0 ? 'YELLOW' : 'GREEN';

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
    health: {
      status: overallStatus,
      red_flags: redFlags,
      yellow_flags: yellowFlags,
      accounts_needing_reauth: needsReauth || 0,
      failed_backfills: failedBackfills || 0,
      stuck_backfills: stuckBackfills || 0,
      watches_expired: watchesExpired || 0,
      watches_expiring_next_24h: watchesExpiringSoon || 0,
      last_mapping_activity_age_minutes: lastActivityAgeMinutes,
    },
    excluded_from_metrics: {
      nick_user_count: nickUserIds.length,
      nick_calendars: nickAccountCount || 0,
    },
  });
}
