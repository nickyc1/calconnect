import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/debug-log?tag=eric-recurring&limit=50
 *
 * Reads back rows captured by targeted debug code in the webhook path.
 * CRON_SECRET-gated. No PII surface beyond what a debugging code path
 * wrote (Google event IDs, mapping row IDs, etc).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tag = req.nextUrl.searchParams.get('tag');
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 50));

  let q = (supabaseAdmin as any)
    .from('webhook_debug_log')
    .select('id, user_id, account_id, tag, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tag) q = q.eq('tag', tag);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: data?.length || 0, rows: data || [] });
}
