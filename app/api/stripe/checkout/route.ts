import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for one of:
 *   - Base plan subscription (basic monthly/yearly, pro monthly/yearly)
 *   - Extra Calendar add-on (quantity-based subscription)
 *
 * Body: { intent: 'basic_monthly' | 'basic_yearly' | 'pro_monthly' | 'pro_yearly' | 'extra_calendar', quantity?: number }
 *
 * Per rafter-secure-design:
 *   - Never trust client-supplied account_id — always take it from the server session
 *   - Use Stripe Checkout metadata.user_id to bind the purchase, verified in webhook
 *   - Reuse existing stripe_customer_id if the user has one (prevents duplicate customers)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const intent = body?.intent as string;
    const quantity = Math.max(1, Math.min(50, Number(body?.quantity) || 1));

    const priceMap: Record<string, string> = {
      basic_monthly: STRIPE_PRICES.basicMonthly,
      basic_yearly: STRIPE_PRICES.basicYearly,
      pro_monthly: STRIPE_PRICES.proMonthly,
      pro_yearly: STRIPE_PRICES.proYearly,
      extra_calendar: STRIPE_PRICES.extraCalendar,
    };

    const priceId = priceMap[intent];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid intent' }, { status: 400 });
    }

    // Reuse existing Stripe customer if the user already has one.
    const { data: billing } = await (supabaseAdmin as any)
      .from('user_billing')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId: string | undefined = (billing as any)?.stripe_customer_id || undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await (supabaseAdmin as any)
        .from('user_billing')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io';

    // 7-day free trial on Basic and Pro base plans. Extra-calendar add-ons
    // don't get a trial — they're an incremental charge for existing subscribers.
    // Stripe requires a card at checkout regardless (card captured, charged
    // on day 7). If the customer has previously trialed with the same email +
    // card, Stripe won't grant a second free trial automatically.
    const isBasePlan = intent !== 'extra_calendar';
    const trialDays = isBasePlan ? 7 : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        intent === 'extra_calendar'
          ? { price: priceId, quantity }
          : { price: priceId, quantity: 1 },
      ],
      success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
      allow_promotion_codes: true,
      // Bind this session to the user, checked in the webhook before we grant entitlements.
      metadata: { user_id: user.id, intent },
      subscription_data: {
        metadata: { user_id: user.id, intent },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('stripe/checkout error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
