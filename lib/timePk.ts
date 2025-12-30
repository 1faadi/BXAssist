/**
 * Pakistan Time Utilities
 * 
 * Provides time formatting functions for Asia/Karachi timezone (UTC+05:00).
 * 
 * Vercel servers run in UTC, so we must explicitly use Asia/Karachi timezone
 * for all date/time displays and Google Sheets entries.
 */

export function nowPk(): {
  nowIso: string // ISO timestamp in UTC (for accurate calculations)
  datePk: string // YYYY-MM-DD in Asia/Karachi
  timePk: string // HH:mm:ss in Asia/Karachi
  timePkHHmm: string // HH:mm in Asia/Karachi
} {
  const now = new Date()
  const nowIso = now.toISOString()

  // Format date as YYYY-MM-DD in Asia/Karachi
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dateParts = dateFormatter.formatToParts(now)
  const datePk = `${dateParts.find((p) => p.type === 'year')?.value}-${dateParts.find((p) => p.type === 'month')?.value}-${dateParts.find((p) => p.type === 'day')?.value}`

  // Format time as HH:mm:ss in Asia/Karachi
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const timeParts = timeFormatter.formatToParts(now)
  const hour = timeParts.find((p) => p.type === 'hour')?.value.padStart(2, '0') || '00'
  const minute = timeParts.find((p) => p.type === 'minute')?.value.padStart(2, '0') || '00'
  const second = timeParts.find((p) => p.type === 'second')?.value.padStart(2, '0') || '00'
  const timePk = `${hour}:${minute}:${second}`
  const timePkHHmm = `${hour}:${minute}`

  return {
    nowIso,
    datePk,
    timePk,
    timePkHHmm,
  }
}

/**
 * Format total hours as human-readable string (e.g., "5h 19m")
 */
export function formatTotalHours(totalHours: number): string {
  const hours = Math.floor(totalHours)
  const minutes = Math.round((totalHours - hours) * 60)
  if (minutes === 0) {
    return `${hours}h`
  }
  return `${hours}h ${minutes}m`
}

