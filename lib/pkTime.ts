/**
 * Pakistan Time (PKT) Utilities for Scheduling
 * 
 * Provides functions to convert PKT times to UTC epoch seconds for Slack scheduled messages.
 * Pakistan is UTC+05:00 (no DST).
 */

/**
 * Get current date in PKT as YYYY-MM-DD string
 */
export function getPkDateStr(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value || ''
  const month = parts.find((p) => p.type === 'month')?.value || ''
  const day = parts.find((p) => p.type === 'day')?.value || ''
  return `${year}-${month}-${day}`
}

/**
 * Convert PKT date + time (HH:mm) to UTC epoch seconds
 * 
 * @param datePk - Date in YYYY-MM-DD format (PKT)
 * @param hhmm - Time in HH:mm format (24-hour, PKT)
 * @returns Unix timestamp in seconds (UTC)
 * 
 * Example: pkTimeToUtcEpochSeconds('2025-01-15', '09:10')
 * Returns: 1705286400 (if that's the UTC epoch for 09:10 PKT on that date)
 */
export function pkTimeToUtcEpochSeconds(
  datePk: string,
  hhmm: string
): number {
  // Create ISO string with PKT timezone offset (+05:00)
  // Format: YYYY-MM-DDTHH:mm:00+05:00
  const isoString = `${datePk}T${hhmm}:00+05:00`
  const date = new Date(isoString)
  
  // Return epoch seconds (UTC)
  return Math.floor(date.getTime() / 1000)
}

