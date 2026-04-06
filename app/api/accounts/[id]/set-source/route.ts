import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
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
    const { data: account, error: accountError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Check if user already has active sources (mirroring is active)
    const { data: activeSources } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (activeSources && activeSources.length > 0) {
      return NextResponse.json({
        error: 'Cannot change source while mirroring is active. Deactivate first.'
      }, { status: 400 })
    }

    // Clear any existing source flags for this user
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ is_source_account: false })
      .eq('user_id', user.id)

    // Set this account as source
    const { error: updateError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ is_source_account: true })
      .eq('account_id', accountId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error setting source:', updateError)
      return NextResponse.json({ error: 'Failed to set source account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error setting source account:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
