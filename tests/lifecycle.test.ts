import { activationState } from '@/lib/lifecycle/state';
import { DAY, nextStep, internalEmail, renderEmail } from '@/lib/lifecycle/sequences';
import { unsubscribeToken, verifyUnsubscribe } from '@/lib/lifecycle/unsubscribe';
const now = Date.parse('2026-11-24T12:00:00Z');
const account = (id: string, source = false, reauth = false) => ({ account_id: id, is_active: true, is_source_account: source, needs_reauth: reauth });
const watch = { account_id: 'a', expiration: new Date(now + DAY).toISOString() };
const billing = { base_calendars: 2 };
const state = activationState([account('a', true), account('b')], [watch], billing, {}, false, now);
const profile = { email_opt_in_at: new Date(now - 4 * DAY).toISOString(), enrolled_at: new Date(now - 4 * DAY).toISOString(), cohort: 'new' };
test('expired watch is not a ready Source and reauth overrides completion', () => {
  expect(activationState([account('a', true), account('b')], [{ ...watch, expiration: new Date(now - 1).toISOString() }], billing, {}, false, now).stage).toBe('source');
  expect(activationState([account('a', true, true), account('b')], [watch], billing, { confirmed_at: 'yes' }, false, now).stage).toBe('reconnect');
});
test('server mirror and customer confirmation are separate steps', () => {
  expect(state.stage).toBe('test_event');
  expect(activationState([account('a', true), account('b')], [watch], billing, { first_live_mirror_at: 'yes' }, false, now).stage).toBe('confirm');
});
test.each([{ email_opt_in_at: null }, { unsubscribed_at: 'yes' }, { suppressed: true }, { last_email_at: new Date(now - 1000).toISOString() }])('suppression and frequency cap prevent email: %j', overrides => {
  expect(nextStep(state, { ...profile, ...overrides }, [], now)).toBeNull();
});
test('open support, no entitlement, live mirrors and reauth stop setup reminders', () => {
  for (const override of [{ supportOpen: true }, { entitled: false }, { firstMirrorAt: 'yes' }, { needsReauth: true }])
    expect(nextStep({ ...state, ...override }, profile, [], now)).toBeNull();
});
test('new sequence stops at seven days; confirmation sends once', () => {
  expect(nextStep(state, profile, ['welcome'], now)).toBe('help');
  expect(nextStep(state, profile, ['welcome','help'], now)).toBeNull();
  expect(nextStep(state, profile, [], now + 4 * DAY)).toBeNull();
  expect(nextStep({ ...state, firstMirrorAt: 'yes', confirmedAt: 'yes' }, profile, [], now)).toBe('success');
  expect(nextStep({ ...state, firstMirrorAt: 'yes', confirmedAt: 'yes' }, profile, ['success'], now)).toBeNull();
});
test('existing customer sequence is two reminders then stops', () => {
  const p = { ...profile, cohort: 'existing' };
  expect(nextStep(state, p, [], now)).toBe('existing_1');
  expect(nextStep(state, p, ['existing_1'], now)).toBeNull();
  expect(nextStep(state, p, ['existing_1'], now + 4 * DAY)).toBe('existing_2');
  expect(nextStep(state, p, ['existing_1','existing_2'], now + 4 * DAY)).toBeNull();
});
test('known internal plus aliases are excluded; copy explains new-event behavior', () => {
  expect(internalEmail('nick+testing@appsumo.com')).toBe(true);
  expect(internalEmail('customer@example.com')).toBe(false);
  expect(renderEmail('next_step', state, 'https://example.com').text).toContain('Existing events are not copied by default');
});
test('unsubscribe tokens cannot be altered or used for another user', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const token = unsubscribeToken(id);
  expect(verifyUnsubscribe(token)).toBe(id);
  expect(verifyUnsubscribe(token.replace('000001.', '000002.'))).toBeNull();
  expect(verifyUnsubscribe(token + 'x')).toBeNull();
});
