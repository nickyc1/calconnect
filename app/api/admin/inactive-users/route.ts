import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/inactive-users
 *
 * Returns the list of real users who haven't finished setup, meaning they
 * have fewer than 2 connected calendars. Mirroring requires at least 2, so
 * everyone in this list is stuck. Payload is intentionally minimal:
 * email, days_since_signup, plan, connected_calendar_count.
 *
 * CRON_SECRET-gated. Nick's own accounts excluded.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NICK_EMAILS = ['nick@appsumo.com', 'n.christensen4@gmail.com', 'nick@raxdigital.com'];

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Nick's user_ids to exclude
  const { data: nickUsers } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('user_id')
    .in('google_email', NICK_EMAILS);
  const nickUserIds = Array.from(new Set(((nickUsers as any[]) || []).map((r) => r.user_id)));
  const excludeList = nickUserIds.length ? nickUserIds : ['00000000-0000-0000-0000-000000000000'];

  // Pull EVERY user_billing row and filter Nick's out in code.
  // The .not('user_id', 'in', '(uuid1,uuid2)') PostgREST syntax needs UUIDs
  // to be quoted a specific way that has bitten this file before — safer
  // to just pull all rows and filter in JS since it's ~20 rows.
  const nickSet = new Set(excludeList);
  const { data: billingAll } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('user_id, plan, created_at');
  const billing = ((billingAll as any[]) || []).filter((b) => !nickSet.has(b.user_id));

  const { data: accountsAll } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('user_id, is_source_account');
  const accounts = ((accountsAll as any[]) || []).filter((a) => !nickSet.has(a.user_id));
  const calendarCount: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  for (const a of (accounts as any[]) || []) {
    calendarCount[a.user_id] = (calendarCount[a.user_id] || 0) + 1;
    if (a.is_source_account) sourceCount[a.user_id] = (sourceCount[a.user_id] || 0) + 1;
  }

  // Emails come from auth.users
  const userIds = ((billing as any[]) || []).map((b) => b.user_id);
  let emailByUserId: Record<string, string> = {};
  if (userIds.length) {
    const { data: authUsers } = await (supabaseAdmin as any)
      .rpc('get_user_emails', { user_ids: userIds })
      .then((r: any) => r, () => ({ data: null }));
    if (authUsers) {
      for (const u of authUsers as any[]) emailByUserId[u.id] = u.email;
    } else {
      // Fallback: read auth.users via admin SDK path
      for (const uid of userIds) {
        try {
          const { data } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
          if (data?.user?.email) emailByUserId[uid] = data.user.email;
        } catch {}
      }
    }
  }

  const now = Date.now();
  const inactive = ((billing as any[]) || [])
    .map((b) => {
      const count = calendarCount[b.user_id] || 0;
      const sources = sourceCount[b.user_id] || 0;
      const daysSinceSignup = b.created_at
        ? Math.floor((now - new Date(b.created_at).getTime()) / (24 * 3600_000))
        : null;
      return {
        email: emailByUserId[b.user_id] || null,
        plan: b.plan,
        connected_calendars: count,
        active_sources: sources,
        days_since_signup: daysSinceSignup,
        signed_up_at: b.created_at,
      };
    })
    .filter((u) => u.connected_calendars < 2)
    .sort((a, b) => (a.days_since_signup ?? 0) - (b.days_since_signup ?? 0));

  return NextResponse.json({
    inactive_count: inactive.length,
    users: inactive,
  });
}
