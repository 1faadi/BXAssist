/**
 * Admin API: Reminder Settings
 * 
 * GET: Returns current reminder time from Settings tab
 * POST: Updates reminder time in Settings tab
 * 
 * Secured by ADMIN_KEY query parameter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/googleSheets'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

function verifyAdminKey(req: NextRequest): boolean {
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const adminKey = process.env.ADMIN_KEY
  return !!adminKey && key === adminKey
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminKey(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reminderTime = (await getSetting('attendanceReminderTime')) || '09:10'

    return NextResponse.json({
      success: true,
      reminderTime,
    })
  } catch (err) {
    console.error('Error in GET /api/admin/reminder-settings:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminKey(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { reminderTime } = body

    if (!reminderTime || typeof reminderTime !== 'string') {
      return NextResponse.json(
        { error: 'reminderTime is required (format: HH:mm)' },
        { status: 400 }
      )
    }

    // Validate format (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(reminderTime)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm (24-hour format)' },
        { status: 400 }
      )
    }

    await setSetting('attendanceReminderTime', reminderTime)

    return NextResponse.json({
      success: true,
      reminderTime,
    })
  } catch (err) {
    console.error('Error in POST /api/admin/reminder-settings:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

