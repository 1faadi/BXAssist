import { NextRequest, NextResponse } from 'next/server'
import { loadAttendancePunches } from '@/lib/k50CsvStore'
import { getEmployeesFromCsv } from '@/lib/k50Sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || undefined
    const employeeUid = searchParams.get('employeeUid')

    const punches = loadAttendancePunches()
    const employees = getEmployeesFromCsv()
    const nameByUid = new Map(employees.map((e) => [e.deviceUid, e.name]))

    let rows = punches

    if (date) {
      rows = rows.filter((r) => r.date === date)
    }

    if (employeeUid) {
      const uid = Number(employeeUid)
      rows = rows.filter((r) => r.deviceUid === uid)
    }

    rows = rows.map((r) => ({
      ...r,
      name: nameByUid.get(r.deviceUid) ?? r.name,
    }))

    rows.sort((a, b) => {
      if (a.date === b.date) {
        if (a.deviceUid === b.deviceUid) {
          return a.punchIso.localeCompare(b.punchIso)
        }
        return a.deviceUid - b.deviceUid
      }
      return a.date.localeCompare(b.date)
    })

    return NextResponse.json({ ok: true, data: rows })
  } catch (err) {
    console.error('Error in /api/attendance/raw:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to load raw punches' },
      { status: 500 }
    )
  }
}


