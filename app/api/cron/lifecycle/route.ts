import { isDeepStrictEqual } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { candidate } from '@/lib/lifecycle/review';
import { unsubscribeToken } from '@/lib/lifecycle/unsubscribe';
import { withOperationLock } from '@/lib/operation-lock';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.LIFECYCLE_EMAIL_ENABLED !== 'true') return NextResponse.json({ enabled: false, sent: 0 });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_WEBHOOK_SECRET || !process.env.LIFECYCLE_EMAIL_FROM ||
    !process.env.LIFECYCLE_UNSUBSCRIBE_SECRET || !process.env.LIFECYCLE_POSTAL_ADDRESS)
    return NextResponse.json({ error: 'Email configuration incomplete' }, { status: 503 });
  const db = supabaseAdmin as any;
  let sent = 0;
  try {
    // Small bounded batch; every recipient/copy must have an explicit reviewed approval.
    const rows = await db.from('lifecycle_outbox').select('*').eq('status', 'approved').not('approved_at', 'is', null).order('created_at').limit(2);
    if (rows.error) throw rows.error;
    for (const row of rows.data) {
      await withOperationLock(`lifecycle:${row.user_id}`, async () => {
        const fresh = await candidate(row.user_id);
        if (!fresh || fresh.step !== row.step || !isDeepStrictEqual(fresh.payload, row.payload)) {
          const skipped = await db.from('lifecycle_outbox').update({ status: 'skipped' }).eq('id', row.id).eq('status', 'approved');
          if (skipped.error) throw skipped.error;
          return;
        }
        const claimed = await db.from('lifecycle_outbox').update({ status: 'sending' }).eq('id', row.id).eq('status', 'approved').select('id');
        if (claimed.error) throw claimed.error;
        if (!claimed.data.length) return;
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
          sent++;
        } catch {
          // Never retry ambiguous delivery automatically after provider idempotency expires.
          const unknown = await db.from('lifecycle_outbox').update({ status: 'unknown' }).eq('id', row.id);
          if (unknown.error) throw unknown.error;
        }
      });
    }
    return NextResponse.json({ enabled: true, sent });
  } catch { return NextResponse.json({ error: 'Email worker stopped; review queue before retrying', sent }, { status: 503 }); }
}
