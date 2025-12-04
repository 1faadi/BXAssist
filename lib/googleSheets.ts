/**
 * Google Sheets Integration for Leave Requests
 * 
 * This module handles all Google Sheets operations for the leave request system.
 * 
 * Current leave decision model: Single manager, approve/reject, synced with Google Sheets.
 * 
 * Sheet structure (LeaveRequests tab):
 * A: Timestamp
 * B: SlackUserId
 * C: EmployeeName
 * D: FromDate
 * E: ToDate
 * F: Reason
 * G: Status (Pending, Approved, Rejected)
 * H: DecisionBy (manager name who decided)
 * I: DecisionAt (ISO datetime)
 * J: SlackMessageTs
 * K: SlackChannelId
 */

import { google } from 'googleapis'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')

if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  throw new Error('Google Sheets env vars are missing')
}

const auth = new google.auth.JWT(
  CLIENT_EMAIL,
  undefined,
  PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
)

const sheets = google.sheets({ version: 'v4', auth })

/**
 * Append a new leave request row to Google Sheets
 * 
 * Creates a new row with status "Pending" and empty DecisionBy/DecisionAt fields.
 * 
 * Columns A-K: Timestamp | SlackUserId | EmployeeName | FromDate | ToDate | Reason | Status | DecisionBy | DecisionAt | SlackMessageTs | SlackChannelId
 */
export async function appendLeaveRequestRow(params: {
  timestamp: string
  slackUserId: string
  employeeName: string
  fromDate: string
  toDate: string
  reason: string
  status: string // initially "Pending"
  slackMessageTs: string
  slackChannelId: string
}) {
  const {
    timestamp,
    slackUserId,
    employeeName,
    fromDate,
    toDate,
    reason,
    status,
    slackMessageTs,
    slackChannelId,
  } = params

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'LeaveRequests!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          timestamp, // A: Timestamp
          slackUserId, // B: SlackUserId
          employeeName, // C: EmployeeName
          fromDate, // D: FromDate
          toDate, // E: ToDate
          reason, // F: Reason
          status, // G: Status
          '', // H: DecisionBy (empty for new requests)
          '', // I: DecisionAt (empty for new requests)
          slackMessageTs, // J: SlackMessageTs
          slackChannelId, // K: SlackChannelId
        ],
      ],
    },
  })
}

/**
 * Set leave decision (Approve or Reject) in Google Sheets
 * 
 * Finds the leave request by channelId and messageTs, then updates:
 * - Status (G) to "Approved" or "Rejected"
 * - DecisionBy (H) to the manager's name
 * - DecisionAt (I) to current ISO timestamp
 * 
 * Returns decision info plus requester details for DM notification.
 * 
 * Columns A-K: Timestamp | SlackUserId | EmployeeName | FromDate | ToDate | Reason | Status | DecisionBy | DecisionAt | SlackMessageTs | SlackChannelId
 */
