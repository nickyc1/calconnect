import type { ActivationState } from './state';
export const SEQUENCE_VERSION = 'activation-v3';
export const DAY = 86400000;
export type Step = 'welcome' | 'next_step' | 'help' | 'success' | 'existing_1' | 'existing_2' | 'active_1' | 'active_2' | 'active_3';
export function nextStep(state: ActivationState, profile: any, sent: string[], now = Date.now()): Step | null {
  if ((!profile?.email_opt_in_at && !profile?.tips_opt_in_at) || profile.unsubscribed_at || profile.suppressed || !profile.enrolled_at ||
    !state.entitled || state.supportOpen || state.needsReauth) return null;
  if (profile.last_email_at && now - Date.parse(profile.last_email_at) < DAY) return null;
  const age = now - Date.parse(profile.enrolled_at);
  if (age < 0) return null;
  if (state.confirmedAt) {
    if (profile.email_opt_in_at && !sent.includes('success')) return 'success';
    // Existing customers enter through explicit operator enrollment. Never infer
    // ongoing health from an old confirmation when current connections are broken.
    if (!profile.tips_opt_in_at || profile.cohort !== 'existing' || state.stage !== 'complete' || !state.firstMirrorAt) return null;
    const activeAge = now - Math.max(Date.parse(state.confirmedAt), Date.parse(profile.enrolled_at), Date.parse(profile.tips_opt_in_at));
    if (!Number.isFinite(activeAge) || activeAge < 0 || activeAge >= 60 * DAY) return null;
    if (profile.last_email_at && now - Date.parse(profile.last_email_at) < 7 * DAY) return null;
    // Skip missed windows rather than sending a backlog of tips.
    if (activeAge >= 45 * DAY) return sent.includes('active_3') ? null : 'active_3';
    if (activeAge >= 21 * DAY) return sent.includes('active_2') ? null : 'active_2';
    if (activeAge >= 7 * DAY) return sent.includes('active_1') ? null : 'active_1';
    return null;
  }
  if (!profile.email_opt_in_at) return null;
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
    welcome: { subject: "Hey, welcome to CalConnect 👋", text: `Hey! Nick here, I built CalConnect.
I wanted a simple way to keep calendars in sync without getting double-booked. Glad you're giving it a try.

Let's get your first busy block showing up on another calendar. That's when the setup starts to make sense.

${tip}` },
    next_step: { subject: state.calendars < 2 ? "Let's connect that next calendar" : 'Try one new event to check your setup', text: `Hey, a quick nudge to get your calendars working together 🙂

${tip}

The Source is the calendar where meetings start. Your other connected calendar gets the busy blocks.` },
    help: { subject: 'Want a hand with your calendars?', text: `Hey, getting stuck on setup is no fun. I'd like to help you get that first busy block working.

${tip}

You can also use “Get setup help” in the dashboard. It includes your setup progress, which saves a bit of back and forth.` },
    success: { subject: 'Your first busy block! 🙌', text: `Nice, you've confirmed your first busy block! CalConnect can keep working in the background now. One less thing to keep checking.

If you create meetings on both calendars, turn on Source for both to mirror busy time in either direction. If meetings only start on one, keep that one as the Source.` },
    existing_1: { subject: 'Want to finish setting up CalConnect?', text: `Hey, Nick here 👋 You signed up for calendar tips, and there's still a step left before your first busy block.

${tip}

If you're unsure how to set it up for your calendars, tell me what you'd like to happen. Happy to help you work through it.` },
    existing_2: { subject: 'One last nudge on your calendar setup', text: `Hey, one last nudge from me to try that first busy block 🙂

${tip}

I'll leave the setup reminders here. You can pick it back up whenever you're ready, and you're always welcome to ask me for a hand.` },
    active_1: { subject: 'Do meetings start on both calendars?', text: `Hey! A small setting worth checking now that you've seen your first busy block 👀

Do you create meetings on both calendars? If so, turn on Source for both so busy time can mirror in either direction. If meetings only start on one, keep that one as the Source.

For example, if you add work meetings to one calendar and personal appointments to another, you'd want both marked Source.` },
    active_2: { subject: 'New calendar? Give your setup a quick check', text: `Hey, calendars tend to multiply. New job, another project, suddenly there's one more to keep track of 😅

When your routine changes, check which calendars are connected and which are marked Source. If you use a mirror window, make sure it covers the times you want blocked.

To check it, create a new future event marked Busy on a Source calendar, inside your mirror window if you use one. Then look for the busy block at the same time on your other calendar.` },
    active_3: { subject: 'How is CalConnect working for you?', text: `Hey, how's CalConnect fitting into your routine? Anything still feel awkward?

I'd love to hear what you want your calendars to do, especially if you're having to work around something. A quick description is plenty. Please leave private meeting details out.

This is the last email in this tips sequence. Hope it's helped you get a little less calendar juggling in your day 🙂` },
  };
  const message = messages[step];
  const cta = step === 'success' || step.startsWith('active_') ? 'Open your dashboard' : 'Continue setup';
  return { ...message, text: `${message.text}\n\n${cta}: ${origin}/dashboard\n\nYou can reply to this email anytime. It comes straight to me.\n\nNick` };
}
export function internalEmail(email: string) {
  const [local, domain] = email.toLowerCase().split('@');
  const base = local.split('+')[0];
  return domain === 'raxdigital.com' || (domain === 'appsumo.com' && base === 'nick') ||
    (domain === 'gmail.com' && ['n.christensen4', 'nickchristensen'].includes(base));
}
