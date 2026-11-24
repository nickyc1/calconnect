import type { ActivationState } from './state';
export const SEQUENCE_VERSION = 'activation-v1';
export const DAY = 86400000;
export type Step = 'welcome' | 'next_step' | 'help' | 'success' | 'existing_1' | 'existing_2';
export function nextStep(state: ActivationState, profile: any, sent: string[], now = Date.now()): Step | null {
  if (!profile?.email_opt_in_at || profile.unsubscribed_at || profile.suppressed || !profile.enrolled_at ||
    !state.entitled || state.supportOpen || state.needsReauth) return null;
  if (profile.last_email_at && now - Date.parse(profile.last_email_at) < DAY) return null;
  const age = now - Date.parse(profile.enrolled_at);
  if (age < 0) return null;
  if (state.confirmedAt) return sent.includes('success') ? null : 'success';
  // Live mirrors stop setup reminders, even before the customer confirms visually.
  if (state.firstMirrorAt) return null;
  if (profile.cohort === 'existing') {
    if (age >= 14 * DAY) return null;
    if (!sent.includes('existing_1')) return 'existing_1';
    return age >= 7 * DAY && !sent.includes('existing_2') ? 'existing_2' : null;
  }
  if (profile.cohort !== 'new' || age >= 7 * DAY) return null;
  if (!sent.includes('welcome')) return 'welcome';
  if (age >= 3 * DAY && !sent.includes('help')) return 'help';
  if (age >= DAY && !sent.includes('next_step') && !sent.includes('help')) return 'next_step';
  return null;
}
const guidance: Record<string, string> = {
  first_calendar: 'Start by connecting the Google calendar where you create meetings. Then add the calendar where you want those times blocked.',
  second_calendar: 'Your first calendar is connected. Add the Google calendar where you want busy blocks to appear.',
  source: 'Choose a Source calendar: the one where you create meetings. If it is already selected, reconnect it to renew its Google connection.',
  test_event: 'Create a new future event on your Source calendar and mark it Busy. Then check the same time on your other calendar. Existing events are not copied by default. If you use a mirror window, choose a time inside it.',
};
export function renderEmail(step: Step, state: ActivationState, origin: string) {
  const tip = guidance[state.stage] || 'Open your dashboard to check your calendar connections.';
  const messages: Record<Step, { subject: string; text: string }> = {
    welcome: { subject: 'Connect your calendars and try one busy block', text: `Welcome to CalConnect. The first goal is simple: see a busy block from one calendar appear on another.\n\n${tip}` },
    next_step: { subject: state.calendars < 2 ? 'Your next calendar is the next step' : 'Try one new event to check your setup', text: `Here is the next step for your CalConnect setup.\n\n${tip}\n\nYour Source calendar is where meetings start. Your other connected calendar receives the busy blocks.` },
    help: { subject: 'Need a hand connecting your calendars?', text: `Your first calendar mirror has not been recorded yet.\n\n${tip}\n\nOpen “Get setup help” in your dashboard and tell us where you got stuck. The request includes your setup progress so you do not have to explain every step again.` },
    success: { subject: 'You saw your first busy block', text: 'Your first busy block is confirmed. CalConnect can keep working in the background; you do not need to open the dashboard every day.\n\nFor two-way mirroring, turn on Source for both calendars. Otherwise, keep only the calendar where meetings start as a Source. You can review those settings in your dashboard.' },
    existing_1: { subject: 'Finish connecting your CalConnect calendars', text: `You opted in to calendar guidance, and your setup still has a step left.\n\n${tip}\n\nOpen “Get setup help” in the dashboard if you would like a hand.` },
    existing_2: { subject: 'A final reminder to try your first busy block', text: `${tip}\n\nThis is the last reminder in this setup sequence. You can return to your dashboard whenever you are ready, or use “Get setup help” there.` },
  };
  const message = messages[step];
  return { ...message, text: `${message.text}\n\nContinue setup: ${origin}/dashboard\n\nCalConnect Support` };
}
export function internalEmail(email: string) {
  const [local, domain] = email.toLowerCase().split('@');
  const base = local.split('+')[0];
  return domain === 'raxdigital.com' || (domain === 'appsumo.com' && base === 'nick') ||
    (domain === 'gmail.com' && ['n.christensen4', 'nickchristensen'].includes(base));
}
