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

  // Helper to create a response that preserves auth cookies
  const createResponse = (type: 'next' | 'redirect', url?: string, error?: string) => {
    let res: NextResponse
    if (type === 'redirect' && url) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = url
      if (error) redirectUrl.searchParams.set('error', error)
      res = NextResponse.redirect(redirectUrl)
    } else {
      res = NextResponse.next({ request })
    }
    
    // Copy all cookies from the potentially updated supabaseResponse
    supabaseResponse.cookies.getAll().forEach(c => {
      res.cookies.set(c)
    })
    return res
  }

  // Unauthenticated: redirect to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    return createResponse('redirect', '/login')
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
        return createResponse('redirect', '/login', 'unauthorized')
      }

      // Gate restricted routes to coordinator/admin only
      const restrictedRoutes = ['/settings', '/agreements/new', '/agreements/import']
      const isRestricted = restrictedRoutes.some(route => request.nextUrl.pathname.startsWith(route))

      if (isRestricted && member.role !== 'coordinator' && member.role !== 'admin') {
        return createResponse('redirect', '/dashboard')
      }

      // Pass role and team ID downstream via request headers
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-user-role', member.role)
      requestHeaders.set('x-user-team-id', member.id)

      const finalResponse = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
      
      // Copy cookies to the final header-enhanced response
      supabaseResponse.cookies.getAll().forEach(c => {
        finalResponse.cookies.set(c)
      })
      
      return finalResponse
    } catch (err) {
      console.error('RBAC middleware error:', err)
      // Fail closed: if we can't verify membership, redirect to login
      return createResponse('redirect', '/login', 'auth_callback_failed')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
