import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { activationContext } from '@/lib/lifecycle/context';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { profile, state } = await activationContext(user.id);
    return NextResponse.json({ state, dismissed: profile?.dismissed || false,
      emailOptIn: !!profile?.email_opt_in_at && !profile?.unsubscribed_at,
      tipsOptIn: !!profile?.tips_opt_in_at && !profile?.unsubscribed_at });
  } catch { return NextResponse.json({ error: 'Setup status is temporarily unavailable.' }, { status: 503 }); }
}
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const { profile, state } = await activationContext(user.id);
    const patch: any = { user_id: user.id };
    if (body.action === 'confirm') {
      if (!state.firstMirrorAt || !['confirm', 'complete'].includes(state.stage))
        return NextResponse.json({ error: 'Wait for a successful mirror before confirming.' }, { status: 409 });
      patch.confirmed_at = profile?.confirmed_at || new Date().toISOString();
    } else if (body.action === 'dismiss') patch.dismissed = body.value === true;
    else if (['email_preference', 'tips_preference'].includes(body.action) && typeof body.value === 'boolean') {
      // Each choice changes only its own topic. An explicit opt-in clears global unsubscribe.
      patch[body.action === 'tips_preference' ? 'tips_opt_in_at' : 'email_opt_in_at'] = body.value ? new Date().toISOString() : null;
      if (body.value) patch.unsubscribed_at = null;
      // Older customers require explicit operator enrollment after review.
      if (body.action === 'email_preference' && body.value && !profile?.enrolled_at && Date.now() - Date.parse(user.created_at) < 14 * 86400000) {
        patch.cohort = 'new'; patch.enrolled_at = new Date().toISOString();
      }
    } else return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const saved = await (supabaseAdmin as any).from('activation_profiles').upsert(patch);
    if (saved.error) throw saved.error;
    return GET();
  } catch { return NextResponse.json({ error: 'Could not save your setup preferences.' }, { status: 503 }); }
}
