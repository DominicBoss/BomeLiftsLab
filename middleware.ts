import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function createSupabaseMiddlewareClient(req: NextRequest) {
  // We must pass a response so Supabase can set cookies on it.
  const res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  return { supabase, res }
}

const PROTECTED_PREFIXES = ['/dashboard', '/history', '/plan', '/workout', '/onboarding']
const AUTH_PREFIX = '/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always build supabase client in middleware to refresh sessions/cookies
  const { supabase, res } = createSupabaseMiddlewareClient(req)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoggedIn = !!user
  const isAuthRoute = pathname === AUTH_PREFIX || pathname.startsWith(`${AUTH_PREFIX}/`)
  const isProtectedRoute = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // 1) Root redirect
  if (pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = isLoggedIn ? '/dashboard' : '/auth/login'
    return NextResponse.redirect(url)
  }

  // 2) If logged in, keep them out of /auth/*
  if (isLoggedIn && isAuthRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // 3) If not logged in, block protected routes
  if (!isLoggedIn && isProtectedRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname) // optional: redirect back after login
    return NextResponse.redirect(url)
  }

  // Important: return res (not NextResponse.next()) so cookie updates persist
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}