import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session and returns its URL. The client
 * redirects the user to Stripe's hosted portal, where they can cancel their
 * subscription, update their payment method, download invoices, etc.
 *
 * Cancellation from the portal flips the subscription to cancel_at_period_end.
 * During trial: no charge at trial_end. During paid period: access until
 * period_end, then downgrades to free. The account itself is untouched.
 *
 * Requires: user must have a stripe_customer_id (created at first checkout).
 * Users on the free plan won't have one — surface a friendlier error there.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: billing } = await (supabaseAdmin as any)
      .from('user_billing')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId: string | undefined = (billing as any)?.stripe_customer_id || undefined;
    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription to manage yet.' },
        { status: 400 }
      );
    }

    // Same stale-customer defense as /api/stripe/checkout — if the stored
    // id lives only in a Stripe mode we've since left (or was deleted),
    // clear it and ask the user to complete checkout first. We don't
    // silently create a new empty customer here because the portal expects
    // real subscription state to manage.
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if ((existing as any).deleted) {
        customerId = undefined;
      }
    } catch (err: any) {
      const code = err?.code || err?.raw?.code;
      const status = err?.statusCode || err?.raw?.statusCode;
      if (code === 'resource_missing' || status === 404) {
        console.log(
          `stripe/portal: stored customer ${customerId} not found in current Stripe account for user ${user.id}`,
        );
        await (supabaseAdmin as any)
          .from('user_billing')
          .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        return NextResponse.json(
          { error: 'No active subscription found. Please subscribe first.' },
          { status: 400 },
        );
      }
      throw err;
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('stripe/portal error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
