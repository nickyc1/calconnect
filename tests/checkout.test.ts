import { NextRequest } from 'next/server';
const mockStripe: any = {
  customers: { retrieve: jest.fn(), create: jest.fn() }, subscriptions: { list: jest.fn() },
  checkout: { sessions: { list: jest.fn(), retrieve: jest.fn(), create: jest.fn(), expire: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
};
let mockAttempt: any = null;
let mockBilling: any = { stripe_customer_id: 'cus_1', plan: 'basic' };
let mockSaveError: any = null;
const mockDb: any = { from: jest.fn((table: string) => {
  const q: any = {};
  for (const method of ['select','eq','update','upsert']) q[method] = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => ({ data: table === 'user_billing' ? mockBilling : mockAttempt, error: null }));
  q.then = (resolve: any) => Promise.resolve({ error: mockSaveError }).then(resolve);
  return q;
}) };
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('@/lib/supabase-server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user_1', email: 'customer@example.com' } } }) } }) }));
jest.mock('@/lib/operation-lock', () => ({ withOperationLock: async (_: any, fn: any) => fn() }));
jest.mock('@/lib/stripe', () => ({ ...jest.requireActual('@/lib/stripe'), stripe: mockStripe }));
import { POST } from '@/app/api/stripe/checkout/route';
const subscription = (id: string, price = 'price_basic', status = 'active'): any => ({ id, status, items: { data: [{ id: `si_${id}`, price: { id: price }, quantity: 1 }] } });
const request = (intent = 'pro_monthly', quantity?: number) => new NextRequest('https://example.com/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ intent, quantity }), headers: { origin: 'https://untrusted.example' } });
beforeEach(() => {
  process.env.STRIPE_ADDON_PORTAL_CONFIGURATION_ID = 'bpc_addon';
  jest.clearAllMocks(); mockAttempt = null; mockSaveError = null; mockBilling = { stripe_customer_id: 'cus_1', plan: 'basic' };
  mockStripe.customers.retrieve.mockResolvedValue({ id: 'cus_1', metadata: { user_id: 'user_1' } });
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_basic')] });
  mockStripe.checkout.sessions.list.mockReturnValue({ autoPagingToArray: async () => [] });
  mockStripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/test' });
  mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/new' });
});
test('upgrade confirms a replacement price on the same subscription item', async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
    return_url: 'https://www.calconnect.io/dashboard',
    flow_data: expect.objectContaining({ subscription_update_confirm: { subscription: 'sub_basic', items: [{ id: 'si_sub_basic', price: 'price_pro', quantity: 1 }] } }),
  }));
});
test('existing duplicate subscriptions are held; neither is changed', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_basic'), subscription('sub_pro', 'price_pro')] });
  expect((await POST(request())).status).toBe(409);
  expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});
test('portal failure cannot fall back to new checkout', async () => {
  mockStripe.billingPortal.sessions.create.mockRejectedValueOnce(new Error('portal not configured'));
  expect((await POST(request())).status).toBe(503);
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});
test('new customer checkout persists an idempotent attempt and grants first trial', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [] });
  expect((await POST(request())).status).toBe(200);
  expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ subscription_data: expect.objectContaining({ trial_period_days: 7 }) }), { idempotencyKey: expect.stringMatching(/^calconnect-checkout-/) });
});
test('checkout save failure is recovered from matching Stripe attempt metadata', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [] });
  mockAttempt = { request_id: 'request_1', intent: 'pro_monthly', quantity: 1, session_id: null, created_at: new Date().toISOString() };
  mockStripe.checkout.sessions.list.mockReturnValue({ autoPagingToArray: async () => [{ id: 'cs_existing', mode: 'subscription', metadata: { attempt_id: 'request_1' }, url: 'https://checkout.stripe.com/existing' }] });
  expect(await (await POST(request())).json()).toEqual({ url: 'https://checkout.stripe.com/existing' });
  expect(mockStripe.checkout.sessions.expire).not.toHaveBeenCalled();
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});
test('database failure cannot open a checkout', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [] });
  mockSaveError = new Error('database unavailable');
  expect((await POST(request())).status).toBe(503);
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});
test('returning canceled subscriber does not receive another trial', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_old', 'price_basic', 'canceled')] });
  await POST(request());
  expect(mockStripe.checkout.sessions.create.mock.calls[0][0].subscription_data.trial_period_days).toBeUndefined();
});
test('fractional addon quantity is rejected before Stripe calls', async () => {
  expect((await POST(request('extra_calendar', 1.5))).status).toBe(400);
  expect(mockStripe.customers.retrieve).not.toHaveBeenCalled();
});
test('adding another calendar updates the existing addon quantity', async () => {
  const addon = subscription('sub_extra', 'price_extra'); addon.items.data[0].quantity = 2;
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_basic'), addon] });
  expect((await POST(request('extra_calendar'))).status).toBe(200);
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  expect(mockStripe.billingPortal.sessions.create.mock.calls[0][0].flow_data.subscription_update_confirm.items[0].quantity).toBe(3);
});

test('completed base checkout permits a first addon once its subscription is visible', async () => {
  mockAttempt = { request_id: 'base_attempt', intent: 'basic_monthly', quantity: 1, session_id: 'cs_base', created_at: new Date().toISOString() };
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', subscription: 'sub_basic' });
  expect((await POST(request('extra_calendar'))).status).toBe(200);
  expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
});
test('completed checkout blocks another purchase while subscription propagation is pending', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [] });
  mockAttempt = { request_id: 'base_attempt', intent: 'basic_monthly', quantity: 1, session_id: 'cs_base', created_at: new Date().toISOString() };
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', subscription: 'sub_pending' });
  expect((await POST(request())).status).toBe(409);
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});

test('addon uses its separate quantity-only portal', async () => {
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_basic'), subscription('sub_extra','price_extra')] });
  expect((await POST(request('extra_calendar'))).status).toBe(200);
  expect(mockStripe.billingPortal.sessions.create.mock.calls[0][0].configuration).toBe('bpc_addon');
});
test('missing addon configuration cannot use the base-plan portal', async () => {
  delete process.env.STRIPE_ADDON_PORTAL_CONFIGURATION_ID;
  mockStripe.subscriptions.list.mockReturnValue({ autoPagingToArray: async () => [subscription('sub_extra','price_extra')] });
  expect((await POST(request('extra_calendar'))).status).toBe(503);
  expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
});
