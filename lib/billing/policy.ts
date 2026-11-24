import Stripe from 'stripe';
import { priceIdToPlan, STRIPE_PRICES } from '@/lib/stripe';
export const isOpenSubscription = (s: Stripe.Subscription) => !['canceled', 'incomplete_expired'].includes(s.status);
export const baseItems = (s: Stripe.Subscription) => s.items.data.filter(i => priceIdToPlan(i.price.id));
export function existingPurchases(subs: Stripe.Subscription[], addon: boolean) {
  return subs.filter(isOpenSubscription).filter(s => addon
    ? s.items.data.some(i => !!STRIPE_PRICES.extraCalendar && i.price.id === STRIPE_PRICES.extraCalendar)
    : baseItems(s).length > 0);
}
export function computeEntitlement(subs: Stripe.Subscription[], lifetime: boolean) {
  let plan = lifetime ? 'lifetime' : 'free';
  let base = lifetime ? 2 : 0;
  let extra = 0;
  let primary: Stripe.Subscription | undefined;
  for (const sub of subs) {
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) continue;
    for (const item of sub.items.data) {
      const match = priceIdToPlan(item.price.id);
      if (match && match.baseCalendars > base) { plan = match.plan; base = match.baseCalendars; primary = sub; }
      if (STRIPE_PRICES.extraCalendar && item.price.id === STRIPE_PRICES.extraCalendar) extra += item.quantity || 0;
    }
  }
  const end = (primary as any)?.current_period_end || (primary?.items.data[0] as any)?.current_period_end;
  return { plan, base_calendars: base, extra_calendars: extra,
    stripe_subscription_id: primary?.id || null,
    subscription_status: primary?.status || (lifetime ? 'active' : 'canceled'),
    current_period_end: end ? new Date(end * 1000).toISOString() : null };
}
