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
 * F: LeaveType
 * G: Reason
 * H: Status (Pending, Approved, Rejected)
 * I: DecisionBy (manager name who decided)
 * J: DecisionAt (ISO datetime)
 * K: SlackMessageTs
 * L: SlackChannelId
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
 */
export async function appendLeaveRequestRow(params: {
  timestamp: string
  slackUserId: string
  employeeName: string
  fromDate: string
  toDate: string
  leaveType: string
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
    leaveType,
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
          timestamp, // A
          slackUserId, // B
          employeeName, // C
          fromDate, // D
          toDate, // E
          leaveType, // F
          reason, // G
          status, // H
          '', // I DecisionBy (empty for new requests)
          '', // J DecisionAt (empty for new requests)
          slackMessageTs, // K
          slackChannelId, // L
        ],
      ],
    },
  })
}

/**
 * Set leave decision (Approve or Reject) in Google Sheets
 * 
 * Finds the leave request by channelId and messageTs, then updates:
 * - Status (H) to "Approved" or "Rejected"
 * - DecisionBy (I) to the manager's name
 * - DecisionAt (J) to current ISO timestamp
 */
export async function setLeaveDecision(args: {
  channelId: string
  messageTs: string
  decision: 'Approved' | 'Rejected'
  decidedBy: string // manager display name
}): Promise<{ status: string; decidedBy: string; decidedAt: string }> {
  const { channelId, messageTs, decision, decidedBy } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'LeaveRequests!A2:L1000', // skip header, columns A-L
  })

  const rows = res.data.values || []

  let foundRowIndex: number | null = null
  let row: string[] | undefined

  rows.forEach((r, idx) => {
    const ts = r[10] // SlackMessageTs (K)
    const ch = r[11] // SlackChannelId (L)
    if (ts === messageTs && ch === channelId) {
      foundRowIndex = idx + 2 // because data starts at row 2
      row = r
    }
  })

  if (!row || !foundRowIndex) {
    throw new Error('Leave request row not found in sheet')
  }

  // Ensure row has all 12 columns
  while (row.length < 12) row.push('')

  const decidedAt = new Date().toISOString()

  // Update columns
  row[7] = decision // Status (H)
  row[8] = decidedBy // DecisionBy (I)
  row[9] = decidedAt // DecisionAt (J)

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `LeaveRequests!A${foundRowIndex}:L${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return { status: decision, decidedBy, decidedAt }
}

/**
 * Record check-in for an employee
 * 
 * Attendance sheet structure:
 * A: Date (YYYY-MM-DD)
 * B: SlackUserId
 * C: EmployeeName
 * D: CheckIn (HH:MM:SS)
 * E: CheckOut (HH:MM:SS)
 * 
 * Returns:
 * - alreadyCheckedIn: true if check-in already exists for today
 * - checkInTime: time of check-in (if already checked in)
 * - date: date string
 */
export async function recordCheckIn(params: {
  slackUserId: string
  employeeName: string
}): Promise<{ alreadyCheckedIn: boolean; checkInTime?: string; date: string }> {
  const { slackUserId, employeeName } = params
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0] // HH:MM:SS

  // Check if already checked in today
  const range = 'Attendance!A2:E1000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  for (const row of rows) {
    if (row[0] === dateStr && row[1] === slackUserId && row[3]) {
      // Already checked in today
      return {
        alreadyCheckedIn: true,
        checkInTime: row[3],
        date: dateStr,
      }
    }
  }

  // Append new check-in row
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Attendance!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[dateStr, slackUserId, employeeName, timeStr, '']],
    },
  })

  return {
    alreadyCheckedIn: false,
    date: dateStr,
  }
}

/**
 * Record checkout for an employee
 * 
 * Finds today's check-in row and updates the checkout time.
 * 
 * Returns:
 * - canCheckout: false if no check-in found for today
 * - alreadyCheckedOut: true if already checked out
 * - checkOutTime: time of checkout (if already checked out)
 * - checkInTime: time of check-in
 * - date: date string
 * - totalHours: calculated hours between check-in and checkout
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
  totalHours?: number
}> {
  const { slackUserId, employeeName } = params
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0] // HH:MM:SS

  // Find today's check-in row
  const range = 'Attendance!A2:E1000'
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows = response.data.values || []
  let foundRowIndex: number | null = null
  let row: string[] | undefined

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r[0] === dateStr && r[1] === slackUserId && r[3]) {
      // Found today's check-in
      foundRowIndex = i + 2 // Convert to 1-based, accounting for header
      row = r
      break
    }
  }

  if (!row || !foundRowIndex) {
    return { canCheckout: false }
  }

  // Check if already checked out
  if (row[4]) {
    return {
      canCheckout: true,
      alreadyCheckedOut: true,
      checkOutTime: row[4],
      checkInTime: row[3],
      date: dateStr,
    }
  }

  // Update checkout time
  row[4] = timeStr
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Attendance!A${foundRowIndex}:E${foundRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  // Calculate total hours
  const checkInTime = row[3]
  const checkInDate = new Date(`${dateStr}T${checkInTime}`)
  const checkOutDate = new Date(`${dateStr}T${timeStr}`)
  const totalMs = checkOutDate.getTime() - checkInDate.getTime()
  const totalHours = totalMs / (1000 * 60 * 60)

  return {
    canCheckout: true,
    alreadyCheckedOut: false,
    checkOutTime: timeStr,
    checkInTime: checkInTime,
    date: dateStr,
    totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimals
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
