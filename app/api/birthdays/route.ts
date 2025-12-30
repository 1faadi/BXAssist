import { NextRequest, NextResponse } from 'next/server'
import { getValues } from '@/lib/googleSheets'
import { postMessage } from '@/lib/slack'

/**
 * Weekly birthdays endpoint
 * 
 * This endpoint is called by an external cron job (e.g., GitHub Actions)
 * to check for birthdays in the current week and post them to Slack.
 * 
 * Query parameters:
 *   - token: Must match BIRTHDAY_CRON_TOKEN environment variable
 * 
 * Expected Google Sheet structure (Birthdays tab):
 *   Row 1 (header): User ID | User Name | Birthday (YYYY-MM-DD)
 *   Row 2+: Data rows
 */
// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Verify token
    const token = request.nextUrl.searchParams.get('token')
    const expectedToken = process.env.BIRTHDAY_CRON_TOKEN

    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all rows from Birthdays sheet
    const rows = await getValues('Birthdays!A:C')

    if (rows.length < 2) {
      // Only header row or empty
      await postMessage(
        '#general',
        '🎂 No birthdays this week.'
      )
      return NextResponse.json({ status: 'ok', message: 'No birthdays found' })
    }

    // Skip header row (row 0)
    const dataRows = rows.slice(1)

    // Calculate current week (Monday to Sunday)
    const now = new Date()
    const currentYear = now.getFullYear()
    
    // Get Monday of current week
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)
    
    // Get Sunday of current week
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    // Find birthdays in current week
    const birthdaysThisWeek: Array<{ userId: string; userName: string; date: string }> = []

    for (const row of dataRows) {
      if (row.length < 3) continue

      const userId = row[0]?.toString().trim() || ''
      const userName = row[1]?.toString().trim() || ''
      const birthdayStr = row[2]?.toString().trim() || ''

      if (!userId || !userName || !birthdayStr) continue

      try {
        // Parse birthday (assume format YYYY-MM-DD)
        const [year, month, day] = birthdayStr.split('-').map(Number)
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) continue

        // Create birthday date for current year
        const birthdayThisYear = new Date(currentYear, month - 1, day)
        
        // Check if birthday falls within current week
        if (birthdayThisYear >= monday && birthdayThisYear <= sunday) {
          const dateStr = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          birthdaysThisWeek.push({ userId, userName, date: dateStr })
        }
      } catch (error) {
        console.error(`Error parsing birthday for ${userName}:`, error)
        continue
      }
    }

    // Post message to Slack
    if (birthdaysThisWeek.length === 0) {
      await postMessage('#general', '🎂 No birthdays this week.')
    } else {
      let message = '🎉 *Birthdays this week*\n\n'
      
      birthdaysThisWeek.forEach(({ userId, userName, date }) => {
        message += `• <@${userId}> on ${date}\n`
      })

      await postMessage('#general', message)
    }

    return NextResponse.json({
      status: 'ok',
      birthdaysCount: birthdaysThisWeek.length,
    })
  } catch (error: any) {
    console.error('Error processing birthdays:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

