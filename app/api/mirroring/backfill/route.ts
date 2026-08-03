import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { googleAuth } from '@/lib/google-auth';
import { googleCalendar } from '@/lib/google-calendar';
import { CalendarSyncService } from '@/lib/calendar-sync';
import { withRetry } from '@/utils/retry';

/**
 * Pro-only backfill v2 — rebuilt 2026-08-03 after the multi-source cascade
 * incident. Every change here traces back to a specific failure mode:
 *
 *   1. Cascade prevention — the loop now skips events tagged calconnect_is_mirror.
 *      Without this, source B's push mirrors get re-mirrored by source A's backfill
 *      and the whole thing amplifies exponentially.
 *
 *   2. Serialization — a user can only run ONE backfill at a time across all their
 *      sources. Enforced by refusing 'enable' if any of the user's other sources
 *      has backfill_status IN ('running', 'canceling'). Yesterday every source ran
 *      concurrently; that's what turned a bug into a disaster.
 *
 *   3. 1-year default horizon — was 5 years, which multiplied every problem by 5.
 *      Column backfill_horizon_years is a per-source setting the user picks in the
 *      preview modal.
 *
 *   4. Reliable delete — cleanup uses withRetry on Google delete calls, only marks
 *      a mapping as removed after Google confirms. Failures stay in the DB so a
 *      retry pass or the orphan-purge endpoint can pick them up.
 *
 *   5. Beta gate — the feature is only visible to users with
 *      user_billing.mirror_existing_beta=true during canary rollout.
 *
 * Contract:
 *   POST { accountId, action: 'enable', horizonYears? } → begin backfill
 *   POST { accountId, action: 'tick' }                  → process next chunk
 *   POST { accountId, action: 'disable' }               → chunked cleanup
 *   POST { accountId, action: 'undo' }                  → 24h post-completion undo
 *   GET  ?accountId=X                                   → current status
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK_SIZE = 40;
const DISABLE_CHUNK = 30;
const UNDO_WINDOW_HOURS = 24;

const syncService = new CalendarSyncService();

async function getBilling(userId: string) {
  const { data } = await (supabaseAdmin as any)
    .from('user_billing')
    .select('plan, mirror_existing_beta, mirror_dedupe_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

async function getSourceAccount(userId: string, accountId: string) {
  const { data } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('id, account_id, google_email, is_active, is_source_account, backfill_status, backfill_progress, backfill_total, backfill_cursor, backfill_started_at, backfill_completed_at, backfill_horizon_years, mirror_existing_enabled')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .maybeSingle();
  return data;
}

async function getDestAccounts(userId: string, excludeAccountId: string) {
  const { data } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id, google_email, is_active, mirror_color_id, mirror_label')
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('account_id', excludeAccountId);
  return (data as any[]) || [];
}

/**
 * Returns account_ids of any other source belonging to this user that is
 * currently in a state that should block starting a new backfill.
 */
