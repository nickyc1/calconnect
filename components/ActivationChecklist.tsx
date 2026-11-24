'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ActivationState } from '@/lib/lifecycle/state';
const copy = {
  no_plan: ['Choose your plan', 'Redeem your AppSumo code or choose a plan to connect your calendars.'],
  reconnect: ['Reconnect Google', 'A calendar needs permission again. Reconnect the account marked below to resume syncing.'],
  first_calendar: ['Connect your first Google calendar', 'Start with the calendar where you create meetings.'],
  second_calendar: ['Connect a second Google calendar', 'Choose the calendar where you want busy blocks to appear.'],
  source: ['Choose where meetings come from', 'Turn on Source for the calendar where you create meetings. If it is already a Source, reconnect it to renew its connection.'],
  test_event: ['Create your first test event', 'In Google Calendar, create a new future event on your Source calendar and mark it Busy. Check the same time on your other calendar. Existing events are not copied by default. If you set a mirror window, choose a time inside it.'],
  confirm: ['Your first busy block was created', 'Open your other Google calendar and check the busy block. Then confirm below that you can see it.'],
  complete: ['Your calendars are connected', 'New busy events from your Source calendar now have a path to your other calendar. CalConnect works in the background.'],
} as const;
export default function ActivationChecklist({ onConnect }: { onConnect: () => void }) {
  const [data, setData] = useState<{ state: ActivationState; dismissed: boolean; emailOptIn: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try { const r = await fetch('/api/onboarding', { cache: 'no-store' }); if (r.ok) setData(await r.json()); }
    catch { /* Existing dashboard remains usable if setup status cannot load. */ }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
  async function save(action: string, value?: boolean) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, value }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error); setData(result);
    } catch (e: any) { setError(e.message || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  }
  if (!data) return null;
  const s = data.state;
  const steps = [s.calendars >= 1, s.calendars >= 2, s.readySources >= 1, !!s.confirmedAt];
  const title = copy[s.stage];
  return <section className="cc-setup" aria-label="Calendar setup" style={{ border: '1px solid #e0d9ce', borderRadius: 12, background: '#fffaf2', padding: '1.5rem', marginBottom: '1.5rem' }}>
    <style>{`
      .cc-setup button { border: 1px solid #c6b9a8; border-radius: 6px; background: white; color: #24231f; padding: 9px 13px; min-height: 40px; cursor: pointer; font: inherit; }
      .cc-setup button:disabled { opacity: .6; cursor: wait; }
      .cc-setup a { color: #a33f19; text-underline-offset: 3px; }
      .cc-setup input { margin-right: 6px; }
      .cc-setup textarea { box-sizing: border-box; padding: 10px; border: 1px solid #b8ad9f; border-radius: 6px; font: inherit; }
      .cc-setup button:focus-visible, .cc-setup a:focus-visible, .cc-setup textarea:focus-visible { outline: 3px solid #a33f19; outline-offset: 3px; }
    `}</style>
    {data.dismissed ? <button onClick={() => save('dismiss', false)} disabled={busy}>Show calendar setup</button> : <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <h3 style={{ marginTop: 0 }}>{title[0]}</h3><button aria-label="Hide setup checklist" onClick={() => save('dismiss', true)} disabled={busy}>Hide</button>
      </div>
      <p>{title[1]}</p>
      <ol style={{ paddingLeft: 22, lineHeight: 1.9 }}>
        {['Connect your first calendar', 'Connect your second calendar', 'Choose a Source calendar', 'See your first busy block'].map((label, i) => <li key={label}>{steps[i] ? '✓ ' : ''}{label}</li>)}
      </ol>
      <p aria-live="polite">{steps.filter(Boolean).length} of 4 complete</p>
      {s.stage === 'no_plan' ? <a href="/onboarding">Choose a plan or redeem a code</a> :
        ['first_calendar', 'second_calendar', 'reconnect'].includes(s.stage) ? <button onClick={onConnect}>Connect Google Calendar</button> :
        s.stage === 'source' ? <a href="#connected-accounts">Choose a Source below</a> :
        s.stage === 'test_event' ? <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer">Open Google Calendar</a> :
        s.stage === 'confirm' ? <button disabled={busy} onClick={() => save('confirm')}>I can see the busy block</button> : null}
    </>}
    <div style={{ marginTop: 18 }}>
      <label><input type="checkbox" disabled={busy} checked={data.emailOptIn} onChange={e => save('email_preference', e.target.checked)} /> Email me setup tips and occasional calendar guidance. Unsubscribe anytime.</label>
    </div>
    <p><button onClick={() => setHelp(!help)}>Get setup help</button></p>
    {help && <div>
      {s.supportOpen ? <p>Your request is in the support queue. Setup reminders are paused. You can also <a href="mailto:n.christensen4@gmail.com?subject=CalConnect%20setup%20help">email support</a>.</p> : <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try { const r = await fetch('/api/onboarding/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
          const result = await r.json(); if (!r.ok) throw new Error(result.error); await load();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
        <label htmlFor="setup-help-message">What are you trying to connect, and where did you get stuck?</label>
        <textarea id="setup-help-message" required maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 90, margin: '8px 0' }} />
        <p>Included with your request: {s.calendars} calendars, {s.readySources} ready Sources, setup step “{s.stage}”, and whether a mirror succeeded. No event titles or calendar contents.</p>
        <button disabled={busy} type="submit">Request setup help</button>
      </form>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
