import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { activationContext } from '@/lib/lifecycle/context';
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000)
    return NextResponse.json({ error: 'Enter a message under 2,000 characters.' }, { status: 400 });
  try {
    const { state } = await activationContext(user.id);
    const result = await (supabaseAdmin as any).from('activation_support_requests').insert({ user_id: user.id, message: body.message.trim(), snapshot: state });
    if (result.error && result.error.code !== '23505') throw result.error;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not save your request. Email n.christensen4@gmail.com for help.' }, { status: 503 }); }
}
