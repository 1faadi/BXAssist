import { NextRequest, NextResponse } from 'next/server'
import { getAttendanceFromCsv, getEmployeesFromCsv } from '@/lib/k50Sync'

export const dynamic = 'force-dynamic'

/**
 * Attendance listing endpoint backed by CSV.
 *
 * Supported query params (all optional):
 * - date=YYYY-MM-DD
 * - start_date=YYYY-MM-DD
 * - end_date=YYYY-MM-DD
 * - employeeUid=<number>
 * - search=<employee name substring>
 * - page=<number> (default 1)
 * - per_page=<number> (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const date = searchParams.get('date') || undefined
    const startDate = searchParams.get('start_date') || undefined
    const endDate = searchParams.get('end_date') || undefined
    const employeeUid = searchParams.get('employeeUid')
    const search = searchParams.get('search')?.toLowerCase() || ''

    const page = Math.max(1, Number(searchParams.get('page') || '1'))
    const perPage = Math.min(
      500,
      Math.max(1, Number(searchParams.get('per_page') || '50'))
    )

    const employees = getEmployeesFromCsv()
    const nameByUid = new Map(employees.map((e) => [e.deviceUid, e.name]))

    let rows = getAttendanceFromCsv()

    // Filter by date or date range
    if (date) {
      rows = rows.filter((r) => r.date === date)
    } else if (startDate && endDate) {
      rows = rows.filter((r) => r.date >= startDate && r.date <= endDate)
    }

    // Filter by employee
    if (employeeUid) {
      const uid = Number(employeeUid)
      rows = rows.filter((r) => r.deviceUid === uid)
    }

    // Attach latest name from employees.csv
    rows = rows.map((r) => ({
      ...r,
      name: nameByUid.get(r.deviceUid) ?? r.name,
    }))

    // Filter by name search
    if (search) {
      rows = rows.filter((r) =>
        (r.name || '').toLowerCase().includes(search)
      )
    }

    // Sort newest first (by date then by device UID)
    rows.sort((a, b) => {
      if (a.date === b.date) return b.deviceUid - a.deviceUid
      return b.date.localeCompare(a.date)
    })

    const total = rows.length
    const start = (page - 1) * perPage
    const end = start + perPage
    const paged = rows.slice(start, end)

    return NextResponse.json({
      ok: true,
      data: paged,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      },
    })
  } catch (err) {
    console.error('Error in /api/attendance:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to load attendance' },
      { status: 500 }
    )
  }
}



