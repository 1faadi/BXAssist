/**
 * HR Records API - Read and update Google Sheets (Leave, Overtime, Short Leave)
 * GET ?sheet=LeaveRequests|OvertimeRequests|ShortLeaveRequests&month=YYYY-MM
 * PATCH body: { sheet, rowIndex, values }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getValues, updateRow } from '@/lib/googleSheets'

const SHEET_ALLOWLIST = ['LeaveRequests', 'OvertimeRequests', 'ShortLeaveRequests'] as const
const SHEET_RANGES: Record<string, string> = {
  LeaveRequests: 'LeaveRequests!A2:K1000',
  OvertimeRequests: 'OvertimeRequests!A2:M10000',
  ShortLeaveRequests: 'ShortLeaveRequests!A2:M10000',
}
const SHEET_COL_COUNTS: Record<string, number> = {
  LeaveRequests: 11,
  OvertimeRequests: 13,
  ShortLeaveRequests: 13,
}

/** Which column index to use for month filtering (0-based). */
const DATE_COL_INDEX: Record<string, number> = {
  LeaveRequests: 3, // FromDate (D)
  OvertimeRequests: 0, // Timestamp (A)
  ShortLeaveRequests: 3, // FromDate (D)
}

function rowInMonth(row: string[], sheet: string, month: string): boolean {
  const idx = DATE_COL_INDEX[sheet] ?? 0
  const val = row[idx] ?? ''
  if (!val) return false
  // FromDate is YYYY-MM-DD; Timestamp is ISO
  const yyyyMm = val.slice(0, 7)
  return yyyyMm === month
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sheet = searchParams.get('sheet')
    const month = searchParams.get('month') || ''

    if (!sheet || !SHEET_ALLOWLIST.includes(sheet as any)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing sheet. Use LeaveRequests, OvertimeRequests, or ShortLeaveRequests.' },
        { status: 400 }
      )
    }

    const range = SHEET_RANGES[sheet]
    const raw = await getValues(range)
    let data = raw

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      data = raw.filter((row) => rowInMonth(row, sheet, month))
    }

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('GET /api/sheets/records error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch records' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { sheet, rowIndex, values } = body as { sheet?: string; rowIndex?: number; values?: string[] }

    if (!sheet || !SHEET_ALLOWLIST.includes(sheet as any)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing sheet.' },
        { status: 400 }
      )
    }

    const colCount = SHEET_COL_COUNTS[sheet]
    if (!Array.isArray(values) || values.length !== colCount) {
      return NextResponse.json(
        { ok: false, error: `values must be an array of length ${colCount}.` },
        { status: 400 }
      )
    }

    const row = Math.floor(Number(rowIndex))
    if (row < 2) {
      return NextResponse.json(
        { ok: false, error: 'rowIndex must be >= 2 (row 1 is header).' },
        { status: 400 }
      )
    }

    const stringValues = values.map((v: unknown) => (v == null ? '' : String(v)))
    await updateRow(sheet, row, stringValues)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/sheets/records error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update row' },
      { status: 500 }
    )
  }
}
