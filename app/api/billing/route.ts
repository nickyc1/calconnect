import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/billing
 * Returns the caller's current plan + entitlement so the dashboard can:
 *   - Show the correct upgrade CTA
 *   - Render "You have N of M calendars connected"
 *   - Decide whether to gate the connect-calendar button
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: billing } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('plan, subscription_status, base_calendars, extra_calendars, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  const entitled = ((billing as any)?.base_calendars || 0) + ((billing as any)?.extra_calendars || 0);
  const plan = (billing as any)?.plan || 'free';

  return NextResponse.json({
    plan,
    subscription_status: (billing as any)?.subscription_status || null,
    base_calendars: (billing as any)?.base_calendars || 0,
    extra_calendars: (billing as any)?.extra_calendars || 0,
    entitled_calendars: entitled,
    current_period_end: (billing as any)?.current_period_end || null,
  });
}
