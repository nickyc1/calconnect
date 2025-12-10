import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { pipedream } from '@/lib/pipedream'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for existing active sources
    const { data: existingSources } = await supabaseAdmin
      .from('pipedream_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (existingSources && existingSources.length > 0) {
      return NextResponse.json({
        error: 'Mirroring is already active'
      }, { status: 400 })
    }

    // Get source account
    const { data: sourceAccount, error: sourceError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_source_account', true)
      .single()

    if (sourceError || !sourceAccount) {
      return NextResponse.json({
        error: 'No source account selected'
      }, { status: 400 })
    }

    // Get destination accounts
    const { data: destAccounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('is_source_account', false)

    if (!destAccounts || destAccounts.length === 0) {
      return NextResponse.json({
        error: 'No destination accounts. Connect at least 2 accounts.'
      }, { status: 400 })
    }

    // Construct webhook URL
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook?userId=${encodeURIComponent(user.id)}&accountId=${encodeURIComponent(sourceAccount.account_id)}&calendarId=primary`

    // Deploy instant source
    const instantSource = await pipedream.deploySource(
      user.id,
      sourceAccount.account_id,
      'primary',
      webhookUrl
    )

    // Deploy cancelled source
    const cancelledSource = await pipedream.deployCancelledEventSource(
      user.id,
      sourceAccount.account_id,
      'primary',
      webhookUrl,
      300
    )

    // Store sources in database
    const { error: insertError } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .insert([
        {
          user_id: user.id,
          account_id: sourceAccount.account_id,
          source_id: instantSource.data.id,
          calendar_id: 'primary',
          webhook_url: webhookUrl,
          is_active: true,
          source_type: 'instant'
        },
        {
          user_id: user.id,
          account_id: sourceAccount.account_id,
          source_id: cancelledSource.data.id,
          calendar_id: 'primary',
          webhook_url: webhookUrl,
          is_active: true,
          source_type: 'cancelled'
        }
      ])

    if (insertError) {
      // Clean up deployed sources
      try {
        await pipedream.deleteSource(instantSource.data.id, user.id)
        await pipedream.deleteSource(cancelledSource.data.id, user.id)
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
      return NextResponse.json({ error: 'Failed to save source configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error activating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