export async function setLeaveDecision(args: {
  channelId: string
  messageTs: string
  decision: 'Approved' | 'Rejected'
  decidedBy: string // manager display name
}): Promise<{
  status: string
  decidedBy: string
  decidedAt: string
  requesterId: string
  fromDate: string
  toDate: string
  reason: string
}> {
  const { channelId, messageTs, decision, decidedBy } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'LeaveRequests!A2:K1000', // skip header, columns A-K
  })

  const rows = res.data.values || []

  let foundRowIndex: number | null = null
  let row: string[] | undefined

  rows.forEach((r, idx) => {
    const ts = r[9] // SlackMessageTs (J)
    const ch = r[10] // SlackChannelId (K)
    if (ts === messageTs && ch === channelId) {
      foundRowIndex = idx + 2 // because data starts at row 2
      row = r
    }
  })

  if (!row || !foundRowIndex) {
    throw new Error('Leave request row not found in sheet')
  }

  // Ensure row has all 11 columns (A-K)
  while (row.length < 11) row.push('')

  // Check if already decided
  if (row[6] === 'Approved' || row[6] === 'Rejected') {
    throw new Error('This leave is already decided.')
  }

  const decidedAt = new Date().toISOString()

  // Update columns
  row[6] = decision // Status (G)
  row[7] = decidedBy // DecisionBy (H)
  row[8] = decidedAt // DecisionAt (I)

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `LeaveRequests!A${foundRowIndex}:K${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return {
    status: decision,
    decidedBy,
    decidedAt,
    requesterId: row[1], // SlackUserId (B)
    fromDate: row[3], // FromDate (D)
    toDate: row[4], // ToDate (E)
    reason: row[5], // Reason (F)
  }
}

/**
 * Record check-in for an employee
 * 
 * Attendance sheet structure:
 * A: Date (YYYY-MM-DD in Asia/Karachi)
 * B: SlackUserId
 * C: EmployeeName
 * D: CheckInTime (HH:mm:ss in Asia/Karachi)
 * E: CheckOutTime (HH:mm:ss in Asia/Karachi)
 * F: TotalHours (e.g., "5h 19m")
 * G: FirstCheckInTimestamp (ISO UTC)
 * H: LastCheckOutTimestamp (ISO UTC)
 * 
 * Returns:
 * - alreadyCheckedIn: true if check-in already exists for today
 * - checkInTime: time of check-in (if already checked in)
 * - date: date string (PK time)
 * - firstCheckInTimestamp: ISO timestamp (if already checked in)
 */
export async function recordCheckIn(params: {
  slackUserId: string
  employeeName: string
}): Promise<{
  alreadyCheckedIn: boolean
  checkInTime?: string
  date: string
  firstCheckInTimestamp?: string
}> {
  const { slackUserId, employeeName } = params
  const { nowIso, datePk, timePk } = await import('./timePk').then((m) => m.nowPk())

  // Check if already checked in today (read full range A:H)
  const range = 'Attendance!A2:H10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  for (const row of rows) {
    if (row[0] === datePk && row[1] === slackUserId && row[3]) {
      // Already checked in today
      return {
        alreadyCheckedIn: true,
        checkInTime: row[3],
        date: datePk,
        firstCheckInTimestamp: row[6] || nowIso, // Column G
      }
    }
  }

  // Append new check-in row with all 8 columns
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Attendance!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          datePk, // A: Date
          slackUserId, // B: SlackUserId
          employeeName, // C: EmployeeName
          timePk, // D: CheckInTime
          '', // E: CheckOutTime (empty)
          '', // F: TotalHours (empty)
          nowIso, // G: FirstCheckInTimestamp
          '', // H: LastCheckOutTimestamp (empty)
        ],
      ],
    },
  })

  return {
    alreadyCheckedIn: false,
    date: datePk,
    firstCheckInTimestamp: nowIso,
  }
}

/**
 * Record checkout for an employee
 * 
 * Finds today's check-in row and updates the checkout time and total hours.
 * 
 * Returns:
 * - canCheckout: false if no check-in found for today
 * - alreadyCheckedOut: true if already checked out
 * - checkOutTime: time of checkout (if already checked out)
 * - checkInTime: time of check-in
 * - date: date string (PK time)
 * - totalHours: formatted string (e.g., "5h 19m")
 * - totalHoursDecimal: decimal hours (for calculations)
 */
export async function recordCheckOut(params: {
  slackUserId: string
  employeeName: string
}): Promise<{
  canCheckout: boolean
  alreadyCheckedOut?: boolean
  checkOutTime?: string
  checkInTime?: string
  date?: string
  totalHours?: string // Formatted: "5h 19m"
  totalHoursDecimal?: number // Decimal: 5.31
}> {
  const { slackUserId, employeeName } = params
  const timePkModule = await import('./timePk')
  const { nowIso, datePk, timePk } = timePkModule.nowPk()
  const { formatTotalHours } = timePkModule

  // Find today's check-in row (read full range A:H)
  const range = 'Attendance!A2:H10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  let foundRowIndex: number | null = null
  let row: string[] | undefined

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r[0] === datePk && r[1] === slackUserId && r[3]) {
      // Found today's check-in
      foundRowIndex = i + 2 // Convert to 1-based, accounting for header
      row = r
      break
    }
  }

  if (!row || !foundRowIndex) {
    return { canCheckout: false }
  }

  // Ensure row has all 8 columns
  while (row.length < 8) row.push('')

  // Check if already checked out
  if (row[4]) {
    return {
      canCheckout: true,
      alreadyCheckedOut: true,
      checkOutTime: row[4],
      checkInTime: row[3],
      date: datePk,
      totalHours: row[5] || '', // Column F
    }
  }

  // Get first check-in timestamp (column G)
  const firstCheckInTimestamp = row[6] || nowIso

  // Calculate total hours from timestamps
  const checkInDate = new Date(firstCheckInTimestamp)
  const checkOutDate = new Date(nowIso)
  const totalMs = checkOutDate.getTime() - checkInDate.getTime()
  const totalHoursDecimal = totalMs / (1000 * 60 * 60)
  const totalHours = formatTotalHours(totalHoursDecimal)

  // Update all columns (A:H)
  row[4] = timePk // E: CheckOutTime
  row[5] = totalHours // F: TotalHours
  row[7] = nowIso // H: LastCheckOutTimestamp

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Attendance!A${foundRowIndex}:H${foundRowIndex}`, // Update full row A:H
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return {
    canCheckout: true,
    alreadyCheckedOut: false,
    checkOutTime: timePk,
    checkInTime: row[3],
    date: datePk,
    totalHours,
    totalHoursDecimal: Math.round(totalHoursDecimal * 100) / 100,
  }
}

