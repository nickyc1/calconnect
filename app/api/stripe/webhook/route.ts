import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { computeEntitlement } from '@/lib/billing/policy';
import { withOperationLock } from '@/lib/operation-lock';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function reconcile(customer: string) {
  const db = supabaseAdmin as any;
  const { data: billing, error } = await db.from('user_billing').select('user_id,plan,lifetime_entitled').eq('stripe_customer_id', customer).maybeSingle();
  if (error) throw error;
  if (!billing) throw new Error('Customer is not mapped to an app user');
  await withOperationLock(`billing:${billing.user_id}`, async () => {
    // Re-read Stripe, not event payloads: deliveries can arrive out of order.
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 }).autoPagingToArray({ limit: 1000 });
    if (subs.some(s => s.metadata.user_id && s.metadata.user_id !== billing.user_id)) throw new Error('Subscription ownership mismatch');
    const { data: codes, error: codeError } = await db.from('appsumo_codes').select('revoked_at').eq('redeemed_by', billing.user_id);
    if (codeError) throw codeError;
    const lifetime = codes.length ? codes.some((c: any) => !c.revoked_at) : (billing.lifetime_entitled || billing.plan === 'lifetime');
    const result = await db.from('user_billing').update({ ...computeEntitlement(subs, lifetime), lifetime_entitled: lifetime, updated_at: new Date().toISOString() }).eq('user_id', billing.user_id);
    if (result.error) throw result.error;
  });
}
export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(Buffer.from(await req.arrayBuffer()), signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }
  const db = supabaseAdmin as any;
  try {
    const { data, error } = await db.from('processed_webhooks').select('event_id').eq('event_id', event.id).maybeSingle();
    if (error) throw error;
    if (data) return NextResponse.json({ received: true, deduped: true });
    if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
      'invoice.payment_succeeded', 'invoice.payment_failed', 'checkout.session.completed'].includes(event.type)) {
      const customer = (event.data.object as any).customer;
      if (customer) await reconcile(typeof customer === 'string' ? customer : customer.id);
    }
    const saved = await db.from('processed_webhooks').insert({ event_id: event.id, event_type: event.type });
    if (saved.error && saved.error.code !== '23505') throw saved.error;
    return NextResponse.json({ received: true });
  } catch {
    // DB/Stripe/lock failures must cause retries, never acknowledge stale entitlements.
    return NextResponse.json({ error: 'Reconciliation failed; retry required' }, { status: 500 });
  }
}
