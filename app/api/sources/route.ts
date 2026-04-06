import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/sources
 * Returns active watch channels (replaces the old pipedream_sources listing)
 */
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: channels, error } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching sources:', error);
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
    }

    // Map to the same shape the dashboard expects
    const sources = (channels || []).map((ch: any) => ({
      id: ch.id,
      source_id: ch.channel_id,
      source_type: 'watch',
      account_id: ch.account_id,
      expiration: ch.expiration,
    }));

    return NextResponse.json({ sources: sources || [] });
  } catch (error: any) {
    console.error('Error in sources endpoint:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
