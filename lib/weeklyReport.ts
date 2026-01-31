/**
 * Weekly Report - Fetch and compile daily reports for /weekly-report command
 *
 * Fetches messages from the Daily Progress channel, filters by user,
 * parses the block structure, and compiles to editable plain text.
 */

import { slackClient } from '@/lib/slackClient'

const MODAL_MAX_LENGTH = 3000
const TRUNCATE_SUFFIX = '\n\n[... truncated - edit and add details as needed]'

export interface FetchAndCompileResult {
  success: boolean
  compiledText?: string
  reportCount?: number
  error?: string
}

interface ParsedDailyReport {
  dateStr: string
  dateSort: string // YYYY-MM-DD for sorting
  project: string
  hours: string
  progress: string
  tomorrowPlan?: string
}

/**
 * Get Monday 00:00 PKT and Sunday 23:59:59 PKT of the current week as Unix timestamps
 */
function getWeekRangePkt(): { oldest: number; latest: number } {
  const now = new Date()

  // Get current date in Asia/Karachi as YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const todayStr = `${year}-${month}-${day}`

  // Get day of week in PKT (0=Sun, 1=Mon, ..., 6=Sat)
  const dowFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
  })
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = dowMap[dowFormatter.format(now)] ?? 0

  // Monday offset: Mon=0, Tue=-1, Wed=-2, ..., Sun=-6
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const mondayDate = new Date(todayStr)
  mondayDate.setDate(mondayDate.getDate() + mondayOffset)
  const sundayDate = new Date(mondayDate)
  sundayDate.setDate(sundayDate.getDate() + 6)

  const mondayStr = mondayDate.toISOString().slice(0, 10)
  const sundayStr = sundayDate.toISOString().slice(0, 10)

  // Monday 00:00:00 PKT, Sunday 23:59:59 PKT
  const mondayStart = new Date(`${mondayStr}T00:00:00+05:00`)
  const sundayEnd = new Date(`${sundayStr}T23:59:59+05:00`)

  return {
    oldest: Math.floor(mondayStart.getTime() / 1000),
    latest: Math.floor(sundayEnd.getTime() / 1000),
  }
}

/**
 * Parse "27 Jan 2026" to "2026-01-27" for sorting
 */
function parseDateStrToSort(dateStr: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const match = dateStr.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/)
  if (!match) return dateStr
  const [, day, month, year] = match
  const mm = months[month] ?? '01'
  return `${year}-${mm}-${day.padStart(2, '0')}`
}

/**
 * Extract value from field text like "*Label:*\nvalue" (value can be multiline)
 */