// Helper functions for other parts of the app
export async function appendRow(range: string, values: any[]): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  })
}

export async function getValues(range: string): Promise<any[][]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })
  return response.data.values || []
}

/**
 * Settings Tab Helpers
 * 
 * Settings tab structure:
 * A: Key
 * B: Value
 * Header row: A1="Key", B1="Value"
 */

/**
 * Get a setting value by key from Settings tab
 * Returns null if key not found
 */
export async function getSetting(key: string): Promise<string | null> {
  const range = 'Settings!A2:B200'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  for (const row of rows) {
    if (row[0] === key) {
      return row[1] || null
    }
  }

  return null
}

/**
 * Set a setting value (update if exists, append if not)
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const range = 'Settings!A2:B200'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  let foundRowIndex: number | null = null

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === key) {
      foundRowIndex = i + 2 // Convert to 1-based, accounting for header
      break
    }
  }

  if (foundRowIndex) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Settings!A${foundRowIndex}:B${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[key, value]],
      },
    })
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[key, value]],
      },
    })
  }
}

/**
 * Attendance Reminder Queue Tab Helpers
 * 
 * AttendanceReminderQueue tab structure:
 * A: Date (YYYY-MM-DD PKT)
 * B: SlackUserId
 * C: ImChannelId
 * D: ScheduledMessageId
 * E: PostAt (Unix epoch seconds)
 * F: Status (scheduled, cancelled, sent)
 * Header row: A1="Date", B1="SlackUserId", C1="ImChannelId", D1="ScheduledMessageId", E1="PostAt", F1="Status"
 */

/**
 * Upsert a reminder queue row (update if exists for date+user, else append)
 */
export async function upsertReminderQueueRow(args: {
  datePk: string
  slackUserId: string
  imChannelId: string
  scheduledMessageId: string
  postAt: number
  status: 'scheduled' | 'cancelled' | 'sent'
}): Promise<void> {
  const { datePk, slackUserId, imChannelId, scheduledMessageId, postAt, status } = args

  const range = 'AttendanceReminderQueue!A2:F10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  let foundRowIndex: number | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row[0] === datePk && row[1] === slackUserId) {
      foundRowIndex = i + 2 // Convert to 1-based, accounting for header
      break
    }
  }

  const rowData = [
    datePk, // A
    slackUserId, // B
    imChannelId, // C
    scheduledMessageId, // D
    postAt.toString(), // E (as string)
    status, // F
  ]

  if (foundRowIndex) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `AttendanceReminderQueue!A${foundRowIndex}:F${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    })
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'AttendanceReminderQueue!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
      },
    })
  }
}

/**
 * Find reminder queue entry for a user on a specific date
 */
export async function findReminderForUser(args: {
  datePk: string
  slackUserId: string
}): Promise<{
  imChannelId: string
  scheduledMessageId: string
  postAt: number
  status: string
} | null> {
  const { datePk, slackUserId } = args

  const range = 'AttendanceReminderQueue!A2:F10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  for (const row of rows) {
    if (row[0] === datePk && row[1] === slackUserId) {
      return {
        imChannelId: row[2] || '',
        scheduledMessageId: row[3] || '',
        postAt: Number(row[4]) || 0,
        status: row[5] || '',
      }
    }
  }

  return null
}

/**
 * Mark reminder status (cancelled or sent)
 */
export async function markReminderStatus(args: {
  datePk: string
  slackUserId: string
  status: 'cancelled' | 'sent'
}): Promise<void> {
  const { datePk, slackUserId, status } = args

  const range = 'AttendanceReminderQueue!A2:F10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  let foundRowIndex: number | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row[0] === datePk && row[1] === slackUserId) {
      foundRowIndex = i + 2 // Convert to 1-based, accounting for header
      break
    }
  }

  if (!foundRowIndex) {
    throw new Error('Reminder queue entry not found')
  }

  // Update only the Status column (F)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `AttendanceReminderQueue!F${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status]],
    },
  })
}

