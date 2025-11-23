import { google } from 'googleapis'

/**
 * Get an authenticated Google Sheets client using service account credentials
 */
function getSheetsClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set')
  }
  const serviceAccountKey = JSON.parse(serviceAccountJson)
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
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
  const spreadsheetId = process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID environment variable is not set')
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
  const spreadsheetId = process.env.SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID environment variable is not set')
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  return response.data.values || []
}

