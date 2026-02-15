import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Next.js App Router dynamic API: use getAll/setAll.
        // In Server Components, cookies can be READ but not reliably WRITTEN.
        // Cookie writes must happen in Middleware / Route Handlers / Server Actions.
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // If called from a Server Component render, Next will throw.
            // Middleware/Route Handlers will handle the real cookie updates.
          }
        },
      },
    }
  )
}