/**
 * Overtime Requests Tab Helpers
 * 
 * OvertimeRequests tab structure:
 * A: Timestamp
 * B: SlackUserId
 * C: EmployeeName
 * D: ProjectName
 * E: AssignedByUserId
 * F: Hours
 * G: Minutes
 * H: Reason
 * I: Status (Pending, Approved, Rejected)
 * J: DecisionBy (approver display name)
 * K: DecisionAt (ISO datetime)
 * L: SlackMessageTs
 * M: SlackChannelId
 * Header row: A1="Timestamp", B1="SlackUserId", etc.
 */

/**
 * Append a new overtime request row to Google Sheets
 */
export async function appendOvertimeRequestRow(args: {
  timestamp: string
  slackUserId: string
  employeeName: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected'
  slackMessageTs: string
  slackChannelId: string
}): Promise<void> {
  const {
    timestamp,
    slackUserId,
    employeeName,
    projectName,
    assignedByUserId,
    hours,
    minutes,
    reason,
    status,
    slackMessageTs,
    slackChannelId,
  } = args

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'OvertimeRequests!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          timestamp, // A: Timestamp
          slackUserId, // B: SlackUserId
          employeeName, // C: EmployeeName
          projectName, // D: ProjectName
          assignedByUserId, // E: AssignedByUserId
          hours.toString(), // F: Hours
          minutes.toString(), // G: Minutes
          reason, // H: Reason
          status, // I: Status
          '', // J: DecisionBy (empty for new requests)
          '', // K: DecisionAt (empty for new requests)
          slackMessageTs, // L: SlackMessageTs
          slackChannelId, // M: SlackChannelId
        ],
      ],
    },
  })
}

/**
 * Get overtime request by channelId and messageTs
 * 
 * Returns the overtime request row data for authorization checks.
 * 
 * Columns A-M: Timestamp | SlackUserId | EmployeeName | ProjectName | AssignedByUserId | Hours | Minutes | Reason | Status | DecisionBy | DecisionAt | SlackMessageTs | SlackChannelId
 */
export async function getOvertimeRequestByKey(args: {
  channelId: string
  messageTs: string
}): Promise<{
  timestamp: string
  slackUserId: string
  employeeName: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason: string
  status: string
  decisionBy: string
  decisionAt: string
  slackMessageTs: string
  slackChannelId: string
} | null> {
  const { channelId, messageTs } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'OvertimeRequests!A2:M10000', // skip header, columns A-M
  })

  const rows = res.data.values || []

  for (const row of rows) {
    const ts = row[11] // SlackMessageTs (L)
    const ch = row[12] // SlackChannelId (M)
    if (ts === messageTs && ch === channelId) {
      // Ensure row has all 13 columns (A-M)
      const fullRow = [...row]
      while (fullRow.length < 13) fullRow.push('')

      return {
        timestamp: fullRow[0] || '',
        slackUserId: fullRow[1] || '',
        employeeName: fullRow[2] || '',
        projectName: fullRow[3] || '',
        assignedByUserId: fullRow[4] || '',
        hours: Number(fullRow[5]) || 0,
        minutes: Number(fullRow[6]) || 0,
        reason: fullRow[7] || '',
        status: fullRow[8] || '',
        decisionBy: fullRow[9] || '',
        decisionAt: fullRow[10] || '',
        slackMessageTs: fullRow[11] || '',
        slackChannelId: fullRow[12] || '',
      }
    }
  }

  return null
}

/**
 * Set overtime decision (Approve or Reject) in Google Sheets
 * 
 * Finds the overtime request by channelId and messageTs, then updates:
 * - Status (I) to "Approved" or "Rejected"
 * - DecisionBy (J) to the approver's name
 * - DecisionAt (K) to current ISO timestamp
 * 
 * Returns decision info plus requester details for DM notification.
 * 
 * Columns A-M: Timestamp | SlackUserId | EmployeeName | ProjectName | AssignedByUserId | Hours | Minutes | Reason | Status | DecisionBy | DecisionAt | SlackMessageTs | SlackChannelId
 */
