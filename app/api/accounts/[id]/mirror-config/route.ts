import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/accounts/[id]/mirror-config
 *
 * Update how mirrored blocks appear on OTHER calendars when this account
 * is used as a source. Two fields:
 *   - mirrorColorId: Google Calendar event color '1'..'11'
 *   - mirrorLabel:   Short text ("Busy" default, up to 60 chars)
 *
 * Server verifies:
 *   - User owns the account (auth + row match)
 *   - colorId is one of Google's valid values
 *   - Label is 1-60 chars, non-empty after trim
 *
 * Changes apply to NEW mirrored blocks going forward. Existing mirrors keep
 * their old color/label — a "re-apply to existing" background job is a
 * follow-up. Nothing on the source calendar itself is touched.
 */

const VALID_COLOR_IDS = new Set(['1','2','3','4','5','6','7','8','9','10','11']);
const MAX_LABEL_LENGTH = 60;
const VALID_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

/** Pro-only features accept null (turn off) or a validated object. */
function validateMirrorWindow(raw: any): { ok: true; value: any } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'object') return { ok: false, error: 'mirrorWindow must be null or an object.' };
  const days = raw.days;
  if (!Array.isArray(days) || days.length === 0 || !days.every((d: any) => Number.isInteger(d) && VALID_DAYS.has(d))) {
    return { ok: false, error: 'mirrorWindow.days must be a non-empty array of integers 0-6.' };
  }
  const startMin = Number.isInteger(raw.start_min) ? raw.start_min : 0;
  const endMin = Number.isInteger(raw.end_min) ? raw.end_min : 1440;
  if (startMin < 0 || startMin > 1440 || endMin < 0 || endMin > 1440 || endMin <= startMin) {
    return { ok: false, error: 'mirrorWindow start/end must be 0-1440 with end > start.' };
  }
  const tz = typeof raw.tz === 'string' && raw.tz.length < 64 ? raw.tz : undefined;
  return {
    ok: true,
    value: { days: [...new Set(days)].sort(), start_min: startMin, end_min: endMin, ...(tz ? { tz } : {}) },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = params.id;
    const body = await request.json().catch(() => ({}));
    const rawColor = body?.mirrorColorId;
    const rawLabel = body?.mirrorLabel;
    const rawWindow = body?.mirrorWindow;

    const patch: Record<string, any> = {};

    if (rawColor !== undefined) {
      if (typeof rawColor !== 'string' || !VALID_COLOR_IDS.has(rawColor)) {
        return NextResponse.json(
          { error: 'mirrorColorId must be a Google Calendar color id (1-11).' },
          { status: 400 }
        );
      }
      patch.mirror_color_id = rawColor;
    }

    if (rawLabel !== undefined) {
      if (typeof rawLabel !== 'string') {
        return NextResponse.json({ error: 'mirrorLabel must be a string.' }, { status: 400 });
      }
      const trimmed = rawLabel.trim();
      if (trimmed.length < 1 || trimmed.length > MAX_LABEL_LENGTH) {
        return NextResponse.json(
          { error: `mirrorLabel must be 1-${MAX_LABEL_LENGTH} characters.` },
          { status: 400 }
        );
      }
      patch.mirror_label = trimmed;
    }

    if (rawWindow !== undefined) {
      // Pro-gate: only Pro subscribers can set a mirror window.
      // Clearing the window (setting to null) is allowed for any plan so
      // downgrades don't leave orphan windows filtering their events.
      if (rawWindow !== null) {
        const { data: billing } = await (supabaseAdmin as any)
          .from('user_billing')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle();
        const plan = (billing as any)?.plan;
        if (plan !== 'pro') {
          return NextResponse.json(
            { error: 'Mirror windows are a Pro feature. Upgrade to enable time/day filters.' },
            { status: 402 },
          );
        }
      }
      const check = validateMirrorWindow(rawWindow);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      patch.mirror_window = check.value;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 });
    }

    // Ownership check is enforced by matching BOTH account_id and user_id;
    // an attacker who guesses another user's account_id still can't update it.
    const { data, error } = await (supabaseAdmin as any)
      .from('user_accounts')
      .update(patch)
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .select('account_id, mirror_color_id, mirror_label, mirror_window')
      .maybeSingle();

    if (error) {
      console.error('mirror-config update error:', error);
      return NextResponse.json({ error: 'Update failed.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    return NextResponse.json({
      accountId: data.account_id,
      mirrorColorId: data.mirror_color_id,
      mirrorLabel: data.mirror_label,
      mirrorWindow: data.mirror_window,
    });
  } catch (err: any) {
    console.error('mirror-config error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
