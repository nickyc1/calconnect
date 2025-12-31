import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { pipedream } from '@/lib/pipedream'

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
    const body = await request.json()
    const { isSource } = body // true or false

    if (typeof isSource !== 'boolean') {
      return NextResponse.json({
        error: 'isSource must be a boolean'
      }, { status: 400 })
    }

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

    // Check if mirroring is currently active
    const { data: activeSources } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('id, account_id')
      .eq('user_id', user.id)
      .limit(1)

    const mirroringActive = activeSources && activeSources.length > 0

    // Update the account's source status
    const { error: updateError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ is_source_account: isSource })
      .eq('account_id', accountId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error toggling source:', updateError)
      return NextResponse.json({
        error: 'Failed to toggle source status'
      }, { status: 500 })
    }

    // If mirroring is active, dynamically deploy or remove sources
    if (mirroringActive) {
      if (isSource) {
        // User is enabling this account as a source while mirroring is active
        // Deploy sources for this account
        try {
          const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook?userId=${encodeURIComponent(user.id)}&accountId=${encodeURIComponent(accountId)}&calendarId=primary`

          // Deploy instant source
          const instantSource = await pipedream.deploySource(
            user.id,
            accountId,
            'primary',
            webhookUrl
          )

          // Deploy cancelled source (polling interval from env var)
          const cancelledSource = await pipedream.deployCancelledEventSource(
            user.id,
            accountId,
            'primary',
            webhookUrl
          )

          // Store sources in database
          await (supabaseAdmin as any)
            .from('pipedream_sources')
            .insert([
              {
                user_id: user.id,
                account_id: accountId,
                source_id: instantSource.data.id,
                calendar_id: 'primary',
                webhook_url: webhookUrl,
                source_type: 'instant'
              },
              {
                user_id: user.id,
                account_id: accountId,
                source_id: cancelledSource.data.id,
                calendar_id: 'primary',
                webhook_url: webhookUrl,
                source_type: 'cancelled'
              }
            ])

          console.log(`Deployed sources for newly enabled source account: ${accountId}`)
        } catch (deployError) {
          console.error('Error deploying sources for new source account:', deployError)
          // Revert the is_source_account change
          await (supabaseAdmin as any)
            .from('user_accounts')
            .update({ is_source_account: false })
            .eq('account_id', accountId)

          return NextResponse.json({
            error: 'Failed to deploy sources for this account'
          }, { status: 500 })
        }
      } else {
        // User is disabling this account as a source while mirroring is active
        // Remove sources for this account
        try {
          // Get sources for this account
          const { data: sourcesToRemove } = await (supabaseAdmin as any)
            .from('pipedream_sources')
            .select('*')
            .eq('user_id', user.id)
            .eq('account_id', accountId)

          if (sourcesToRemove && sourcesToRemove.length > 0) {
            // Delete sources from Pipedream
            const deletePromises = sourcesToRemove.map((source: any) =>
              pipedream.deleteSource(source.source_id, user.id).catch(err => {
                console.error(`Failed to delete source ${source.source_id}:`, err)
                return null
              })
            )

            await Promise.all(deletePromises)

            // Delete from database
            await (supabaseAdmin as any)
              .from('pipedream_sources')
              .delete()
              .eq('user_id', user.id)
              .eq('account_id', accountId)

            console.log(`Removed sources for disabled source account: ${accountId}`)
          }
        } catch (removeError) {
          console.error('Error removing sources:', removeError)
          // Don't revert - user wanted to disable, we tried to clean up
          // Worst case: sources remain in Pipedream but account marked as non-source
        }
      }
    }

    return NextResponse.json({ success: true, isSource })
  } catch (error: any) {
    console.error('Error toggling source account:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