export async function setOvertimeDecision(args: {
  channelId: string
  messageTs: string
  decision: 'Approved' | 'Rejected'
  decidedBy: string // approver display name
}): Promise<{
  alreadyDecided: boolean
  status: 'Approved' | 'Rejected'
  decidedBy: string
  decidedAt: string
  requesterId: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason: string
}> {
  const { channelId, messageTs, decision, decidedBy } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'OvertimeRequests!A2:M10000', // skip header, columns A-M
  })

  const rows = res.data.values || []

  let foundRowIndex: number | null = null
  let row: string[] | undefined

  rows.forEach((r, idx) => {
    const ts = r[11] // SlackMessageTs (L)
    const ch = r[12] // SlackChannelId (M)
    if (ts === messageTs && ch === channelId) {
      foundRowIndex = idx + 2 // because data starts at row 2
      row = r
    }
  })

  if (!row || !foundRowIndex) {
    throw new Error('Overtime request row not found in sheet')
  }

  // Ensure row has all 13 columns (A-M)
  while (row.length < 13) row.push('')

  // Check if already decided
  if (row[8] === 'Approved' || row[8] === 'Rejected') {
    // Return existing decision info with alreadyDecided flag
    return {
      alreadyDecided: true,
      status: row[8] as 'Approved' | 'Rejected',
      decidedBy: row[9] || '',
      decidedAt: row[10] || new Date().toISOString(),
      requesterId: row[1], // SlackUserId (B)
      projectName: row[3], // ProjectName (D)
      assignedByUserId: row[4], // AssignedByUserId (E)
      hours: Number(row[5]) || 0, // Hours (F)
      minutes: Number(row[6]) || 0, // Minutes (G)
      reason: row[7] || '', // Reason (H)
    }
  }

  const decidedAt = new Date().toISOString()

  // Update columns
  row[8] = decision // Status (I)
  row[9] = decidedBy // DecisionBy (J)
  row[10] = decidedAt // DecisionAt (K)

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `OvertimeRequests!A${foundRowIndex}:M${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return {
    alreadyDecided: false,
    status: decision,
    decidedBy,
    decidedAt,
    requesterId: row[1], // SlackUserId (B)
    projectName: row[3], // ProjectName (D)
    assignedByUserId: row[4], // AssignedByUserId (E)
    hours: Number(row[5]) || 0, // Hours (F)
    minutes: Number(row[6]) || 0, // Minutes (G)
    reason: row[7] || '', // Reason (H)
  }
}

/**
 * Short Leave Requests Tab Helpers
 * 
 * ShortLeaveRequests tab structure:
 * A: Timestamp
 * B: SlackUserId
 * C: EmployeeName
 * D: FromDate (YYYY-MM-DD)
 * E: ToDate (YYYY-MM-DD)
 * F: TimeFrom (HH:mm)
 * G: TimeTo (HH:mm)
 * H: Reason
 * I: Status (Pending, Approved, Rejected)
 * J: DecisionBy (approver user ID)
 * K: DecisionAt (ISO datetime)
 * L: SlackMessageTs
 * M: SlackChannelId
 * Header row: A1="Timestamp", B1="SlackUserId", ..., M1="SlackChannelId"
 */

/**
 * Append a new short leave request row to Google Sheets
 */
export async function appendShortLeaveRequestRow(args: {
  timestamp: string
  slackUserId: string
  employeeName: string
  fromDate: string
  toDate: string
  timeFrom: string
  timeTo: string
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected'
  slackMessageTs: string
  slackChannelId: string
}): Promise<void> {
  const {
    timestamp,
    slackUserId,
    employeeName,
    fromDate,
    toDate,
    timeFrom,
  timeTo,
    reason,
    status,
    slackMessageTs,
    slackChannelId,
  } = args

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ShortLeaveRequests!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          timestamp, // A: Timestamp
          slackUserId, // B: SlackUserId
          employeeName, // C: EmployeeName
          fromDate, // D: FromDate
          toDate, // E: ToDate
          timeFrom, // F: TimeFrom
          timeTo, // G: TimeTo
          reason, // H: Reason
          status, // I: Status
          '', // J: DecisionBy (empty for new requests)
          '', // K: DecisionAt (empty for new requests)
          slackMessageTs, // L: SlackMessageTs
          slackChannelId, // M: SlackChannelId
        ],
      ],
    },
  })
}

/**
 * Set short leave decision (Approve or Reject) in Google Sheets
 * 
 * Finds the short leave request by channelId and messageTs, then updates:
 * - Status (I) to "Approved" or "Rejected"
 * - DecisionBy (J) to the approver's user ID
 * - DecisionAt (K) to current ISO timestamp
 * 
 * Returns decision info plus requester details for DM notification.
 * 
 * Columns A-M: Timestamp | SlackUserId | EmployeeName | FromDate | ToDate | TimeFrom | TimeTo | Reason | Status | DecisionBy | DecisionAt | SlackMessageTs | SlackChannelId
 */
export async function setShortLeaveDecision(args: {
  channelId: string
  messageTs: string
  decision: 'Approved' | 'Rejected'
  decidedById: string // approver user ID
}): Promise<{
  alreadyDecided: boolean
  status: 'Approved' | 'Rejected'
  decidedById: string
  decidedAtIso: string
  requesterId: string
  fromDate: string
  toDate: string
  timeFrom: string
  timeTo: string
  reason: string
}> {
  const { channelId, messageTs, decision, decidedById } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ShortLeaveRequests!A2:M10000', // skip header, columns A-M
  })

  const rows = res.data.values || []

  let foundRowIndex: number | null = null
  let row: string[] | undefined

  rows.forEach((r, idx) => {
    const ts = r[11] // SlackMessageTs (L)
    const ch = r[12] // SlackChannelId (M)
    if (ts === messageTs && ch === channelId) {
      foundRowIndex = idx + 2 // because data starts at row 2
      row = r
    }
  })

  if (!row || !foundRowIndex) {
    throw new Error('Short leave request row not found in sheet')
  }

  // Ensure row has all 13 columns (A-M)
  while (row.length < 13) row.push('')

  // Check if already decided
  if (row[8] === 'Approved' || row[8] === 'Rejected') {
    // Return existing decision info with alreadyDecided flag
    return {
      alreadyDecided: true,
      status: row[8] as 'Approved' | 'Rejected',
      decidedById: row[9] || '', // DecisionBy (J)
      decidedAtIso: row[10] || new Date().toISOString(), // DecisionAt (K)
      requesterId: row[1], // SlackUserId (B)
      fromDate: row[3], // FromDate (D)
      toDate: row[4], // ToDate (E)
      timeFrom: row[5] || '', // TimeFrom (F)
      timeTo: row[6] || '', // TimeTo (G)
      reason: row[7] || '', // Reason (H)
    }
  }

  const decidedAt = new Date().toISOString()

  // Update columns
  row[8] = decision // Status (I)
  row[9] = decidedById // DecisionBy (J) - user ID
  row[10] = decidedAt // DecisionAt (K)

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `ShortLeaveRequests!A${foundRowIndex}:M${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return {
    alreadyDecided: false,
    status: decision,
    decidedById,
    decidedAtIso: decidedAt,
    requesterId: row[1], // SlackUserId (B)
    fromDate: row[3], // FromDate (D)
    toDate: row[4], // ToDate (E)
    timeFrom: row[5] || '', // TimeFrom (F)
    timeTo: row[6] || '', // TimeTo (G)
    reason: row[7] || '', // Reason (H)
  }
}

