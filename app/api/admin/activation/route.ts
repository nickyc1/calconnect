import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isActivationAdmin } from '@/lib/lifecycle/admin';
import { candidate } from '@/lib/lifecycle/review';
import { withOperationLock } from '@/lib/operation-lock';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!await isActivationAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);
  const db = supabaseAdmin as any;
  try {
    const results = await Promise.all([
      db.from('activation_support_requests').select('*').is('resolved_at', null).order('created_at').range(offset, offset + 99),
      db.from('lifecycle_outbox').select('*').order('created_at', { ascending: false }).range(offset, offset + 99),
      db.from('activation_profiles').select('*').or('email_opt_in_at.not.is.null,tips_opt_in_at.not.is.null').is('unsubscribed_at', null).order('created_at').range(offset, offset + 99),
    ]);
    for (const r of results) if (r.error) throw r.error;
    const ids = [...new Set<string>([...results[0].data, ...results[2].data].map((r: any) => r.user_id))];
    const emails: Record<string, string> = {};
    for (const id of ids) {
      const auth = await db.auth.admin.getUserById(id);
      if (auth.error) throw auth.error;
      emails[id] = auth.data.user?.email || '(no email)';
    }
    return NextResponse.json({ support: results[0].data, outbox: results[1].data, profiles: results[2].data, emails, offset, pageSize: 100 });
  } catch { return NextResponse.json({ error: 'Could not load review queue' }, { status: 503 }); }
}
export async function POST(req: NextRequest) {
  if (!await isActivationAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin as any;
  try {
    if (body.action === 'resolve') {
      const r = await db.from('activation_support_requests').update({ resolved_at: new Date().toISOString() }).eq('id', body.id);
      if (r.error) throw r.error;
    } else if (body.action === 'enroll_existing') {
      const r = await db.from('activation_profiles').update({ cohort: 'existing', enrolled_at: new Date().toISOString() })
        .eq('user_id', body.userId).or('email_opt_in_at.not.is.null,tips_opt_in_at.not.is.null').is('unsubscribed_at', null).is('enrolled_at', null).eq('suppressed', false);
      if (r.error) throw r.error;
    } else if (body.action === 'prepare') {
      await withOperationLock(`lifecycle:${body.userId}`, async () => {
        const next = await candidate(body.userId);
        if (!next) throw new Error('Not eligible for an email now');
        const existing = await db.from('lifecycle_outbox').select('status').eq('user_id', body.userId).eq('step', next.step).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data && !['review', 'skipped'].includes(existing.data.status)) throw new Error('Already approved or sent');
        const r = await db.from('lifecycle_outbox').upsert({ user_id: body.userId, ...next, status: 'review', approved_at: null }, { onConflict: 'user_id,step' });
        if (r.error) throw r.error;
      });
    } else if (body.action === 'approve') {
      // The UI submits the exact payload it displayed; stale reviews cannot approve changed copy.
      const r = await db.from('lifecycle_outbox').update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', body.id).eq('status', 'review').eq('payload', JSON.stringify(body.payload)).select('id');
      if (r.error || !r.data.length) throw r.error || new Error('Review changed. Refresh before approving.');
    } else return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Could not update review' }, { status: 409 }); }
}
