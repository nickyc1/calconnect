import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  // 303 See Other forces the browser to follow with GET. The default 307
  // preserves POST, which then hits the /login page route as POST → 405.
  return NextResponse.redirect(
    new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    { status: 303 }
  )
}