/**
 * Short Leave Approver Messages Tab Helpers
 * 
 * ShortLeaveApproverMessages tab structure:
 * A: RequestKey (format: "channelId:messageTs")
 * B: ApproverUserId
 * C: ImChannelId (DM channel ID)
 * D: MessageTs (DM message timestamp)
 * E: Status (pending, closed:Approved, closed:Rejected)
 * Header row: A1="RequestKey", B1="ApproverUserId", etc.
 */

/**
 * Add a new approver DM message record
 */
export async function addShortLeaveApproverMessage(args: {
  requestKey: string
  approverUserId: string
  imChannelId: string
  messageTs: string
}): Promise<void> {
  const { requestKey, approverUserId, imChannelId, messageTs } = args

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ShortLeaveApproverMessages!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          requestKey, // A: RequestKey
          approverUserId, // B: ApproverUserId
          imChannelId, // C: ImChannelId
          messageTs, // D: MessageTs
          'pending', // E: Status
        ],
      ],
    },
  })
}

/**
 * Get all approver DM messages for a request key
 */
export async function getShortLeaveApproverMessages(
  requestKey: string
): Promise<
  Array<{
    approverUserId: string
    imChannelId: string
    messageTs: string
    status: string
  }>
> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ShortLeaveApproverMessages!A2:E10000', // skip header, columns A-E
  })

  const rows = res.data.values || []
  const messages: Array<{
    approverUserId: string
    imChannelId: string
    messageTs: string
    status: string
  }> = []

  for (const row of rows) {
    if (row[0] === requestKey) {
      messages.push({
        approverUserId: row[1] || '', // ApproverUserId (B)
        imChannelId: row[2] || '', // ImChannelId (C)
        messageTs: row[3] || '', // MessageTs (D)
        status: row[4] || 'pending', // Status (E)
      })
    }
  }

  return messages
}

