export type ActivationStage = 'no_plan' | 'reconnect' | 'first_calendar' | 'second_calendar' | 'source' | 'test_event' | 'confirm' | 'complete';
export interface ActivationState {
  stage: ActivationStage; calendars: number; sources: number; readySources: number;
  entitled: boolean; needsReauth: boolean; firstMirrorAt: string | null;
  confirmedAt: string | null; supportOpen: boolean;
}
export function activationState(accounts: any[], watches: any[], billing: any, profile: any, supportOpen: boolean, now = Date.now()): ActivationState {
  const active = accounts.filter(a => a.is_active);
  const sources = active.filter(a => a.is_source_account);
  const ready = sources.filter(a => !a.needs_reauth && watches.some(w => w.account_id === a.account_id && Date.parse(w.expiration) > now));
  const entitled = (billing?.base_calendars || 0) + (billing?.extra_calendars || 0) >= 2;
  const needsReauth = active.some(a => a.needs_reauth);
  const stage: ActivationStage = !entitled ? 'no_plan' : needsReauth ? 'reconnect' : active.length === 0 ? 'first_calendar'
    : active.length === 1 ? 'second_calendar' : !ready.length ? 'source'
    : profile?.confirmed_at ? 'complete' : profile?.first_live_mirror_at ? 'confirm' : 'test_event';
  return { stage, calendars: active.length, sources: sources.length, readySources: ready.length,
    entitled, needsReauth, firstMirrorAt: profile?.first_live_mirror_at || null,
    confirmedAt: profile?.confirmed_at || null, supportOpen };
}
