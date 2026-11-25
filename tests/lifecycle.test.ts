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

const activeState = { ...state, stage: 'complete' as const, firstMirrorAt: new Date(now - 100 * DAY).toISOString(), confirmedAt: new Date(now - 100 * DAY).toISOString() };
const activeProfile = { ...profile, cohort: 'existing', enrolled_at: new Date(now).toISOString() };
test('active guidance uses later enrollment/confirmation with bounded windows and no backlog', () => {
  for (const [day, expected] of [[0,null],[6,null],[7,'active_1'],[20,'active_1'],[21,'active_2'],[44,'active_2'],[45,'active_3'],[59,'active_3'],[60,null]] as const)
    expect(nextStep(activeState, activeProfile, ['success'], now + day * DAY)).toBe(expected);
  expect(nextStep({ ...activeState, confirmedAt: new Date(now + 10 * DAY).toISOString() }, activeProfile, ['success'], now + 16 * DAY)).toBeNull();
  expect(nextStep(activeState, activeProfile, ['success','active_2'], now + 30 * DAY)).toBeNull();
  expect(nextStep(activeState, activeProfile, ['success','active_3'], now + 50 * DAY)).toBeNull();
});
test('active guidance requires consent, healthy setup, existing enrollment and weekly spacing', () => {
  for (const override of [{ email_opt_in_at:null },{ unsubscribed_at:'yes' },{ suppressed:true },{ cohort:'new' },{ enrolled_at:null },{ last_email_at:new Date(now + 19 * DAY).toISOString() }])
    expect(nextStep(activeState, { ...activeProfile, ...override }, ['success'], now + 21 * DAY)).toBeNull();
  for (const override of [{ supportOpen:true },{ needsReauth:true },{ entitled:false },{ stage:'source' as const },{ firstMirrorAt:null }])
    expect(nextStep({ ...activeState, ...override }, activeProfile, ['success'], now + 21 * DAY)).toBeNull();
  expect(nextStep(activeState, { ...activeProfile, last_email_at:new Date(now + 14 * DAY).toISOString() }, ['success'], now + 21 * DAY)).toBe('active_2');
});
test('success and active tips use dashboard CTA; help uses supportive copy', () => {
  expect(renderEmail('help', state, 'https://example.com').text).toContain('Get setup help');
  for (const step of ['success','active_1','active_2','active_3'] as const) {
    const copy = renderEmail(step, activeState, 'https://example.com').text;
    expect(copy).toContain('Open your dashboard: https://example.com/dashboard');
    expect(copy).not.toContain('Continue setup:');
  }
});
