import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sources, error } = await supabaseAdmin
      .from('pipedream_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching sources:', error)
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
    }

    return NextResponse.json({ sources: sources || [] })
  } catch (error: any) {
    console.error('Error in sources endpoint:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
