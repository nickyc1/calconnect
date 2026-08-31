import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/user-diag?email=someone@example.com
 *
 * Support diagnostic for a specific user. Returns everything I'd want to know
 * to answer "why isn't it syncing for me?" without opening a Supabase console.
 * CRON_SECRET-gated. Includes only the diagnostic surface, no OAuth tokens.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Find the auth.users row by email
  let authUser: any = null;
  try {
    // list_users doesn't have a filter param on all versions — page through
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

  const { data: billing } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: accounts } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id, google_email, is_active, is_source_account, needs_reauth, created_at, mirror_color_id, mirror_label')
    .eq('user_id', userId);

  const accountIds = ((accounts as any[]) || []).map((a) => a.account_id);

  const { data: watches } = await (supabaseAdmin as any)
    .from('watch_channels')
    .select('account_id, calendar_id, channel_id, expiration, sync_token')
    .eq('user_id', userId);

  const { count: mappingsTotal } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const day7 = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { count: mappings7d } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', day7);

  const { data: recentMappings } = await (supabaseAdmin as any)
    .from('event_mappings')
    .select('source_event_id, source_account_id, created_at, via_backfill')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const now = Date.now();
  const watchStates = ((watches as any[]) || []).map((w) => ({
    account_id: w.account_id,
    calendar_id: w.calendar_id,
    expires_at: w.expiration,
    expires_in_hours: w.expiration ? Math.round((new Date(w.expiration).getTime() - now) / 3600_000) : null,
    has_sync_token: !!w.sync_token,
    is_expired: w.expiration ? new Date(w.expiration).getTime() < now : false,
  }));

  const sourceCount = ((accounts as any[]) || []).filter((a) => a.is_source_account).length;
  const activeCount = ((accounts as any[]) || []).filter((a) => a.is_active).length;
  const reauthNeeded = ((accounts as any[]) || []).filter((a) => a.needs_reauth).length;

  // Likely reason it's not syncing (auto-diagnosis)
  const likelyIssue: string[] = [];
  if ((accounts as any[])?.length < 2) likelyIssue.push('Fewer than 2 calendars connected — mirroring needs at least 2.');
  if (sourceCount === 0) likelyIssue.push('No source calendar selected — click the Source checkbox on at least one account.');
  if (reauthNeeded > 0) likelyIssue.push(`${reauthNeeded} calendar(s) need Google reauth — mirroring is paused for them.`);
  if (watchStates.some((w: any) => w.is_expired)) likelyIssue.push('One or more watch channels expired — Google isn\'t sending change notifications.');
  const sourceAccountIds = ((accounts as any[]) || []).filter((a) => a.is_source_account).map((a) => a.account_id);
  const sourcesWithoutWatch = sourceAccountIds.filter((aid) => !watchStates.some((w: any) => w.account_id === aid));
  if (sourceAccountIds.length > 0 && sourcesWithoutWatch.length > 0) {
    likelyIssue.push(`${sourcesWithoutWatch.length} source(s) have NO watch channel at all — mirroring never activated. Try toggling Source off/on.`);
  }
  if ((mappingsTotal || 0) === 0 && (accounts as any[])?.length >= 2 && sourceCount > 0) {
    likelyIssue.push('0 event mappings ever created — either the source calendar has 0 non-mirror events, or mirroring never activated.');
  }

  return NextResponse.json({
    email,
    user_id: userId,
    signed_up_at: authUser.created_at,
    billing: billing ? { plan: (billing as any).plan, subscription_status: (billing as any).subscription_status, base_calendars: (billing as any).base_calendars, extra_calendars: (billing as any).extra_calendars, mirror_existing_beta: (billing as any).mirror_existing_beta } : null,
    accounts: (accounts as any[]) || [],
    account_counts: {
      total: (accounts as any[])?.length || 0,
      active: activeCount,
      sources: sourceCount,
      need_reauth: reauthNeeded,
    },
    watch_channels: watchStates,
    mirroring: {
      total_mappings: mappingsTotal || 0,
      mappings_last_7d: mappings7d || 0,
      recent_mappings: recentMappings || [],
    },
    likely_issues: likelyIssue,
  });
}
