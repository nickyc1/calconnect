import { NextRequest } from 'next/server';
import Stripe from 'stripe';
const mockSubs = jest.fn();
let mockProcessed = new Set<string>();
let mockUpdates: any[] = [];
let mockFailure = false;
const mockDb: any = { from: (table: string) => {
  let id = ''; let update: any;
  const q: any = {
    select: () => q, eq: (_: string, value: string) => { id = value; return q; },
    maybeSingle: async () => ({ data: table === 'processed_webhooks' ? (mockProcessed.has(id) ? { event_id: id } : null) : { user_id: 'test_user', plan: 'basic', lifetime_entitled: false }, error: null }),
    update: (value: any) => { update = value; return q; },
    insert: async (value: any) => { mockProcessed.add(value.event_id); return { error: null }; },
    then: (resolve: any) => { if (update && !mockFailure) mockUpdates.push(update); return Promise.resolve({ data: [], error: mockFailure ? { message: 'DB unavailable' } : null }).then(resolve); },
  }; return q;
} };
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('@/lib/operation-lock', () => ({ withOperationLock: async (_: any, fn: any) => fn() }));
jest.mock('@/lib/stripe', () => ({ ...jest.requireActual('@/lib/stripe'), stripe: {
  webhooks: new (require('stripe'))('sk_test_fixture').webhooks,
  subscriptions: { list: () => ({ autoPagingToArray: mockSubs }) },
} }));
import { POST } from '@/app/api/stripe/webhook/route';
const signer = new Stripe('sk_test_fixture');
function request(id='evt_test_replay') {
  const payload = JSON.stringify({ id, type: 'customer.subscription.deleted', data: { object: { customer: 'cus_test', items: { data: [] } } } });
  return new NextRequest('https://example.com/api/stripe/webhook', { method:'POST', body:payload, headers:{ 'stripe-signature':signer.webhooks.generateTestHeaderString({ payload, secret:'whsec_local_fixture' }) } });
}
beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET='whsec_local_fixture'; mockProcessed=new Set();mockUpdates=[];mockFailure=false;
  mockSubs.mockResolvedValue([{ id:'sub_pro',status:'active',metadata:{user_id:'test_user'},items:{data:[{id:'si_pro',price:{id:'price_pro'},quantity:1}]} }]);
});
test('signed deletion replay reconciles current Pro once and deduplicates delivery',async()=>{
  expect((await POST(request())).status).toBe(200);
  expect(mockUpdates[0].plan).toBe('pro');
  expect(await (await POST(request())).json()).toEqual({received:true,deduped:true});
  expect(mockUpdates).toHaveLength(1);
});
test('failed reconciliation is retryable and not marked processed',async()=>{
  mockFailure=true;expect((await POST(request())).status).toBe(500);expect(mockProcessed.size).toBe(0);
  mockFailure=false;expect((await POST(request())).status).toBe(200);expect(mockUpdates).toHaveLength(1);
});
