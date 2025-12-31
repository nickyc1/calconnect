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
    const { data: existingSources } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (existingSources && existingSources.length > 0) {
      return NextResponse.json({
        error: 'Mirroring is already active'
      }, { status: 400 })
    }

    // Get ALL source accounts (can be multiple)
    const { data: sourceAccounts, error: sourceError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_source_account', true)

    if (sourceError || !sourceAccounts || sourceAccounts.length === 0) {
      return NextResponse.json({
        error: 'No source accounts selected. Select at least one source account.'
      }, { status: 400 })
    }

    // Get ALL accounts to validate we have at least 2 total accounts
    // Note: All sources can also be destinations for other sources
    // (events from source A mirror to source B and vice versa)
    const { data: allAccounts } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!allAccounts || allAccounts.length < 2) {
      return NextResponse.json({
        error: 'Need at least 2 accounts to enable mirroring'
      }, { status: 400 })
    }

    // Deploy sources for EACH source account
    const deployedSources: any[] = []
    const sourceRecords: any[] = []

    for (const sourceAccount of sourceAccounts) {
      try {
        const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook?userId=${encodeURIComponent(user.id)}&accountId=${encodeURIComponent(sourceAccount.account_id)}&calendarId=primary`

        // Deploy instant source
        const instantSource = await pipedream.deploySource(
          user.id,
          sourceAccount.account_id,
          'primary',
          webhookUrl
        )

        // Deploy cancelled source (polling interval from env var)
        const cancelledSource = await pipedream.deployCancelledEventSource(
          user.id,
          sourceAccount.account_id,
          'primary',
          webhookUrl
        )

        deployedSources.push({ instantSource, cancelledSource, accountId: sourceAccount.account_id })

        // Prepare database records
        sourceRecords.push(
          {
            user_id: user.id,
            account_id: sourceAccount.account_id,
            source_id: instantSource.data.id,
            calendar_id: 'primary',
            webhook_url: webhookUrl,
            source_type: 'instant'
          },
          {
            user_id: user.id,
            account_id: sourceAccount.account_id,
            source_id: cancelledSource.data.id,
            calendar_id: 'primary',
            webhook_url: webhookUrl,
            source_type: 'cancelled'
          }
        )

        console.log(`Deployed sources for account: ${sourceAccount.account_display_name || sourceAccount.account_id}`)
      } catch (deployError) {
        console.error(`Error deploying sources for account ${sourceAccount.account_id}:`, deployError)

        // Clean up any sources deployed so far
        for (const deployed of deployedSources) {
          try {
            await pipedream.deleteSource(deployed.instantSource.data.id, user.id)
            await pipedream.deleteSource(deployed.cancelledSource.data.id, user.id)
          } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError)
          }
        }

        return NextResponse.json({
          error: `Failed to deploy sources for account ${sourceAccount.account_display_name}`
        }, { status: 500 })
      }
    }

    // Store ALL sources in database
    const { error: insertError } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .insert(sourceRecords)

    if (insertError) {
      console.error('Error storing sources:', insertError)

      // Clean up deployed sources
      for (const deployed of deployedSources) {
        try {
          await pipedream.deleteSource(deployed.instantSource.data.id, user.id)
          await pipedream.deleteSource(deployed.cancelledSource.data.id, user.id)
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError)
        }
      }

      return NextResponse.json({ error: 'Failed to save source configuration' }, { status: 500 })
    }

    console.log(`Successfully activated mirroring with ${sourceAccounts.length} source account(s), ${deployedSources.length * 2} total sources deployed`)

    return NextResponse.json({
      success: true,
      sourceAccountsCount: sourceAccounts.length,
      sourcesDeployed: deployedSources.length * 2
    })
  } catch (error: any) {
    console.error('Error activating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
