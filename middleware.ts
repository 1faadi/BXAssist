import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'dashboard_auth'
const DEFAULT_PASSWORD = 'bxtrack2026'
const LOGIN_PATH = '/dashboard/login'

async function getAuthToken(): Promise<string> {
  const password = process.env.DASHBOARD_PASSWORD ?? DEFAULT_PASSWORD
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getCookie(request: NextRequest): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path === LOGIN_PATH) {
    const token = await getAuthToken()
    const cookie = getCookie(request)
    if (cookie === token) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  if (path.startsWith('/dashboard')) {
    const token = await getAuthToken()
    const cookie = getCookie(request)
    if (cookie !== token) {
      const login = new URL(LOGIN_PATH, request.url)
      login.searchParams.set('next', path)
      return NextResponse.redirect(login)
    }
  }

  if (path.startsWith('/api/sheets/records')) {
    const token = await getAuthToken()
    const cookie = getCookie(request)
    if (cookie !== token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (path.startsWith('/api/attendance') && !path.includes('/checkin') && !path.includes('/checkout')) {
    const token = await getAuthToken()
    const cookie = getCookie(request)
    if (cookie !== token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/sheets/records/:path*', '/api/attendance/:path*'],
}
