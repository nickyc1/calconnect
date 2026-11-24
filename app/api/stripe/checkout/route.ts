import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';
import { withOperationLock } from '@/lib/operation-lock';
import { baseItems, existingPurchases, isOpenSubscription } from '@/lib/billing/policy';

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const intent = String(body.intent || '');
  const prices: Record<string, string> = {
    basic_monthly: STRIPE_PRICES.basicMonthly, basic_yearly: STRIPE_PRICES.basicYearly,
    pro_monthly: STRIPE_PRICES.proMonthly, pro_yearly: STRIPE_PRICES.proYearly,
    extra_calendar: STRIPE_PRICES.extraCalendar,
  };
  const price = prices[intent];
  const addon = intent === 'extra_calendar';
  const quantity = addon ? Number(body.quantity ?? 1) : 1;
  if (!price || !Number.isInteger(quantity) || quantity < 1 || quantity > 50)
    return NextResponse.json({ error: 'Invalid plan or quantity' }, { status: 400 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io';
  const db = supabaseAdmin as any;
  try {
    return await withOperationLock(`billing:${user.id}`, async () => {
      const { data: billing, error } = await db.from('user_billing').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      let customer = billing?.stripe_customer_id;
      if (customer) {
        // Fail closed if mapping is stale. Never silently create another customer.
        const record = await stripe.customers.retrieve(customer);
        if (record.deleted || (record.metadata.user_id && record.metadata.user_id !== user.id))
          throw new Error('Your billing account needs a support check before checkout.');
      } else {
        const record = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } },
          { idempotencyKey: `calconnect-customer-${user.id}` });
        customer = record.id;
        const saved = await db.from('user_billing').upsert({ user_id: user.id, stripe_customer_id: customer }, { onConflict: 'user_id' });
        if (saved.error) throw saved.error;
      }
      const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 }).autoPagingToArray({ limit: 1000 });
      if (subs.some(s => s.metadata?.user_id && s.metadata.user_id !== user.id)) throw new Error('Subscription ownership mismatch');
      // Unrecognized live subscriptions need review, not a speculative new purchase.
      if (subs.some(s => isOpenSubscription(s) && s.items.data.some(i =>
        !baseItems(s).includes(i) && i.price.id !== STRIPE_PRICES.extraCalendar)))
        throw new Error('Your existing subscription needs a support check before changing plans.');
      const existing = existingPurchases(subs, addon);
      if (existing.length > 1) return NextResponse.json({ error: 'Your account has more than one subscription for this plan type. Contact support so we can review it before making changes.' }, { status: 409 });
      const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 }).autoPagingToArray({ limit: 1000 });
      // Retire legacy/untracked sessions before any new or upgrade flow.
      const { data: attempt, error: attemptError } = await db.from('billing_checkout_attempts').select('*').eq('user_id', user.id).maybeSingle();
      if (attemptError) throw attemptError;
      for (const session of open) {
        if (session.mode !== 'subscription') continue;
        const keep = !existing.length && (attempt?.session_id === session.id || (!!attempt?.request_id && session.metadata?.attempt_id === attempt.request_id)) && attempt.intent === intent && attempt.quantity === quantity;
        if (!keep) await stripe.checkout.sessions.expire(session.id);
      }
      if (existing.length) {
        const sub = existing[0];
        const item = addon ? sub.items.data.find(i => i.price.id === price) : baseItems(sub)[0];
        const targetQuantity = addon ? (item?.quantity || 0) + quantity : quantity;
        if (targetQuantity > 50) return NextResponse.json({ error: 'Contact support for more than 50 extra calendars.' }, { status: 400 });
        const canConfirm = ['active', 'trialing'].includes(sub.status) && sub.items.data.length === 1 && item &&
          (item.price.id !== price || item.quantity !== targetQuantity);
        const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/dashboard`,
          ...(canConfirm ? { flow_data: {
            type: 'subscription_update_confirm' as const,
            subscription_update_confirm: { subscription: sub.id, items: [{ id: item.id, price, quantity: targetQuantity }] },
            after_completion: { type: 'redirect' as const, redirect: { return_url: `${origin}/dashboard?billing=updated` } },
          } } : {}),
        });
        return NextResponse.json({ url: portal.url });
      }
      if (addon && !existingPurchases(subs, false).length && billing?.plan !== 'lifetime')
        return NextResponse.json({ error: 'Choose a base plan before adding calendars.' }, { status: 409 });
      let request = attempt;
      const recovered = open.find(s => s.mode === 'subscription' && request?.request_id && s.metadata?.attempt_id === request.request_id);
      if (recovered && request.intent === intent && request.quantity === quantity) {
        const saved = await db.from('billing_checkout_attempts').update({ session_id: recovered.id }).eq('user_id', user.id);
        if (saved.error) throw saved.error;
        return NextResponse.json({ url: recovered.url });
      }
      if (request?.session_id) {
        const previous = await stripe.checkout.sessions.retrieve(request.session_id);
        if (previous.status === 'open' && request.intent === intent && request.quantity === quantity)
          return NextResponse.json({ url: previous.url });
        // A completed checkout can be awaiting subscription/webhook propagation.
        if (previous.status === 'complete' && !subs.some(s => s.id === (typeof previous.subscription === 'string' ? previous.subscription : previous.subscription?.id))) return NextResponse.json({ error: 'Your previous checkout completed. Please refresh your billing before starting another purchase.' }, { status: 409 });
        request = null;
      }
      if (request && (request.intent !== intent || request.quantity !== quantity || Date.now() - Date.parse(request.created_at) > 23 * 3600000))
        throw new Error('A previous checkout needs reconciliation. Please contact support before trying another purchase.');
      if (!request) {
        request = { user_id: user.id, request_id: randomUUID(), intent, quantity, session_id: null, created_at: new Date().toISOString() };
        const saved = await db.from('billing_checkout_attempts').upsert(request);
        if (saved.error) throw saved.error;
      }
      // Persisted attempt means retries use the same Stripe idempotency key.
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer, line_items: [{ price, quantity }],
        success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/${addon ? 'dashboard' : 'onboarding'}?checkout=cancelled`,
        allow_promotion_codes: true,
        metadata: { user_id: user.id, intent, attempt_id: request.request_id },
        subscription_data: { metadata: { user_id: user.id, intent },
          ...(!addon && !subs.some(s => baseItems(s).length) ? { trial_period_days: 7 } : {}) },
      }, { idempotencyKey: `calconnect-checkout-${request.request_id}` });
      const saved = await db.from('billing_checkout_attempts').update({ session_id: session.id }).eq('user_id', user.id);
      if (saved.error) throw saved.error;
      return NextResponse.json({ url: session.url });
    });
  } catch {
    return NextResponse.json({ error: 'Billing could not continue safely. Please retry shortly or contact support. If you already have a subscription, we will not start a second one.' }, { status: 503 });
  }
}
