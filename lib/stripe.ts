import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is not set — Stripe features will fail');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2025-01-27.acacia' as any,
  typescript: true,
});

export const STRIPE_PRICES = {
  basicMonthly: process.env.STRIPE_BASIC_MONTHLY_PRICE_ID || '',
  basicYearly: process.env.STRIPE_BASIC_YEARLY_PRICE_ID || '',
  proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
  proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || '',
  extraCalendar: process.env.STRIPE_EXTRA_CALENDAR_PRICE_ID || '',
};

/**
 * Base calendar allotment per plan. Used to sync user_billing.base_calendars
 * whenever a subscription is created or its plan tier changes.
 */
export const PLAN_BASE_CALENDARS: Record<string, number> = {
  free: 0,
  lifetime: 2,
  basic: 3,
  pro: 10,
};

/**
 * Reverse-lookup a Stripe price ID to the internal plan tier + base calendars.
 * Returns null if the price isn't one of our recognized base-plan prices
 * (e.g., it's the Extra Calendar price, which is an add-on, not a base plan).
 */
export function priceIdToPlan(priceId: string): { plan: 'basic' | 'pro'; baseCalendars: number } | null {
  if (priceId === STRIPE_PRICES.basicMonthly || priceId === STRIPE_PRICES.basicYearly) {
    return { plan: 'basic', baseCalendars: PLAN_BASE_CALENDARS.basic };
  }
  if (priceId === STRIPE_PRICES.proMonthly || priceId === STRIPE_PRICES.proYearly) {
    return { plan: 'pro', baseCalendars: PLAN_BASE_CALENDARS.pro };
  }
  return null;
}