/**
 * Mark all approver messages as closed for a request key
 */
export async function closeShortLeaveApproverMessages(
  requestKey: string,
  final: 'Approved' | 'Rejected'
): Promise<void> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ShortLeaveApproverMessages!A2:E10000', // skip header, columns A-E
  })

  const rows = res.data.values || []
  const closedStatus = `closed:${final}`

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row[0] === requestKey && row[4] === 'pending') {
      // Update status column (E)
      const rowIndex = i + 2 // Convert to 1-based, accounting for header
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `ShortLeaveApproverMessages!E${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[closedStatus]],
        },
      })
    }
  }
}

/**
 * Cron Logs Tab Helpers
 * 
 * CronLogs tab structure:
 * A: JobName
 * B: DatePKT (YYYY-MM-DD in Asia/Karachi)
 * C: SentAtISO (ISO timestamp)
 * D: SlackMessageTs
 * Header row: A1="JobName", B1="DatePKT", C1="SentAtISO", D1="SlackMessageTs"
 */

/**
 * Check if a cron job was already sent today
 * 
 * @param jobName - Name of the cron job (e.g., "daily-report-reminder")
 * @param datePkt - Date in YYYY-MM-DD format (Asia/Karachi)
 * @returns true if already sent, false otherwise
 */
export async function cronWasSentToday(
  jobName: string,
  datePkt: string
): Promise<boolean> {
  const range = 'CronLogs!A2:D10000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  for (const row of rows) {
    if (row[0] === jobName && row[1] === datePkt) {
      return true
    }
  }

  return false
}

/**
 * Log a cron job send to CronLogs tab
 * 
 * @param args - Object containing jobName, datePkt, sentAtIso, and slackMessageTs
 */
export async function logCronSend(args: {
  jobName: string
  datePkt: string
  sentAtIso: string
  slackMessageTs: string
}): Promise<void> {
  const { jobName, datePkt, sentAtIso, slackMessageTs } = args

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'CronLogs!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          jobName, // A: JobName
          datePkt, // B: DatePKT
          sentAtIso, // C: SentAtISO
          slackMessageTs, // D: SlackMessageTs
        ],
      ],
    },
  })
}

/**
 * Standup Reports Tab Helpers
 * 
 * StandupReports tab structure:
 * A: Timestamp
 * B: DatePKT (YYYY-MM-DD in Asia/Karachi)
 * C: SlackUserId
 * D: EmployeeName
 * E: ProjectName
 * F: TodaysTask
 * G: SlackMessageTs
 * H: SlackChannelId
 * Header row: A1="Timestamp", B1="DatePKT", etc.
 */

/**
 * Append a new standup report row to Google Sheets
 */
export async function appendStandupRow(args: {
  timestamp: string
  datePkt: string
  slackUserId: string
  employeeName: string
  projectName: string
  todaysTask: string
  slackMessageTs: string
  slackChannelId: string
}): Promise<void> {
  const {
    timestamp,
    datePkt,
    slackUserId,
    employeeName,
    projectName,
    todaysTask,
    slackMessageTs,
    slackChannelId,
  } = args

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'StandupReports!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          timestamp, // A: Timestamp
          datePkt, // B: DatePKT
          slackUserId, // C: SlackUserId
          employeeName, // D: EmployeeName
          projectName, // E: ProjectName
          todaysTask, // F: TodaysTask
          slackMessageTs, // G: SlackMessageTs
          slackChannelId, // H: SlackChannelId
        ],
      ],
    },
  })
}

