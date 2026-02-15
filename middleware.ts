import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabase, response } = await updateSession(request)

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  const isAuthRoute = pathname.startsWith('/auth')
  const isPublic =
    pathname === '/' ||
    isAuthRoute ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  // Nicht eingeloggt -> alles außer public/auth auf /auth/login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Eingeloggt -> Auth-Seiten blocken (optional, aber sinnvoll)
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Eingeloggt -> Onboarding-Check (nur wenn nicht schon auf onboarding)
  if (user && pathname !== '/onboarding') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('squat_1rm, bench_1rm, deadlift_1rm')
      .eq('id', user.id)
      .single()

    const onboardingDone =
      !!profile?.squat_1rm && !!profile?.bench_1rm && !!profile?.deadlift_1rm

    if (!onboardingDone && pathname !== '/onboarding') {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
      Middleware läuft auf allem außer statischen assets.
      Wir lassen /_next/static, /_next/image, favicon etc. aus.
    */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}