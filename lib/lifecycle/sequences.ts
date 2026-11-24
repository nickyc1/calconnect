import type { ActivationState } from './state';
export const SEQUENCE_VERSION = 'activation-v2';
export const DAY = 86400000;
export type Step = 'welcome' | 'next_step' | 'help' | 'success' | 'existing_1' | 'existing_2' | 'active_1' | 'active_2' | 'active_3';
export function nextStep(state: ActivationState, profile: any, sent: string[], now = Date.now()): Step | null {
  if (!profile?.email_opt_in_at || profile.unsubscribed_at || profile.suppressed || !profile.enrolled_at ||
    !state.entitled || state.supportOpen || state.needsReauth) return null;
  if (profile.last_email_at && now - Date.parse(profile.last_email_at) < DAY) return null;
  const age = now - Date.parse(profile.enrolled_at);
  if (age < 0) return null;
  if (state.confirmedAt) {
    if (!sent.includes('success')) return 'success';
    // Existing customers enter through explicit operator enrollment. Never infer
    // ongoing health from an old confirmation when current connections are broken.
    if (profile.cohort !== 'existing' || state.stage !== 'complete' || !state.firstMirrorAt) return null;
    const activeAge = now - Math.max(Date.parse(state.confirmedAt), Date.parse(profile.enrolled_at));
    if (!Number.isFinite(activeAge) || activeAge < 0 || activeAge >= 60 * DAY) return null;
    if (profile.last_email_at && now - Date.parse(profile.last_email_at) < 7 * DAY) return null;
    // Skip missed windows rather than sending a backlog of tips.
    if (activeAge >= 45 * DAY) return sent.includes('active_3') ? null : 'active_3';
    if (activeAge >= 21 * DAY) return sent.includes('active_2') ? null : 'active_2';
    if (activeAge >= 7 * DAY) return sent.includes('active_1') ? null : 'active_1';
    return null;
  }
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
    help: { subject: 'Need a hand connecting your calendars?', text: `Need help getting your first busy block to appear?\n\n${tip}\n\nOpen “Get setup help” in your dashboard and tell us where you got stuck. The request includes your setup progress so you do not have to explain every step again.` },
    success: { subject: 'You saw your first busy block', text: 'Your first busy block is confirmed. CalConnect can keep working in the background; you do not need to open the dashboard every day.\n\nFor two-way mirroring, turn on Source for both calendars. Otherwise, keep only the calendar where meetings start as a Source. You can review those settings in your dashboard.' },
    existing_1: { subject: 'Finish connecting your CalConnect calendars', text: `You opted in to calendar guidance, and your setup still has a step left.\n\n${tip}\n\nOpen “Get setup help” in the dashboard if you would like a hand.` },
    existing_2: { subject: 'A final reminder to try your first busy block', text: `${tip}\n\nThis is the last reminder in this setup sequence. You can return to your dashboard whenever you are ready, or use “Get setup help” there.` },
    active_1: { subject: 'Do meetings start on both calendars?', text: 'Your first busy block is confirmed. One setting to check: where do you create meetings?\n\nIf meetings start on both calendars, turn on Source for both so busy time can mirror in either direction. If meetings start on just one, keep that calendar as the Source.\n\nChoose the setup that matches how you actually use your calendars.' },
    active_2: { subject: 'Check your setup when your schedule changes', text: 'A new job, a new calendar, or a change in working hours can change where you need busy blocks.\n\nWhen that happens, check which calendars are connected and which are marked Source. If you use a mirror window, check that it covers the times you want mirrored.\n\nTo check the setup, create a new future event marked Busy on a Source calendar, inside your mirror window if you use one. Look for the busy block at the same time on your other calendar.' },
    active_3: { subject: 'Is CalConnect fitting your calendar routine?', text: 'You have tried your first busy block. Is there anything about your calendar setup that still feels awkward?\n\nIf something is not working the way you expect, open “Get setup help” in your dashboard and tell us what you want to happen. Your setup progress is included, so you do not have to start from scratch. Please leave private meeting details out of your message.\n\nIf everything is working for you, there is nothing you need to do. This is the last email in this tips sequence.' },
  };
  const message = messages[step];
  const cta = step === 'success' || step.startsWith('active_') ? 'Open your dashboard' : 'Continue setup';
  return { ...message, text: `${message.text}\n\n${cta}: ${origin}/dashboard\n\nCalConnect Support` };
}
export function internalEmail(email: string) {
  const [local, domain] = email.toLowerCase().split('@');
  const base = local.split('+')[0];
  return domain === 'raxdigital.com' || (domain === 'appsumo.com' && base === 'nick') ||
    (domain === 'gmail.com' && ['n.christensen4', 'nickchristensen'].includes(base));
}
