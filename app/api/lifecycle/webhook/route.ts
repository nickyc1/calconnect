import { Webhook } from 'standardwebhooks';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
export async function POST(req: NextRequest) {
  if (!process.env.RESEND_WEBHOOK_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  let event: any;
  try {
    event = new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(await req.text(), {
      'webhook-id': req.headers.get('svix-id') || '', 'webhook-timestamp': req.headers.get('svix-timestamp') || '',
      'webhook-signature': req.headers.get('svix-signature') || '',
    });
  } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }
  if (!['email.bounced', 'email.complained', 'email.suppressed'].includes(event.type)) return NextResponse.json({ ok: true });
  const db = supabaseAdmin as any;
  try {
    // Match provider ID, with recipient fallback if callback races the send receipt.
    const r = await db.from('lifecycle_outbox').select('user_id,payload').eq('provider_id', event.data.email_id);
    if (r.error) throw r.error;
    const ids = new Set<string>(r.data.map((row: any) => row.user_id));
    for (const email of (event.data.to || [])) {
      const byRecipient = await db.from('lifecycle_outbox').select('user_id').eq('payload->>to', email);
      if (byRecipient.error) throw byRecipient.error;
      for (const row of byRecipient.data) ids.add(row.user_id);
    }
    if (ids.size) {
      const saved = await db.from('activation_profiles').update({ suppressed: true }).in('user_id', [...ids]);
      if (saved.error) throw saved.error;
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Suppression failed; retry required' }, { status: 500 }); }
}
