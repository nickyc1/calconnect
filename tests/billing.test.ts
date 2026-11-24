import { computeEntitlement, existingPurchases } from '@/lib/billing/policy';
import { priceIdToPlan } from '@/lib/stripe';
const sub = (id: string, price: string, status = 'active', quantity = 1): any => ({ id, status, items: { data: [{ id: `si_${id}`, price: { id: price }, quantity, current_period_end: 1800000000 }] } });
test('Basic plus Pro keeps strongest access regardless of event ordering', () => {
  const basic = sub('basic', 'price_basic'), pro = sub('pro', 'price_pro');
  expect(computeEntitlement([basic, pro], false)).toEqual(computeEntitlement([pro, basic], false));
  expect(computeEntitlement([basic, pro], false)).toMatchObject({ plan: 'pro', base_calendars: 10, stripe_subscription_id: 'pro' });
});
test('canceled Basic cannot cancel Pro; canceled Pro restores redeemed lifetime', () => {
  expect(computeEntitlement([sub('basic', 'price_basic', 'canceled'), sub('pro', 'price_pro')], false).plan).toBe('pro');
  expect(computeEntitlement([sub('pro', 'price_pro', 'canceled')], true)).toMatchObject({ plan: 'lifetime', base_calendars: 2 });
});
test('add-ons aggregate only entitled subscriptions', () => {
  expect(computeEntitlement([sub('a', 'price_extra', 'active', 3), sub('b', 'price_extra', 'canceled', 5)], true)).toMatchObject({ plan: 'lifetime', extra_calendars: 3 });
});
test.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])('%s subscription blocks new base checkout', status => {
  expect(existingPurchases([sub('a', 'price_basic', status)], false)).toHaveLength(1);
});
test('only terminal subscriptions allow repurchase; addons do not count as base', () => {
  expect(existingPurchases([sub('a', 'price_basic', 'canceled'), sub('b', 'price_pro', 'incomplete_expired'), sub('c', 'price_extra')], false)).toHaveLength(0);
  expect(priceIdToPlan('')).toBeNull();
});
