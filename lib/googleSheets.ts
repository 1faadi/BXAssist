// lib/googleSheets.ts

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
 * Append a new leave row
 * Columns:
 * A Timestamp
 * B SlackUserId
 * C EmployeeName
 * D FromDate
 * E ToDate
 * F LeaveType
 * G Reason
 * H Status
 * I Manager1ApprovedBy
 * J Manager1ApprovedAt
 * K Manager2ApprovedBy
 * L Manager2ApprovedAt
 * M SlackMessageTs
 * N SlackChannelId
 */
export async function appendLeaveRequestRow(params: {
  timestamp: string
  slackUserId: string
  employeeName: string
  fromDate: string
  toDate: string
  leaveType: string
  reason: string
  status: string
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
          '', // I Manager1ApprovedBy
          '', // J Manager1ApprovedAt
          '', // K Manager2ApprovedBy
          '', // L Manager2ApprovedAt
          slackMessageTs, // M
          slackChannelId, // N
        ],
      ],
    },
  })
}

/**
 * Update approval status when a manager clicks their button
 */
export async function updateLeaveRequestApproval(args: {
  channelId: string
  messageTs: string
  approverName: string
  approverRole: 'manager1' | 'manager2'
}): Promise<{ status: string; manager1Approved: boolean; manager2Approved: boolean }> {
  const { channelId, messageTs, approverName, approverRole } = args

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'LeaveRequests!A2:N1000', // now A–N
  })

  const rows = res.data.values || []

  let foundRowIndex: number | null = null
  let row: string[] | undefined

  rows.forEach((r, idx) => {
    const ts = r[12] // SlackMessageTs (M)
    const ch = r[13] // SlackChannelId (N)
    if (ts === messageTs && ch === channelId) {
      foundRowIndex = idx + 2 // because data starts at row 2
      row = r
    }
  })

  if (!row || !foundRowIndex) {
    throw new Error('Leave request row not found in sheet')
  }

  // Ensure row has all 14 columns
  while (row.length < 14) row.push('')

  // indexes with new layout:
  let status = row[7] || 'Pending'
  let m1By = row[8] || ''
  let m1At = row[9] || ''
  let m2By = row[10] || ''
  let m2At = row[11] || ''

  const nowIso = new Date().toISOString()

  if (approverRole === 'manager1') {
    if (!m1By) {
      m1By = approverName
      m1At = nowIso
    }
  } else {
    if (!m2By) {
      m2By = approverName
      m2At = nowIso
    }
  }

  const manager1Approved = !!m1By
  const manager2Approved = !!m2By

  if (manager1Approved && manager2Approved) {
    status = 'Approved'
  } else if (manager1Approved && !manager2Approved) {
    status = 'Approved by Manager 1'
  } else if (!manager1Approved && manager2Approved) {
    status = 'Approved by Manager 2'
  } else {
    status = 'Pending'
  }

  row[7] = status
  row[8] = m1By
  row[9] = m1At
  row[10] = m2By
  row[11] = m2At

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `LeaveRequests!A${foundRowIndex}:N${foundRowIndex}`, // A–N
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  })

  return { status, manager1Approved, manager2Approved }
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
