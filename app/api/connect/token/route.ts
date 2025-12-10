import { NextRequest, NextResponse } from 'next/server';
import { pipedream } from '@/lib/pipedream';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Allow both authenticated user and explicit userId (for backwards compat)
    let userId: string

    if (user) {
      userId = user.id
    } else {
      const body = await request.json()
      userId = body.userId
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check account limit (max 3)
    const { count } = await supabaseAdmin
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true)

    if (count && count >= 3) {
      return NextResponse.json({
        error: 'Maximum of 3 accounts allowed'
      }, { status: 400 })
    }

    // Construct webhook URL for account connection notifications
    const webhookUri = `${process.env.WEBHOOK_BASE_URL}/api/connect/callback`;

    // Generate connect token for this user with webhook
    const result = await pipedream.generateConnectToken(userId, webhookUri);

    // Store token->userId mapping so we can identify the user when webhook arrives
    // The webhook payload includes connect_token but not external_user_id
    await (supabaseAdmin as any).from('connect_tokens').insert({
      connect_token: result.token,
      user_id: userId,
      expires_at: result.expiresAt
    });

    console.log('Connect token created and stored:', {
      connect_token: result.token,
      user_id: userId,
      expires_at: result.expiresAt
    });

    return NextResponse.json({
      token: result.token,
      expiresAt: result.expiresAt,
      // Use the Connect Link URL from SDK response
      connectLinkUrl: result.connectLinkUrl
    });
  } catch (error: any) {
    console.error('Error generating connect token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate connect token' },
      { status: 500 }
    );
  }
}
