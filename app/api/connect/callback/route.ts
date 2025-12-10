import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Webhook endpoint for Pipedream Connect account connection events
 * Receives POST requests when users successfully connect their accounts
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log('Connect webhook received:', JSON.stringify(payload, null, 2));

    // Handle CONNECTION_SUCCESS event
    if (payload.event === 'CONNECTION_SUCCESS') {
      const { connect_token, account } = payload;

      if (!connect_token || !account) {
        console.error('Missing connect_token or account in webhook payload');
        return NextResponse.json(
          { error: 'Invalid webhook payload' },
          { status: 400 }
        );
      }

      // Look up userId using the connect_token
      const { data: tokenData, error: tokenError } = await (supabaseAdmin as any)
        .from('connect_tokens')
        .select('user_id')
        .eq('connect_token', connect_token)
        .single();

      if (tokenError || !tokenData) {
        console.error('Connect token not found:', connect_token);
        return NextResponse.json(
          { error: 'Connect token not found or expired' },
          { status: 404 }
        );
      }

      const userId = tokenData.user_id;

      console.log('Token lookup successful:', {
        connect_token: connect_token,
        user_id: userId,
        account_id: account.id
      });

      // Store account in database
      const { data: accountData, error: accountError } = await (supabaseAdmin as any)
        .from('user_accounts')
        .insert({
          user_id: userId,
          account_id: account.id,
          app_name: account.app.name_slug,
          account_display_name: account.name || account.app.name,
          is_active: true
        })
        .select()
        .single();

      if (accountError) {
        console.error('Error storing account:', accountError);
        return NextResponse.json(
          { error: 'Failed to store account' },
          { status: 500 }
        );
      }

      // Delete the used connect token (single-use only)
      await supabaseAdmin
        .from('connect_tokens')
        .delete()
        .eq('connect_token', connect_token);

      console.log('Connect token deleted after use:', connect_token);
      console.log('Account connected successfully:', accountData);

      return NextResponse.json({
        success: true,
        account: accountData
      });
    }

    // Handle CONNECTION_ERROR event
    if (payload.event === 'CONNECTION_ERROR') {
      const { connect_token, error: errorMessage } = payload;
      console.error('Connection error:', errorMessage);

      // Clean up the token
      if (connect_token) {
        await supabaseAdmin
          .from('connect_tokens')
          .delete()
          .eq('connect_token', connect_token);
      }

      return NextResponse.json({
        success: false,
        error: errorMessage
      });
    }

    // Unknown event type
    console.warn('Unknown webhook event:', payload.event);
    return NextResponse.json({
      received: true,
      message: 'Unknown event type'
    });

  } catch (error: any) {
    console.error('Error processing connect callback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process callback' },
      { status: 500 }
    );
  }
}
