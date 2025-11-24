import { google } from 'googleapis'
import { env } from './env'

/**
 * Get an authenticated Google Sheets client using service account credentials
 * 
 * Uses either:
 * - GOOGLE_SERVICE_ACCOUNT_JSON (legacy, full JSON string)
 * - GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY (new format)
 */
function getSheetsClient() {
  let credentials: any

  // Try new format first
  if (env.googleSheets.clientEmail && env.googleSheets.privateKey) {
    // Handle escaped newlines in private key
    const privateKey = env.googleSheets.privateKey.replace(/\\n/g, '\n')
    credentials = {
      client_email: env.googleSheets.clientEmail,
      private_key: privateKey,
    }
  } else {
    // Fall back to legacy format
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (!serviceAccountJson) {
      throw new Error(
        'Either GOOGLE_SHEETS_CLIENT_EMAIL+GOOGLE_SHEETS_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_JSON must be set'
      )
    }
    credentials = JSON.parse(serviceAccountJson)
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return google.sheets({ version: 'v4', auth })
}

/**
 * Append a row to a specified range in the Google Sheet
 * @param range - The A1 notation range (e.g., 'Attendance!A:E')
 * @param values - Array of values to append
 */
export async function appendRow(range: string, values: any[]): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId =
    env.googleSheets.spreadsheetId || process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  })
}

/**
 * Get values from a specified range in the Google Sheet
 * @param range - The A1 notation range (e.g., 'Birthdays!A:C')
 * @returns Array of rows, where each row is an array of values
 */
export async function getValues(range: string): Promise<any[][]> {
  const sheets = getSheetsClient()
  const spreadsheetId =
    env.googleSheets.spreadsheetId || process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  return response.data.values || []
}

/**
 * Leave Request Types
 */
export type LeaveRequestRow = {
  timestamp: string
  slackUserId: string
  employeeName: string
  leaveDate: string
  leaveType: string
  reason: string
  status: string
  manager1ApprovedBy?: string
  manager1ApprovedAt?: string
  manager2ApprovedBy?: string
  manager2ApprovedAt?: string
  slackMessageTs?: string
  slackChannelId?: string
}

/**
 * Append a new leave request row to Google Sheets
 * Creates header row if it doesn't exist
 */
export async function appendLeaveRequestRow(
  data: LeaveRequestRow
): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId =
    env.googleSheets.spreadsheetId || process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  const sheetName = 'LeaveRequests'
  const range = `${sheetName}!A:M`

  // Check if header exists
  let headerExists = false
  try {
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:M1`,
    })
    headerExists = (headerResponse.data.values?.length || 0) > 0
  } catch (error) {
    // Sheet might not exist, we'll create it
  }

  // Create header if needed
  if (!headerExists) {
    const headers = [
      'Timestamp',
      'SlackUserId',
      'EmployeeName',
      'LeaveDate',
      'LeaveType',
      'Reason',
      'Status',
      'Manager1ApprovedBy',
      'Manager1ApprovedAt',
      'Manager2ApprovedBy',
      'Manager2ApprovedAt',
      'SlackMessageTs',
      'SlackChannelId',
    ]

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:M1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers],
        },
      })
    } catch (error: any) {
      // If sheet doesn't exist, create it
      if (error.message?.includes('Unable to parse range')) {
        // Try to create the sheet by appending (which creates it)
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [headers],
          },
        })
      } else {
        throw error
      }
    }
  }

  // Append the row
  const row = [
    data.timestamp,
    data.slackUserId,
    data.employeeName,
    data.leaveDate,
    data.leaveType,
    data.reason,
    data.status,
    data.manager1ApprovedBy || '',
    data.manager1ApprovedAt || '',
    data.manager2ApprovedBy || '',
    data.manager2ApprovedAt || '',
    data.slackMessageTs || '',
    data.slackChannelId || '',
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  })
}

/**
 * Find a leave request row by Slack channel ID and message timestamp
 */
export async function findLeaveRequestByMessage(
  channelId: string,
  messageTs: string
): Promise<LeaveRequestRow | null> {
  const sheets = getSheetsClient()
  const spreadsheetId =
    env.googleSheets.spreadsheetId || process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  const sheetName = 'LeaveRequests'
  const range = `${sheetName}!A:M`

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const rows = response.data.values || []
  if (rows.length < 2) {
    return null // No data rows
  }

  // Find row matching channelId and messageTs
  // Column L = SlackMessageTs (index 11), Column M = SlackChannelId (index 12)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (
      row[11] === messageTs &&
      row[12] === channelId
    ) {
      return {
        timestamp: row[0] || '',
        slackUserId: row[1] || '',
        employeeName: row[2] || '',
        leaveDate: row[3] || '',
        leaveType: row[4] || '',
        reason: row[5] || '',
        status: row[6] || '',
        manager1ApprovedBy: row[7] || undefined,
        manager1ApprovedAt: row[8] || undefined,
        manager2ApprovedBy: row[9] || undefined,
        manager2ApprovedAt: row[10] || undefined,
        slackMessageTs: row[11] || undefined,
        slackChannelId: row[12] || undefined,
      }
    }
  }

  return null
}

/**
 * Update leave request approval in Google Sheets
 */
export async function updateLeaveRequestApproval(data: {
  channelId: string
  messageTs: string
  approverRole: 'manager1' | 'manager2'
  approverUserName: string
  approverUserId: string
}): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId =
    env.googleSheets.spreadsheetId || process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  const sheetName = 'LeaveRequests'
  const range = `${sheetName}!A:M`

  // Get all rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const rows = response.data.values || []
  if (rows.length < 2) {
    throw new Error('No leave requests found')
  }

  // Find the row index (1-based, including header)
  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row[11] === data.messageTs && row[12] === data.channelId) {
      rowIndex = i + 1 // Convert to 1-based index
      break
    }
  }

  if (rowIndex === -1) {
    throw new Error('Leave request not found')
  }

  // Get current row data
  const currentRow = rows[rowIndex - 1]
  const approvalTimestamp = new Date().toISOString()

  // Update based on manager role
  if (data.approverRole === 'manager1') {
    currentRow[7] = data.approverUserName // Manager1ApprovedBy
    currentRow[8] = approvalTimestamp // Manager1ApprovedAt
    currentRow[6] = 'Approved by Manager 1' // Status
  } else {
    currentRow[9] = data.approverUserName // Manager2ApprovedBy
    currentRow[10] = approvalTimestamp // Manager2ApprovedAt
    currentRow[6] = 'Approved by Manager 2' // Status
  }

  // Check if both managers approved
  if (currentRow[7] && currentRow[9]) {
    currentRow[6] = 'Approved' // Both approved
  }

  // Update the row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:M${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [currentRow],
    },
  })
}

