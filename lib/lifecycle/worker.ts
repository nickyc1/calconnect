import { isDeepStrictEqual } from 'util';
import { supabaseAdmin } from '@/lib/supabase';
import { candidate } from './review';
import { unsubscribeToken } from './unsubscribe';
import { withOperationLock } from '@/lib/operation-lock';

type Resolve = typeof candidate;
// Caller holds the per-user lock. Preserve sent/ambiguous records across reruns.
export async function queueNext(userId: string, resolve: Resolve = candidate) {
  const db = supabaseAdmin as any;
  const next = await resolve(userId);
  if (!next) return false;
  const existing = await db.from('lifecycle_outbox').select('status,payload').eq('user_id', userId).eq('step', next.step).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && !['review', 'skipped', 'approved'].includes(existing.data.status)) return false;
  if (existing.data?.status === 'approved' && isDeepStrictEqual(existing.data.payload, next.payload)) return false;
  const saved = await db.from('lifecycle_outbox').upsert({ user_id: userId, ...next, status: 'approved', approved_at: new Date().toISOString() }, { onConflict: 'user_id,step' });
  if (saved.error) throw saved.error;
  return true;
}

// Shared transport for production and the operator's account-scoped test runner.
// No route accepts a custom resolver or test recipient.
export async function deliverRow(row: any, resolve: Resolve = candidate) {
  const db = supabaseAdmin as any;
  const fresh = await resolve(row.user_id);
  if (!fresh || fresh.step !== row.step || !isDeepStrictEqual(fresh.payload, row.payload)) {
    const skipped = await db.from('lifecycle_outbox').update({ status: 'skipped' }).eq('id', row.id).eq('status', 'approved');
    if (skipped.error) throw skipped.error;
    return false;
  }
  const claimed = await db.from('lifecycle_outbox').update({ status: 'sending' }).eq('id', row.id).eq('status', 'approved').select('id');
  if (claimed.error) throw claimed.error;
  if (!claimed.data.length) return false;
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io';
  const unsubscribe = `${origin}/api/lifecycle/unsubscribe?token=${encodeURIComponent(unsubscribeToken(row.user_id))}`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `calconnect-${row.id}` },
      body: JSON.stringify({ from: row.payload.from, to: [row.payload.to], reply_to: row.payload.replyTo,
        subject: row.payload.subject, text: `${row.payload.text}\n\n${row.payload.address}\nUnsubscribe: ${unsubscribe}`,
        headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
    });
    const receipt = await response.json();
    if (!response.ok || !receipt.id) throw new Error('Provider did not confirm acceptance');
    const delivered = await db.from('lifecycle_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: receipt.id }).eq('id', row.id);
    if (delivered.error) throw delivered.error;
    const profile = await db.from('activation_profiles').update({ last_email_at: new Date().toISOString() }).eq('user_id', row.user_id);
    if (profile.error) throw profile.error;
    return true;
  } catch {
    const unknown = await db.from('lifecycle_outbox').update({ status: 'unknown' }).eq('id', row.id);
    if (unknown.error) throw unknown.error;
    return false;
  }
}

export async function queueEligible(deadline: number) {
  const db = supabaseAdmin as any;
  let queued = 0, offset = 0;
  while (Date.now() < deadline) {
    const profiles = await db.from('activation_profiles').select('user_id')
      .or('email_opt_in_at.not.is.null,tips_opt_in_at.not.is.null').not('enrolled_at', 'is', null)
      .is('unsubscribed_at', null).eq('suppressed', false).order('user_id').range(offset, offset + 99);
    if (profiles.error) throw profiles.error;
    for (let i = 0; i < profiles.data.length; i += 5) {
      if (Date.now() >= deadline) return { queued, scanComplete: false };
      const results = await Promise.allSettled(profiles.data.slice(i, i + 5).map((p: any) =>
        withOperationLock(`lifecycle:${p.user_id}`, () => queueNext(p.user_id))));
      for (const r of results) {
        if (r.status === 'rejected') throw r.reason;
        if (r.value) queued++;
      }
    }
    if (profiles.data.length < 100) return { queued, scanComplete: true };
    offset += 100;
  }
  return { queued, scanComplete: false };
}
