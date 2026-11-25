import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withOperationLock } from '@/lib/operation-lock';
import { deliverRow, queueEligible } from '@/lib/lifecycle/worker';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Disabled means no queue, profile, lock, or provider access.
  if (process.env.LIFECYCLE_EMAIL_ENABLED !== 'true') return NextResponse.json({ enabled: false, sent: 0 });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_WEBHOOK_SECRET || !process.env.LIFECYCLE_EMAIL_FROM ||
    !process.env.LIFECYCLE_UNSUBSCRIBE_SECRET || !process.env.LIFECYCLE_POSTAL_ADDRESS)
    return NextResponse.json({ error: 'Email configuration incomplete' }, { status: 503 });
  const started = Date.now();
  let sent = 0;
  try {
    return await withOperationLock('lifecycle:worker', async () => {
      const queue = process.env.LIFECYCLE_AUTOMATION_ENABLED === 'true'
        ? await queueEligible(started + 20000) : { queued: 0, scanComplete: true };
      const rows = await (supabaseAdmin as any).from('lifecycle_outbox').select('*').eq('status', 'approved')
        .not('approved_at', 'is', null).order('created_at').limit(10);
      if (rows.error) throw rows.error;
      for (const row of rows.data) {
        if (Date.now() - started >= 40000) break;
        if (await withOperationLock(`lifecycle:${row.user_id}`, () => deliverRow(row))) sent++;
      }
      return NextResponse.json({ enabled: true, ...queue, sent });
    });
  } catch { return NextResponse.json({ error: 'Email worker stopped; review queue before retrying', sent }, { status: 503 }); }
}
