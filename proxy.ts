import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const protectedPaths = ['/client', '/dashboard']
  const adminOnlyPaths = ['/admin']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))
  const isAdminPage = adminOnlyPaths.some(p => pathname.startsWith(p))
  const isLoginPage = pathname === '/login'

  if (!isProtected && !isAdminPage && !isLoginPage) return NextResponse.next()
  if (isAdminPage) return NextResponse.next()

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (isProtected && !session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (isLoginPage && session) {
    const url = request.nextUrl.clone()
    url.pathname = '/client'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/client/:path*', '/admin/:path*', '/dashboard/:path*', '/login'],
}
