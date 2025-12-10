import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Get authenticated user
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's accounts
    const { data: accounts, error } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: any) {
    console.error('Error in accounts endpoint:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
