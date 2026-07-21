import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe, priceIdToPlan, STRIPE_PRICES } from '@/lib/stripe';

// Force Node.js runtime and dynamic rendering. Stripe signature verification
// requires the EXACT raw bytes Stripe sent — any re-serialization breaks it.
// Edge runtime or static/cached responses would corrupt the body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events. Per rafter-secure-design:
 *   1. Verify signature with stripe.webhooks.constructEvent — never trust the payload
 *   2. Dedupe on event.id via processed_webhooks — Stripe retries on failure
 *   3. Bind entitlement changes to the user via subscription.metadata.user_id
 *      (set in checkout session creation, guaranteed server-side)
 *
 * Events handled:
 *   - customer.subscription.created / updated → recompute plan + base_calendars + extra_calendars from subscription items
 *   - customer.subscription.deleted           → downgrade to free
 *   - invoice.payment_succeeded               → mark active + refresh period end
 *   - invoice.payment_failed                  → mark past_due
 *   - checkout.session.completed              → primarily logged; subscription events do the real work
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Read as raw bytes (not string) so Next.js can't reformat the payload.
  // Stripe signs the exact byte sequence; any JSON reserialization breaks it.
  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('stripe webhook: signature verification failed', err.message, {
      bodyLen: rawBody.length,
      sigPresent: !!sig,
      secretPrefix: webhookSecret.slice(0, 8),
    });
    return NextResponse.json({ error: `Signature verification failed: ${err.message}` }, { status: 400 });
  }

  // Idempotency: skip if we've already processed this event.
  const { data: existing } = await (supabaseAdmin as any)
    .from('processed_webhooks')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      case 'checkout.session.completed':
        // Subscription creation event fires alongside this and does the real work.
        // We log for audit but don't need to grant entitlements here.
        console.log(`stripe webhook: checkout.session.completed ${event.id}`);
        break;

      default:
        console.log(`stripe webhook: unhandled event type ${event.type}`);
    }

    // Mark as processed only after successful handling — so a thrown error triggers Stripe's retry.
    await (supabaseAdmin as any)
      .from('processed_webhooks')
      .insert({ event_id: event.id, event_type: event.type });

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`stripe webhook: handler error for ${event.type} (${event.id})`, err);
    return NextResponse.json({ error: err?.message || 'Handler error' }, { status: 500 });
  }
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const userId = (sub.metadata as any)?.user_id;
  if (!userId) {
    console.error(`stripe webhook: subscription ${sub.id} has no metadata.user_id — cannot bind to account`);
    return;
  }

  // Walk the subscription items to compute plan and calendar entitlements.
  // A subscription may have: 1 base-plan item (Basic OR Pro) + 1 Extra Calendar item, OR just 1 of either.
  let plan: 'lifetime' | 'basic' | 'pro' | 'free' = 'free';
  let baseCalendars = 0;
  let extraCalendars = 0;

  for (const item of sub.items.data) {
    const priceId = item.price.id;
    const planMatch = priceIdToPlan(priceId);
    if (planMatch) {
      plan = planMatch.plan;
      baseCalendars = planMatch.baseCalendars;
    } else if (priceId === STRIPE_PRICES.extraCalendar) {
      extraCalendars = item.quantity || 0;
    }
  }

  // If the user had an LTD plan but is now subscribing to Basic/Pro, the base
  // plan supersedes lifetime (they can't have both simultaneously).
  // If they only bought Extra Calendars on top of LTD (no base plan item), we
  // preserve their existing plan='lifetime' + base_calendars=2.
  const { data: current } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('plan, base_calendars')
    .eq('user_id', userId)
    .maybeSingle();

  if (plan === 'free' && (current as any)?.plan === 'lifetime') {
    plan = 'lifetime';
    baseCalendars = (current as any).base_calendars || 2;
  }

  const status = sub.status;
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const isActive = activeStatuses.has(status);

  // Stripe API 2024-06-20+ moved current_period_end from the top-level
  // subscription onto each subscription item. Fall back to top-level for
  // older API versions, then to the first item.
  const periodEndSec =
    (sub as any).current_period_end ||
    (sub as any).items?.data?.[0]?.current_period_end;
  const periodEnd = periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null;

  await (supabaseAdmin as any)
    .from('user_billing')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        plan: isActive ? plan : 'free',
        subscription_status: status,
        base_calendars: isActive ? baseCalendars : 0,
        extra_calendars: isActive ? extraCalendars : 0,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = (sub.metadata as any)?.user_id;
  if (!userId) return;

  // Downgrade to free but preserve stripe_customer_id for future purchases.
  // If the user has an LTD entitlement from AppSumo, keep that intact.
  const { data: current } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('plan, base_calendars')
    .eq('user_id', userId)
    .maybeSingle();

  const isLifetime = (current as any)?.plan === 'lifetime';

  await (supabaseAdmin as any)
    .from('user_billing')
    .update({
      stripe_subscription_id: null,
      plan: isLifetime ? 'lifetime' : 'free',
      subscription_status: 'canceled',
      base_calendars: isLifetime ? 2 : 0,
      extra_calendars: 0,
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subId = (invoice as any).subscription;
  if (!subId || typeof subId !== 'string') return;
  // Rehydrate from the subscription — invoice paid means we should re-read the
  // subscription and recompute in case periods rolled over.
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    await handleSubscriptionUpsert(sub);
  } catch (err) {
    console.error(`stripe webhook: failed to rehydrate sub ${subId}`, err);
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const subId = (invoice as any).subscription;
  if (!subId || typeof subId !== 'string') return;
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = (sub.metadata as any)?.user_id;
  if (!userId) return;

  await (supabaseAdmin as any)
    .from('user_billing')
    .update({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}
