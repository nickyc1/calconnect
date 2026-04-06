import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * DELETE /api/accounts/[id]
 * Remove a connected Google Calendar account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = params.id;

    // Verify user owns this account
    const { data: account, error: fetchError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to you' },
        { status: 404 }
      );
    }

    // Check if account has active watch channels (mirroring must be disabled first)
    const { data: activeChannels } = await (supabaseAdmin as any)
      .from('watch_channels')
      .select('id')
      .eq('account_id', accountId)
      .limit(1);

    if (activeChannels && activeChannels.length > 0) {
      return NextResponse.json(
        { error: 'Cannot remove account while mirroring is active. Disable mirroring first.' },
        { status: 400 }
      );
    }

    // Delete from database
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting account:', deleteError);
      return NextResponse.json({ error: 'Failed to remove account' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Account removed successfully' });
  } catch (error: any) {
    console.error('Error removing account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
