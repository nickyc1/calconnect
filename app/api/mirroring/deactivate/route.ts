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

    // Get all active sources for this user
    const { data: activeSources, error: sourcesError } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .select('*')
      .eq('user_id', user.id)

    if (sourcesError) {
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
    }

    if (!activeSources || activeSources.length === 0) {
      return NextResponse.json({ error: 'No active mirroring to deactivate' }, { status: 400 })
    }

    console.log(`Deactivating ${activeSources.length} source(s) for user ${user.id}`)

    // Delete sources from Pipedream
    const deletePromises = activeSources.map((source: any) =>
      pipedream.deleteSource(source.source_id, user.id).catch(err => {
        console.error(`Failed to delete source ${source.source_id}:`, err)
        return null // Continue even if one fails
      })
    )

    await Promise.all(deletePromises)

    // Delete source rows from database (Bug #7 fix: delete instead of marking inactive)
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('pipedream_sources')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting sources from database:', deleteError)
      // Don't return error - sources already deleted from Pipedream
    }

    console.log(`Successfully deactivated mirroring, deleted ${activeSources.length} source(s)`)

    return NextResponse.json({
      success: true,
      sourcesDeleted: activeSources.length
    })
  } catch (error: any) {
    console.error('Error deactivating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
