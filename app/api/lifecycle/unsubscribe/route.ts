import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribe } from '@/lib/lifecycle/unsubscribe';
import { supabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!verifyUnsubscribe(token)) return new NextResponse('Invalid unsubscribe link', { status: 400 });
  // GET never changes preferences: mail scanners follow links automatically.
  return new NextResponse('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CalConnect email preferences</title></head><body><main><h1>Stop CalConnect setup emails?</h1><p>Your calendar connections will keep working.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" } });
}
export async function POST(req: NextRequest) {
  const id = verifyUnsubscribe(req.nextUrl.searchParams.get('token') || '');
  if (!id) return new NextResponse('Invalid unsubscribe link', { status: 400 });
  const result = await (supabaseAdmin as any).from('activation_profiles').upsert({ user_id: id, unsubscribed_at: new Date().toISOString(), email_opt_in_at: null });
  if (result.error) return new NextResponse('Could not save your preference. Please try again.', { status: 503 });
  return new NextResponse('You are unsubscribed from CalConnect setup and guidance emails. Your calendar connections are unchanged.');
}
