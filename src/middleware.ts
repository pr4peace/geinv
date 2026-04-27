import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated: redirect to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated: check team membership + apply role gates
  if (user) {
    try {
      // Create admin client inline to avoid Edge runtime issues with lib imports
      const adminClient = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { data: member } = await adminClient
        .from('team_members')
        .select('id, role')
        .eq('email', user.email!)
        .eq('is_active', true)
        .single()

      if (!member) {
        // Not an active team member: sign out and redirect with error
        // Clearing session is crucial to prevent redirect loops
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'unauthorized')
        return NextResponse.redirect(url)
      }

      // Gate /settings to coordinator/admin only
      if (
        request.nextUrl.pathname.startsWith('/settings') &&
        member.role !== 'coordinator' &&
        member.role !== 'admin'
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      // Pass role and team ID downstream via request headers
      // We must set them on a new headers object and pass it to NextResponse.next
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-user-role', member.role)
      requestHeaders.set('x-user-team-id', member.id)

      supabaseResponse = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    } catch (err) {
      console.error('RBAC middleware error:', err)
      // Fail closed: if we can't verify membership, redirect to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'auth_callback_failed')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
