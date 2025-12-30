import { NextResponse } from 'next/server'
import { getEmployeesFromCsv } from '@/lib/k50Sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const employees = getEmployeesFromCsv()
    return NextResponse.json({ ok: true, data: employees })
  } catch (err) {
    console.error('Error in /api/users:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to load users' },
      { status: 500 }
    )
  }
}


