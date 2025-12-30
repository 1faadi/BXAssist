import { fetchAttendance, fetchUsers } from './zk/k50'
import {
  loadEmployees,
  saveEmployees,
  loadAttendanceDaily,
  saveAttendanceDaily,
  saveAttendancePunches,
  type AttendanceDailyRow,
} from './k50CsvStore'

const DEVICE_PORT = process.env.K50_PORT ? Number(process.env.K50_PORT) : 4370
const DEVICE_TZ = process.env.K50_TZ || 'Asia/Karachi'

// Allowed device UIDs (whitelist)
const ALLOWED_UIDS = new Set([
  1, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 20, 61, 62, 63, 68, 70, 29, 49,
])

// Support multiple devices (e.g. separate check-in / check-out units)
// K50_IPS=192.168.0.201,192.168.0.200 or fallback to single K50_IP
const RAW_IPS =
  process.env.K50_IPS ||
  (process.env.K50_IP ? String(process.env.K50_IP) : '')

const DEVICE_IPS = RAW_IPS.split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

if (!DEVICE_IPS.length) {
  console.warn(
    '[k50Sync] Neither K50_IPS nor K50_IP is set. Device sync will fail until configured.'
  )
}

function ensureConfig() {
  if (!DEVICE_IPS.length) {
    throw new Error('K50_IPS or K50_IP env var is required for device sync')
  }
}

function formatDateLocal(date: Date, tz: string): string {
  // Get YYYY-MM-DD in the given timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

/**
 * Sync from K50 device into local CSV "excel-like" files.
 * - employees.csv: deviceUid, name
 * - attendance_daily.csv: date, deviceUid, name, checkInIso, checkOutIso
 *
 * First punch of the day => check-in
 * Last punch of the day  => check-out
 */
export async function syncK50() {
  ensureConfig()

  // 1) Sync employees
  const employees = loadEmployees()
  const byUid = new Map(employees.map((e) => [e.deviceUid, e]))
  let totalInserted = 0

  for (const ip of DEVICE_IPS) {
    const config = { ip, port: DEVICE_PORT }

    const zkUsers = await fetchUsers(config)

    for (const u of zkUsers) {
      const deviceUid = Number((u as any).uid ?? (u as any).userId ?? 0)
      if (!deviceUid || !ALLOWED_UIDS.has(deviceUid)) continue
      const name =
        (u as any).name ||
        (u as any).username ||
        (u as any).fullName ||
        `User ${deviceUid}`

      const existing = byUid.get(deviceUid)
      if (existing) {
        existing.name = name
      } else {
        byUid.set(deviceUid, { deviceUid, name })
      }
    }
  }

  saveEmployees(Array.from(byUid.values()))

  // 2) Sync attendance logs from all devices.
  // We always read the full log list from each device and rebuild the
  // per-day aggregation, so historical data is always complete.

  // Map for per-day summary
  const keyMap = new Map<
    string,
    AttendanceDailyRow & { count: number }
  >()

  const punches: {
    date: string
    deviceUid: number
    name: string
    punchIso: string
    sourceIp: string
  }[] = []

  for (const ip of DEVICE_IPS) {
    const config = { ip, port: DEVICE_PORT }
    const logs = await fetchAttendance(config)
    totalInserted += logs.length

    for (const log of logs) {
      const deviceUid = log.userId
      if (!deviceUid || !ALLOWED_UIDS.has(deviceUid)) continue
      const localDate = formatDateLocal(log.timestamp, DEVICE_TZ)
      const key = `${localDate}|${deviceUid}`
      const existing = keyMap.get(key)
      const iso = log.timestamp.toISOString()
      const name = byUid.get(deviceUid)?.name ?? `User ${deviceUid}`

      punches.push({
        date: localDate,
        deviceUid,
        name,
        punchIso: iso,
        sourceIp: (log.raw as any)?.ip || ip,
      })

      if (!existing) {
        keyMap.set(key, {
          date: localDate,
          deviceUid,
          name,
          checkInIso: iso,
          checkOutIso: '', // will be set if we see more than one punch
          count: 1,
        })
      } else {
        // First punch = earliest, last punch = latest
        if (iso < existing.checkInIso) existing.checkInIso = iso
        if (!existing.checkOutIso || iso > existing.checkOutIso) {
          existing.checkOutIso = iso
        }
        existing.count += 1
      }
    }
  }

  const updatedRows = Array.from(keyMap.values())
    .map(({ count, ...rest }) => ({
      ...rest,
      // Business rule: no checkout without a prior checkin
      checkOutIso: count > 1 ? rest.checkOutIso : '',
    }))
    .sort((a, b) => {
    if (a.date === b.date) return a.deviceUid - b.deviceUid
    return a.date.localeCompare(b.date)
  })
  saveAttendanceDaily(updatedRows)

  punches.sort((a, b) => {
    if (a.date === b.date) {
      if (a.deviceUid === b.deviceUid) {
        return a.punchIso.localeCompare(b.punchIso)
      }
      return a.deviceUid - b.deviceUid
    }
    return a.date.localeCompare(b.date)
  })
  saveAttendancePunches(punches)

  return { inserted: totalInserted, updatedDays: updatedRows.length }
}

export function getEmployeesFromCsv() {
  return loadEmployees()
}

export function getAttendanceFromCsv(date?: string) {
  const rows = loadAttendanceDaily()
  if (!date) return rows
  return rows.filter((r) => r.date === date)
}


