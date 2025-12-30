import { NextResponse } from 'next/server'
import { syncK50 } from '@/lib/k50Sync'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await syncK50()
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('Error in /api/devices/sync:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to sync device' },
      { status: 500 }
    )
  }
}


