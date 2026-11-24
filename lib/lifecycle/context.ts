import { supabaseAdmin } from '@/lib/supabase';
import { activationState } from './state';
export async function activationContext(userId: string) {
  const db = supabaseAdmin as any;
  const results = await Promise.all([
    db.from('user_accounts').select('account_id,is_active,is_source_account,needs_reauth').eq('user_id', userId),
    db.from('watch_channels').select('account_id,expiration').eq('user_id', userId),
    db.from('user_billing').select('plan,base_calendars,extra_calendars').eq('user_id', userId).maybeSingle(),
    db.from('activation_profiles').select('*').eq('user_id', userId).maybeSingle(),
    db.from('activation_support_requests').select('id').eq('user_id', userId).is('resolved_at', null),
    db.from('appsumo_codes').select('revoked_at').eq('redeemed_by', userId),
  ]);
  for (const r of results) if (r.error) throw r.error;
  const [accounts, watches, billing, profile, support, codes] = results.map(r => r.data);
  if (billing?.plan === 'lifetime' && codes.length && codes.every((c: any) => c.revoked_at)) { billing.base_calendars = 0; billing.extra_calendars = 0; }
  return { profile, state: activationState(accounts, watches, billing, profile, support.length > 0) };
}