function extractFieldValue(text: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\*${escapedLabel}:\\*\\s*\\n([\\s\\S]*)`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * Check if a message is a daily report from the given user
 */
function isUserDailyReport(blocks: unknown[] | undefined, userId: string): boolean {
  if (!blocks || !Array.isArray(blocks)) return false
  const userMention = `<@${userId}>`
  for (const block of blocks) {
    const b = block as Record<string, unknown>
    if (b.type === 'section' && Array.isArray(b.fields)) {
      for (const field of b.fields as Array<{ text?: string }>) {
        if (field.text?.includes(userMention)) return true
      }
    }
  }
  return false
}

/**
 * Parse a daily report message's blocks into structured data
 */
function parseDailyReportBlocks(blocks: unknown[]): ParsedDailyReport | null {
  if (!blocks || !Array.isArray(blocks)) return null
  let dateStr = ''
  let project = ''
  let hours = ''
  let progress = ''
  let tomorrowPlan: string | undefined

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    if (b.type === 'section' && Array.isArray(b.fields)) {
      for (const field of b.fields as Array<{ text?: string }>) {
        const text = field.text ?? ''
        if (text.includes('*Date:*')) dateStr = extractFieldValue(text, 'Date')
        if (text.includes('*Project:*')) project = extractFieldValue(text, 'Project')
        if (text.includes('*Hours:*')) hours = extractFieldValue(text, 'Hours')
      }
    }
    if (b.type === 'section' && b.text && typeof (b.text as any).text === 'string') {
      const text = (b.text as { text: string }).text
      if (text.includes('*Tasks / Progress:*')) {
        progress = extractFieldValue(text, 'Tasks / Progress')
      }
      if (text.includes("*Tomorrow's Plan:*")) {
        tomorrowPlan = extractFieldValue(text, "Tomorrow's Plan")
      }
    }
  }

  if (!dateStr || !project) return null

  return {
    dateStr,
    dateSort: parseDateStrToSort(dateStr),
    project,
    hours,
    progress,
    tomorrowPlan: tomorrowPlan || undefined,
  }
}

/**
 * Compile parsed reports into plain text for the modal
 */
function compileToText(reports: ParsedDailyReport[], dateRangeStr: string, userMention: string): string {
  const lines: string[] = [
    'Weekly Progress Report',
    `Reporter: ${userMention} | Week: ${dateRangeStr}`,
    '',
  ]

  for (const r of reports) {
    lines.push(`--- ${r.dateStr} ---`)
    lines.push(`Project: ${r.project} | Hours: ${r.hours}`)
    lines.push('Progress:')
    lines.push(r.progress ? r.progress.split('\n').map((l) => `  ${l}`).join('\n') : '  (none)')
    if (r.tomorrowPlan) {
      lines.push("Tomorrow's Plan:")
      lines.push(r.tomorrowPlan.split('\n').map((l) => `  ${l}`).join('\n'))
    }
    lines.push('')
  }

  let text = lines.join('\n').trim()
  if (text.length > MODAL_MAX_LENGTH) {
    text = text.slice(0, MODAL_MAX_LENGTH - TRUNCATE_SUFFIX.length) + TRUNCATE_SUFFIX
  }
  return text
}

/**
 * Fetch the user's daily reports from the current week and compile to editable text
 */
export async function fetchAndCompileWeeklyReport(
  userId: string,
  dailyChannelId: string
): Promise<FetchAndCompileResult> {
  try {
    const { oldest, latest } = getWeekRangePkt()

    const allMessages: Array<{ ts?: string; blocks?: unknown[] }> = []
    let cursor: string | undefined

    do {
      const result = await slackClient.conversations.history({
        channel: dailyChannelId,
        oldest: String(oldest),
        latest: String(latest),
        limit: 200,
        cursor,
      })

      const messages = (result.messages ?? []) as Array<{ ts?: string; blocks?: unknown[] }>
      allMessages.push(...messages)
      cursor = (result.response_metadata as { next_cursor?: string })?.next_cursor
    } while (cursor)

    const userReports: ParsedDailyReport[] = []
    for (const msg of allMessages) {
      if (!isUserDailyReport(msg.blocks, userId)) continue
      const parsed = parseDailyReportBlocks(msg.blocks ?? [])
      if (parsed) userReports.push(parsed)
    }

    if (userReports.length === 0) {
      return { success: true, compiledText: '', reportCount: 0 }
    }

    userReports.sort((a, b) => a.dateSort.localeCompare(b.dateSort))

    const monday = userReports[0]?.dateStr ?? ''
    const friday = userReports[userReports.length - 1]?.dateStr ?? ''
    const dateRangeStr = `${monday} – ${friday}`

    let reporterName = `<@${userId}>`
    try {
      const userInfo = await slackClient.users.info({ user: userId })
      const profile = userInfo.user?.profile as { real_name?: string; display_name?: string } | undefined
      reporterName = profile?.real_name || profile?.display_name || reporterName
    } catch {
      // fallback to mention if user lookup fails
    }

    const compiledText = compileToText(userReports, dateRangeStr, reporterName)

    return {
      success: true,
      compiledText,
      reportCount: userReports.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('weeklyReport fetchAndCompile error:', err)
    if (message.includes('channel_not_found') || message.includes('not_in_channel')) {
      return { success: false, error: 'Unable to access the Daily Progress channel.' }
    }
    return { success: false, error: `Failed to fetch reports: ${message}` }
  }
}
