import { NextRequest } from 'next/server';
const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockContext = jest.fn();
const mockUser = { id: 'owner', created_at: new Date().toISOString() };
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: () => ({ upsert: mockUpsert }) } }));
jest.mock('@/lib/supabase-server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }) }));
jest.mock('@/lib/lifecycle/context', () => ({ activationContext: (...args: any[]) => mockContext(...args) }));
import { POST } from '@/app/api/onboarding/route';
beforeEach(() => { jest.clearAllMocks(); mockContext.mockResolvedValue({ profile: null, state: {} }); });
async function change(action: string, value: boolean) {
  const res = await POST(new NextRequest('https://example.com/api/onboarding', { method: 'POST', body: JSON.stringify({ action, value }) }));
  expect(res.status).toBe(200);
  return mockUpsert.mock.calls[0][0];
}
test('setup consent never opts into tips and enrolls only recent setup users', async () => {
  const patch = await change('email_preference', true);
  expect(patch.email_opt_in_at).toBeTruthy(); expect(patch.tips_opt_in_at).toBeUndefined(); expect(patch.cohort).toBe('new');
});
test('tips consent never grants setup consent or automatically enrolls', async () => {
  const patch = await change('tips_preference', true);
  expect(patch.tips_opt_in_at).toBeTruthy(); expect(patch.email_opt_in_at).toBeUndefined(); expect(patch.enrolled_at).toBeUndefined();
});
test.each(['email_preference','tips_preference'])('turning one topic off does not turn off the other: %s', async action => {
  const patch = await change(action, false);
  expect(patch).toEqual({ user_id: 'owner', [action === 'email_preference' ? 'email_opt_in_at' : 'tips_opt_in_at']: null });
});
