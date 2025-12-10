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

    // Get active sources
    const { data: activeSources, error: sourcesError } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (sourcesError) {
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
    }

    if (!activeSources || activeSources.length === 0) {
      return NextResponse.json({ error: 'No active mirroring to deactivate' }, { status: 400 })
    }

    // Delete sources from Pipedream
    const deletePromises = activeSources.map((source: any) =>
      pipedream.deleteSource(source.source_id, user.id).catch((err: any) => {
        console.error(`Failed to delete source ${source.source_id}:`, err)
        return null // Continue even if one fails
      })
    )

    await Promise.all(deletePromises)

    // Mark sources as inactive in database
    await (supabaseAdmin as any)
      .from('pipedream_sources')
      .update({ is_active: false })
      .eq('user_id', user.id)

    // Clear source account flag
    await (supabaseAdmin as any)
      .from('user_accounts')
      .update({ is_source_account: false })
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deactivating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