async function findConflictingBackfills(userId: string, excludeAccountId: string): Promise<string[]> {
  const { data } = await (supabaseAdmin as any)
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', userId)
    .in('backfill_status', ['running', 'canceling'])
    .neq('account_id', excludeAccountId);
  return ((data as any[]) || []).map((r) => r.account_id);
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const acct = await getSourceAccount(user.id, accountId);
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const undoDeadline = (acct as any).backfill_completed_at
    ? new Date(new Date((acct as any).backfill_completed_at).getTime() + UNDO_WINDOW_HOURS * 3600_000).toISOString()
    : null;

  return NextResponse.json({
    enabled: (acct as any).mirror_existing_enabled,
    status: (acct as any).backfill_status,
    progress: (acct as any).backfill_progress,
    total: (acct as any).backfill_total,
    startedAt: (acct as any).backfill_started_at,
    completedAt: (acct as any).backfill_completed_at,
    undoDeadline,
    horizonYears: (acct as any).backfill_horizon_years || 1,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId: string | undefined = body?.accountId;
  const action: string | undefined = body?.action;
  const horizonYears: number = Math.max(1, Math.min(5, Number(body?.horizonYears) || 1));

  if (!accountId || !['enable', 'disable', 'tick', 'undo'].includes(action || '')) {
    return NextResponse.json({ error: 'accountId + valid action required' }, { status: 400 });
  }

  const billing = await getBilling(user.id);
  if (!billing || (billing as any).plan !== 'pro') {
    return NextResponse.json({ error: 'Mirroring existing events is a Pro feature.' }, { status: 402 });
  }
  if (!(billing as any).mirror_existing_beta) {
    return NextResponse.json({ error: 'This feature is in beta. Contact support to opt in.' }, { status: 403 });
  }

  const acct = await getSourceAccount(user.id, accountId);
  if (!acct) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const acctRow = acct as any;

  // ============================================================
  // enable — begin a new backfill. Enforces serialization.
  // ============================================================
  if (action === 'enable') {
    const conflicts = await findConflictingBackfills(user.id, accountId);
    if (conflicts.length > 0) {
      return NextResponse.json({
        error: `Another backfill is already running (${conflicts.join(', ')}). Wait for it to finish or cancel it first.`,
        conflicts,
      }, { status: 409 });
    }

    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({
        mirror_existing_enabled: true,
        backfill_status: 'running',
        backfill_progress: 0,
        backfill_total: null,
        backfill_cursor: null,
        backfill_started_at: new Date().toISOString(),
        backfill_completed_at: null,
        backfill_error: null,
        backfill_horizon_years: horizonYears,
      })
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true, status: 'running', progress: 0, total: null });
  }

  // ============================================================
  // undo — 24h post-completion cleanup, ONE atomic entry point
  // ============================================================
  if (action === 'undo') {
    if (!acctRow.backfill_completed_at) {
      return NextResponse.json({ error: 'No completed backfill to undo for this source.' }, { status: 400 });
    }
    const completed = new Date(acctRow.backfill_completed_at);
    const expiresAt = new Date(completed.getTime() + UNDO_WINDOW_HOURS * 3600_000);
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json({ error: 'Undo window has expired (24h after completion).' }, { status: 410 });
    }
    // Flip to canceling; the chunked disable path (below) drives cleanup.
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'canceling', mirror_existing_enabled: false })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true, status: 'canceling' });
  }

  // ============================================================
  // disable — chunked cleanup with reliable delete
  // ============================================================
  if (action === 'disable') {
    if (acctRow.backfill_status !== 'canceling') {
      await (supabaseAdmin as any)
        .from('user_accounts')
        .update({
          mirror_existing_enabled: false,
          backfill_status: 'canceling',
          backfill_cursor: null,
          backfill_error: null,
        })
        .eq('account_id', accountId)
        .eq('user_id', user.id);
    }

    const cancelFloor = acctRow.backfill_started_at || new Date(Date.now() - 24 * 3600_000).toISOString();

    const { data: mappings } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id, mirrored_events, via_backfill, created_at')
      .eq('user_id', user.id)
      .eq('source_account_id', accountId)
      .or(`via_backfill.eq.true,created_at.gte.${cancelFloor}`)
      .limit(DISABLE_CHUNK);

    const rows = (mappings as any[]) || [];
    let deleted = 0;
    let failed = 0;

    for (const row of rows) {
      // Track whether EVERY mirror event was successfully deleted before we
      // remove the mapping row. If any fail, keep the row so a retry pass
      // can find it — yesterday's bug was removing the row eagerly and
      // orphaning the Google event forever.
      let allDeleted = true;
      for (const mirror of (row.mirrored_events as any[]) || []) {
        try {
          const auth = await googleAuth.getClientByAccountId(user.id, mirror.account_id);
          await withRetry(
            () => googleCalendar.deleteEvent(auth, mirror.calendar_id || 'primary', mirror.event_id),
            {
              // 5 attempts × 2s backoff (compounding) can absorb the typical
              // Google rate-limit spike on the first cancel cycle without
              // needing a second manual re-cancel from the user. Previously
              // 3 × 500ms wasn't enough and orphans piled up when the burst
              // exceeded Google's per-second delete budget.
              maxRetries: 5,
              backoffMs: 2000,
              shouldRetry: (err: any) => {
                const s = err?.code || err?.status;
                if (s === 404 || s === 410) return false; // already gone, treat as success
                return s === 429 || (s >= 500 && s < 600);
              },
            },
          );
          deleted++;
        } catch (err: any) {
          const s = err?.code || err?.status;
          if (s === 404 || s === 410) {
            deleted++;
            continue;
          }
          console.warn(`disable: failed to delete mirror ${mirror.event_id}`, err?.message);
          failed++;
          allDeleted = false;
        }
      }
      if (allDeleted) {
        await (supabaseAdmin as any).from('event_mappings').delete().eq('id', row.id);
      }
    }

    const { count: remaining } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_account_id', accountId)
      .or(`via_backfill.eq.true,created_at.gte.${cancelFloor}`);

    const done = !remaining || remaining === 0;
    if (done) {
      await (supabaseAdmin as any)
        .from('user_accounts')
        .update({
          backfill_status: 'canceled',
          backfill_progress: 0,
          backfill_total: null,
          backfill_cursor: null,
          backfill_started_at: null,
          backfill_completed_at: null,
        })
        .eq('account_id', accountId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      ok: true,
      status: done ? 'canceled' : 'canceling',
      deleted,
      failed,
      remaining: remaining || 0,
    });
  }

  // ============================================================
  // tick — process one chunk of source events
  // ============================================================
  if (acctRow.backfill_status !== 'running') {
    return NextResponse.json({
      ok: true,
      status: acctRow.backfill_status,
      progress: acctRow.backfill_progress,
      total: acctRow.backfill_total,
    });
  }

  const dests = await getDestAccounts(user.id, accountId);
  if (dests.length === 0) {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({
        backfill_status: 'complete',
        backfill_completed_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true, status: 'complete', progress: 0, total: 0 });
  }

  let auth;
  try {
    auth = await googleAuth.getClientByAccountId(user.id, accountId);
  } catch (err: any) {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'failed', backfill_error: 'auth: ' + (err?.message || String(err)) })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'Auth failed for source calendar' }, { status: 500 });
  }

  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + (acctRow.backfill_horizon_years || 1));
  const now = new Date();

  const currentCursor = (await getSourceAccount(user.id, accountId) as any)?.backfill_cursor || undefined;

  let events: any[] = [];
  let nextPageToken: string | undefined;
  try {
    const result = await googleCalendar.listEventsForBackfill(
      auth,
      'primary',
      now.toISOString(),
      horizon.toISOString(),
      CHUNK_SIZE,
      currentCursor,
    );
    events = result.events || [];
    nextPageToken = result.nextPageToken;
  } catch (err: any) {
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ backfill_status: 'failed', backfill_error: 'list: ' + (err?.message || String(err)) })
      .eq('account_id', accountId)
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'Failed to list events' }, { status: 500 });
  }

  let processed = 0;
  let skippedMirror = 0;
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    if ((ev as any).extendedProperties?.private?.calconnect_is_mirror === 'true') {
      skippedMirror++;
      continue;
    }
    try {
      await syncService.createMirrorEvents(user.id, accountId, 'primary', ev, dests, /* viaBackfill */ true);
      processed++;
    } catch (err) {
      console.warn(`backfill: mirror failed for event ${ev.id}`, err);
    }
  }

  const newProgress = acctRow.backfill_progress + processed;
  const done = !nextPageToken;
  const updates: any = {
    backfill_status: done ? 'complete' : 'running',
    backfill_progress: newProgress,
    backfill_cursor: nextPageToken || null,
    backfill_total: done ? newProgress : null,
  };
  if (done) updates.backfill_completed_at = new Date().toISOString();

  const { data: updated } = await (supabaseAdmin as any)
    .from('user_accounts')
    .update(updates)
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .eq('backfill_status', 'running')
    .select('backfill_status, backfill_progress, backfill_total')
    .maybeSingle();

  if (!updated) {
    const fresh = await getSourceAccount(user.id, accountId) as any;
    return NextResponse.json({
      ok: true,
      status: fresh?.backfill_status,
      progress: fresh?.backfill_progress,
      total: fresh?.backfill_total,
    });
  }

  return NextResponse.json({
    ok: true,
    status: done ? 'complete' : 'running',
    progress: newProgress,
    total: done ? newProgress : null,
    chunkProcessed: processed,
    skippedMirror,
  });
}
