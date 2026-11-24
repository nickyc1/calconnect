import { NextRequest } from 'next/server';
const mockDb = { from: jest.fn() };
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: mockDb }));
import { GET } from '@/app/api/cron/lifecycle/route';
import { POST } from '@/app/api/lifecycle/webhook/route';
beforeEach(() => { jest.clearAllMocks(); process.env.CRON_SECRET = 'test-cron-secret'; delete process.env.LIFECYCLE_EMAIL_ENABLED; });
test('email worker is disabled by default and never touches outbox or provider', async () => {
  const r = await GET(new NextRequest('https://example.com/api/cron/lifecycle', { headers: { authorization: 'Bearer test-cron-secret' } }));
  expect(await r.json()).toEqual({ enabled: false, sent: 0 });
  expect(mockDb.from).not.toHaveBeenCalled();
});
test('missing or incorrect worker auth fails closed', async () => {
  expect((await GET(new NextRequest('https://example.com/api/cron/lifecycle'))).status).toBe(401);
  delete process.env.CRON_SECRET;
  expect((await GET(new NextRequest('https://example.com/api/cron/lifecycle', { headers: { authorization: 'Bearer undefined' } }))).status).toBe(401);
});
test('unverified delivery webhooks cannot suppress users', async () => {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdC1vbmx5LXNlY3JldA==';
  const r = await POST(new NextRequest('https://example.com/api/lifecycle/webhook', { method: 'POST', body: JSON.stringify({ type: 'email.bounced', data: { to: ['customer@example.com'] } }) }));
  expect(r.status).toBe(400); expect(mockDb.from).not.toHaveBeenCalled();
});
