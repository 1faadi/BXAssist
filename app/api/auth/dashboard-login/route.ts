import { NextRequest, NextResponse } from 'next/server'
import { getDashboardAuthCookie } from '@/lib/dashboardAuth'

const DEFAULT_PASSWORD = 'bxtrack2026'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const password = typeof body.password === 'string' ? body.password.trim() : ''

    const expected = process.env.DASHBOARD_PASSWORD ?? DEFAULT_PASSWORD
    if (password !== expected) {
      return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 })
    }

    const cookie = getDashboardAuthCookie()
    const res = NextResponse.json({ ok: true })
    res.headers.set('Set-Cookie', cookie)
    return res
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }
}
