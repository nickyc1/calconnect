'use client';
import { useEffect, useState } from 'react';
export default function ActivationAdmin() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  async function load(page = offset) {
    const r = await fetch(`/api/admin/activation?offset=${page}`, { cache: 'no-store' });
    const result = await r.json(); if (!r.ok) { setError(result.error); return; } setData(result);
  }
  useEffect(() => { load(offset).catch(() => setError('Could not load review queue')); }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(body: any) {
    setBusy(true); setError('');
    try { const r = await fetch('/api/admin/activation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 960, margin: '40px auto', padding: 24 }}>
    <h1>Activation review</h1><p>Review recipients and copy before approving. Sending also requires the server email switch. Support requests pause reminders.</p>
    {error && <p role="alert">{error}</p>}
    <h2>Setup help</h2>{data?.support.map((r: any) => <article key={r.id} style={{ borderBottom: '1px solid #ddd', padding: 16 }}>
      <p>{data.emails[r.user_id]} · {r.created_at}</p><p>{r.message}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.snapshot, null, 2)}</pre>
      <button disabled={busy} onClick={() => act({ action: 'resolve', id: r.id })}>Mark resolved; resume eligible reminders</button>
    </article>)}
    <h2>Email enrollment</h2><p>Incomplete setup: two reminders. Confirmed active setup: success email with setup consent; separate tips consent is required for three tips at 7, 21 and 45 days after enrollment or confirmation, whichever is later. Every message requires review; delivery stays controlled by the server email switch.</p>{data?.profiles.map((p: any) => <article key={p.user_id} style={{ padding: 12 }}>
      <span>{data.emails[p.user_id]} · {p.cohort || 'Not enrolled'} · setup consent {p.email_opt_in_at || 'none'} · optional tips consent {p.tips_opt_in_at || 'none'} </span>
      {!p.enrolled_at && <button disabled={busy} onClick={() => act({ action: 'enroll_existing', userId: p.user_id })}>Enroll in existing-customer guidance</button>}
      {p.enrolled_at && <button disabled={busy} onClick={() => act({ action: 'prepare', userId: p.user_id })}>Prepare next email for review</button>}
    </article>)}
    <h2>Email review queue</h2>{data?.outbox.map((r: any) => <article key={r.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      <p>From: {r.payload.from} · Reply to: {r.payload.replyTo}</p><p>To: {r.payload.to} · {r.step} · {r.status}</p><h3>{r.payload.subject}</h3><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{r.payload.text}</pre>
      <p>Footer: {r.payload.address}. A personal unsubscribe link is appended at delivery.</p>
      {r.status === 'review' && <button disabled={busy} onClick={() => act({ action: 'approve', id: r.id, payload: r.payload })}>Approve this recipient and email</button>}
    </article>)}
    <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous page</button>{' '}
    <button onClick={() => setOffset(offset + 100)}>Next page</button>
  </main>;
}
