import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data', 'k50')
const EMPLOYEES_CSV = path.join(DATA_DIR, 'employees.csv')
const ATTENDANCE_CSV = path.join(DATA_DIR, 'attendance_daily.csv')
const PUNCHES_CSV = path.join(DATA_DIR, 'attendance_punches.csv')
const META_JSON = path.join(DATA_DIR, 'meta.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

type EmployeeRow = {
  deviceUid: number
  name: string
}

export type AttendanceDailyRow = {
  date: string // YYYY-MM-DD (device timezone)
  deviceUid: number
  name: string
  checkInIso: string // ISO in UTC
  checkOutIso: string // ISO in UTC (empty if missing checkout)
}

export type AttendancePunchRow = {
  date: string // YYYY-MM-DD (device timezone)
  deviceUid: number
  name: string
  punchIso: string // ISO in UTC
  sourceIp: string
}

// Very small, controlled CSV helper (no embedded commas/newlines support).
function parseCsv(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(','))
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.join(',')).join('\n') + '\n'
}

export function loadEmployees(): EmployeeRow[] {
  ensureDataDir()
  if (!fs.existsSync(EMPLOYEES_CSV)) return []
  const raw = fs.readFileSync(EMPLOYEES_CSV, 'utf8')
  const rows = parseCsv(raw)
  if (!rows.length) return []
  const [, ...data] = rows // skip header
  return data.map((r) => ({
    deviceUid: Number(r[0]),
    name: r[1] || '',
  }))
}

export function saveEmployees(rows: EmployeeRow[]) {
  ensureDataDir()
  const csvRows: string[][] = [['deviceUid', 'name']]
  for (const r of rows) {
    csvRows.push([String(r.deviceUid), r.name ?? ''])
  }
  fs.writeFileSync(EMPLOYEES_CSV, toCsv(csvRows), 'utf8')
}

export function loadAttendanceDaily(): AttendanceDailyRow[] {
  ensureDataDir()
  if (!fs.existsSync(ATTENDANCE_CSV)) return []
  const raw = fs.readFileSync(ATTENDANCE_CSV, 'utf8')
  const rows = parseCsv(raw)
  if (!rows.length) return []
  const [, ...data] = rows
  return data.map((r) => ({
    date: r[0],
    deviceUid: Number(r[1]),
    name: r[2] || '',
    checkInIso: r[3],
    checkOutIso: r[4],
  }))
}

export function saveAttendanceDaily(rows: AttendanceDailyRow[]) {
  ensureDataDir()
  const csvRows: string[][] = [['date', 'deviceUid', 'name', 'checkInIso', 'checkOutIso']]
  for (const r of rows) {
    csvRows.push([
      r.date,
      String(r.deviceUid),
      r.name ?? '',
      r.checkInIso,
      r.checkOutIso,
    ])
  }
  fs.writeFileSync(ATTENDANCE_CSV, toCsv(csvRows), 'utf8')
}

export function loadAttendancePunches(): AttendancePunchRow[] {
  ensureDataDir()
  if (!fs.existsSync(PUNCHES_CSV)) return []
  const raw = fs.readFileSync(PUNCHES_CSV, 'utf8')
  const rows = parseCsv(raw)
  if (!rows.length) return []
  const [, ...data] = rows
  return data.map((r) => ({
    date: r[0],
    deviceUid: Number(r[1]),
    name: r[2] || '',
    punchIso: r[3],
    sourceIp: r[4] || '',
  }))
}

export function saveAttendancePunches(rows: AttendancePunchRow[]) {
  ensureDataDir()
  const csvRows: string[][] = [['date', 'deviceUid', 'name', 'punchIso', 'sourceIp']]
  for (const r of rows) {
    csvRows.push([
      r.date,
      String(r.deviceUid),
      r.name ?? '',
      r.punchIso,
      r.sourceIp,
    ])
  }
  fs.writeFileSync(PUNCHES_CSV, toCsv(csvRows), 'utf8')
}

type Meta = {
  lastSyncIso?: string
}

export function getLastSync(): Date | undefined {
  ensureDataDir()
  if (!fs.existsSync(META_JSON)) return undefined
  try {
    const raw = fs.readFileSync(META_JSON, 'utf8')
    const meta = JSON.parse(raw) as Meta
    return meta.lastSyncIso ? new Date(meta.lastSyncIso) : undefined
  } catch {
    return undefined
  }
}

export function setLastSync(date: Date) {
  ensureDataDir()
  const meta: Meta = { lastSyncIso: date.toISOString() }
  fs.writeFileSync(META_JSON, JSON.stringify(meta, null, 2), 'utf8')
}


