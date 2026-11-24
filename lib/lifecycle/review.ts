import { supabaseAdmin } from '@/lib/supabase';
import { activationContext } from './context';
import { internalEmail, nextStep, renderEmail, SEQUENCE_VERSION } from './sequences';
export async function candidate(userId: string) {
  const db = supabaseAdmin as any;
  const [{ profile, state }, auth, history] = await Promise.all([
    activationContext(userId), db.auth.admin.getUserById(userId),
    db.from('lifecycle_outbox').select('step,status,sent_at').eq('user_id', userId),
  ]);
  if (auth.error || history.error) throw auth.error || history.error;
  const email = auth.data.user?.email;
  if (!email || !auth.data.user.email_confirmed_at || internalEmail(email)) return null;
  // Ambiguous provider responses and interrupted sends require manual reconciliation.
  if (history.data.some((r: any) => ['sending', 'unknown'].includes(r.status))) return null;
  const sent = history.data.filter((r: any) => r.status === 'sent').map((r: any) => r.step);
  const latestSent = history.data.filter((r: any) => r.sent_at).map((r: any) => r.sent_at).sort().pop();
  const step = nextStep(state, { ...profile, last_email_at: [profile?.last_email_at, latestSent].filter(Boolean).sort().pop() }, sent);
  if (!step) return null;
  return { step, payload: { to: email, ...renderEmail(step, state, process.env.NEXT_PUBLIC_APP_URL || 'https://www.calconnect.io'), version: SEQUENCE_VERSION, from: process.env.LIFECYCLE_EMAIL_FROM || '(sender not configured)', replyTo: process.env.LIFECYCLE_REPLY_TO || 'n.christensen4@gmail.com', address: process.env.LIFECYCLE_POSTAL_ADDRESS || '(business address not configured)' } };
}
