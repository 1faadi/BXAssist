import { createHash } from 'crypto'

const COOKIE_NAME = 'dashboard_auth'
const DEFAULT_PASSWORD = 'bxtrack2026'

function getPassword(): string {
  return process.env.DASHBOARD_PASSWORD ?? DEFAULT_PASSWORD
}

export function getDashboardAuthToken(): string {
  return createHash('sha256').update(getPassword()).digest('hex')
}

export function verifyDashboardAuth(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  const token = getDashboardAuthToken()
  const pairs = cookieHeader.split(';').map((s) => s.trim().split('='))
  for (const [name, value] of pairs) {
    if (name === COOKIE_NAME && value === token) return true
  }
  return false
}

export function getDashboardAuthCookie(): string {
  const token = getDashboardAuthToken()
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
}

export function getDashboardLoginPath(): string {
  return '/dashboard/login'
}
