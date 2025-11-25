/**
 * Settings Google Sheets Integration
 * 
 * Manages application settings stored in a Google Sheets "Settings" tab.
 * 
 * Settings tab structure:
 * A1: attendance_reminder_time | B1: 09:10
 * A2: attendance_reminder_enabled | B2: true
 * A3: attendance_reminder_last_sent_date | B3: YYYY-MM-DD (or empty)
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
 * Get attendance reminder settings from Settings tab
 * Returns defaults if tab/cells are missing
 */
export async function getAttendanceReminderSettings(): Promise<{
  timeHHmm: string // "09:10"
  enabled: boolean // true/false
  lastSentDate: string // "YYYY-MM-DD" or ""
}> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A1:B3',
    })

    const rows = response.data.values || []
    
    // Default values
    let timeHHmm = '09:10'
    let enabled = true
    let lastSentDate = ''

    // Parse rows
    for (const row of rows) {
      const key = row[0]?.toString().trim().toLowerCase()
      const value = row[1]?.toString().trim()

      if (key === 'attendance_reminder_time' && value) {
        timeHHmm = value
      } else if (key === 'attendance_reminder_enabled' && value) {
        enabled = value.toLowerCase() === 'true'
      } else if (key === 'attendance_reminder_last_sent_date' && value) {
        lastSentDate = value
      }
    }

    return { timeHHmm, enabled, lastSentDate }
  } catch (error: any) {
    // If Settings tab doesn't exist, return defaults
    if (error?.code === 400 || error?.message?.includes('Unable to parse range')) {
      console.warn('Settings tab not found, using defaults')
      return { timeHHmm: '09:10', enabled: true, lastSentDate: '' }
    }
    throw error
  }
}

/**
 * Set attendance reminder settings in Settings tab
 * Creates/updates the Settings tab if needed
 */
export async function setAttendanceReminderSettings(args: {
  timeHHmm: string
  enabled: boolean
}): Promise<void> {
  const { timeHHmm, enabled } = args

  // Ensure Settings tab exists and has headers
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A1:B1',
    })
  } catch (error: any) {
    // Tab might not exist, try to create it by writing headers
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Settings!A1:B3',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['attendance_reminder_time', timeHHmm],
            ['attendance_reminder_enabled', enabled.toString()],
            ['attendance_reminder_last_sent_date', ''],
          ],
        },
      })
      return
    } catch (createError) {
      console.error('Could not create Settings tab:', createError)
      throw createError
    }
  }

  // Update existing values
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Settings!B1:B2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[timeHHmm], [enabled.toString()]],
    },
  })
}

/**
 * Update the last sent date for attendance reminders
 */
export async function setAttendanceReminderLastSentDate(datePk: string): Promise<void> {
  try {
    // Ensure Settings tab exists
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A3:B3',
    })

    // Update last sent date
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!B3',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[datePk]],
      },
    })
  } catch (error: any) {
    // If Settings tab doesn't exist, create it
    if (error?.code === 400 || error?.message?.includes('Unable to parse range')) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Settings!A1:B3',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['attendance_reminder_time', '09:10'],
            ['attendance_reminder_enabled', 'true'],
            ['attendance_reminder_last_sent_date', datePk],
          ],
        },
      })
    } else {
      throw error
    }
  }
}

