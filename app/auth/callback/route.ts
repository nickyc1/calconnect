import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Upsert user in public.users table (create if doesn't exist)
        // Note: user.id is UUID from Supabase auth, used directly for Pipedream Connect
        const { error: upsertError } = await (supabaseAdmin as any)
          .from('users')
          .upsert({
            id: user.id, // UUID from Supabase auth (used for Pipedream externalUserId)
            email: user.email,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id' // Use id as the conflict resolution column
          })

        if (upsertError) {
          console.error('Error upserting user:', upsertError)
        } else {
          console.log('User upserted:', { id: user.id, email: user.email })
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
