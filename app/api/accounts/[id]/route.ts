import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { pipedream } from '@/lib/pipedream'

/**
 * DELETE /api/accounts/[id]
 * Remove a connected Google Calendar account
 *
 * Steps:
 * 1. Verify user owns the account
 * 2. Check if account has active sources (mirroring must be disabled first)
 * 3. Delete account from Pipedream
 * 4. Delete account from database (cascades to related records)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = params.id

    // Verify user owns this account
    const { data: account, error: fetchError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to you' },
        { status: 404 }
      )
    }

    // Check if account has active sources (mirroring must be disabled first)
    const { data: activeSources } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('id')
      .eq('account_id', accountId)
      .limit(1)

    if (activeSources && activeSources.length > 0) {
      return NextResponse.json(
        { error: 'Cannot remove account while mirroring is active. Disable mirroring first.' },
        { status: 400 }
      )
    }

    // Check if this is the only account (must have at least 1)
    const { data: allAccounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('id')
      .eq('user_id', user.id)

    if (allAccounts && allAccounts.length <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove your only account. You must have at least one connected account.' },
        { status: 400 }
      )
    }

    console.log(`Removing account ${accountId} for user ${user.id}`)

    // Delete account from Pipedream
    // Note: Pipedream Connect doesn't have a direct "delete account" API
    // Accounts are automatically disconnected when tokens are deleted or expire
    // For now, we just remove from our database
    // TODO: Investigate if Pipedream Connect has account disconnection API

    // Delete from database (foreign key cascades will handle related records)
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting account from database:', deleteError)
      return NextResponse.json(
        { error: 'Failed to remove account' },
        { status: 500 }
      )
    }

    console.log(`Successfully removed account ${accountId}`)

    return NextResponse.json({
      success: true,
      message: 'Account removed successfully'
    })
  } catch (error: any) {
    console.error('Error removing account:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
