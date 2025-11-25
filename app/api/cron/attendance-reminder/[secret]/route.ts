/**
 * Daily Attendance Reminder Cron Endpoint
 * 
 * Sends DM reminders at configured time (default 9:10 AM PKT) to users who haven't checked in.
 * 
 * Scheduled via Vercel Cron: "*/5 * * * 1-5" (every 5 minutes on weekdays)
 * 
 * Flow:
 * 1. Verify cron secret from path
 * 2. Read settings from Google Sheets (time, enabled, lastSentDate)
 * 3. Check if reminders are enabled and if it's time to send
 * 4. Get today's date in PK time
 * 5. Read Attendance sheet for today's check-ins
 * 6. Get attendance channel members
 * 7. DM users who haven't checked in with check-in link
 * 8. Update lastSentDate in settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { getValues } from '@/lib/googleSheets'
import { generateSignedAttendanceUrl } from '@/lib/attendanceSecurity'
import { nowPk } from '@/lib/timePk'
import {
  getAttendanceReminderSettings,
  setAttendanceReminderLastSentDate,
} from '@/lib/settingsSheets'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * Check if current time matches the configured reminder time (within 5-minute window)
 */
function isTimeToSend(configuredTime: string, currentTime: string): boolean {
  const [configHour, configMin] = configuredTime.split(':').map(Number)
  const [currentHour, currentMin] = currentTime.split(':').map(Number)

  // Check if we're within the 5-minute window
  // e.g., if configured is 09:10, we send between 09:10 and 09:14
  if (currentHour !== configHour) {
    return false
  }

  return currentMin >= configMin && currentMin < configMin + 5
}

export async function GET(
  req: NextRequest,
  { params }: { params: { secret: string } }
) {
  try {
    // Verify cron secret from path
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || params.secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for force parameter (for testing)
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === '1'

    // Get settings from Google Sheets
    const settings = await getAttendanceReminderSettings()

    // Check if reminders are enabled
    if (!settings.enabled && !force) {
      return NextResponse.json({
        success: true,
        message: 'Reminders are disabled',
        skipped: true,
      })
    }

    // Get current PK time
    const { datePk, timePkHHmm } = nowPk()

    // Check if it's time to send (unless forced)
    if (!force) {
      if (!isTimeToSend(settings.timeHHmm, timePkHHmm)) {
        return NextResponse.json({
          success: true,
          message: `Not time yet. Configured: ${settings.timeHHmm}, Current: ${timePkHHmm}`,
          skipped: true,
          configuredTime: settings.timeHHmm,
          currentTime: timePkHHmm,
        })
      }

      // Check if already sent today (skip this check when force=1 for testing)
      if (settings.lastSentDate === datePk) {
        return NextResponse.json({
          success: true,
          message: 'Reminders already sent today',
          skipped: true,
          lastSentDate: settings.lastSentDate,
        })
      }
    }

    const attendanceChannelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID
    if (!attendanceChannelId) {
      console.error('SLACK_ATTENDANCE_CHANNEL_ID is not set')
      return NextResponse.json(
        { error: 'Attendance channel not configured' },
        { status: 500 }
      )
    }

    // Read Attendance sheet for today's check-ins
    const attendanceRows = await getValues('Attendance!A2:H10000')
    const checkedInUserIds = new Set<string>()

    for (const row of attendanceRows) {
      if (row[0] === datePk && row[3]) {
        // Row has today's date and check-in time (column D)
        checkedInUserIds.add(row[1]) // Column B: SlackUserId
      }
    }

    console.log(
      `Found ${checkedInUserIds.size} users who checked in today (${datePk})`
    )

    // Get attendance channel members
    const channelMembers: string[] = []
    let cursor: string | undefined

    do {
      const response = await slackClient.conversations.members({
        channel: attendanceChannelId,
        cursor,
      })

      if (response.members) {
        channelMembers.push(...response.members)
      }

      cursor = response.response_metadata?.next_cursor
    } while (cursor)

    console.log(`Found ${channelMembers.length} members in attendance channel`)

    // Filter out bots and users who already checked in
    const usersToRemind: string[] = []

    for (const memberId of channelMembers) {
      // Skip if already checked in
      if (checkedInUserIds.has(memberId)) {
        continue
      }

      // Check if user is a bot (optional, but good practice)
      try {
        const userInfo = await slackClient.users.info({ user: memberId })
        if (userInfo.user?.is_bot || userInfo.user?.deleted) {
          continue
        }
        usersToRemind.push(memberId)
      } catch (error) {
        // If we can't fetch user info, skip them
        console.warn(`Could not fetch info for user ${memberId}:`, error)
        continue
      }
    }

    console.log(`Sending reminders to ${usersToRemind.length} users`)

    // Send DMs to users who haven't checked in
    let successCount = 0
    let errorCount = 0

    for (const userId of usersToRemind) {
      try {
        // Open or get DM channel
        const dmResponse = await slackClient.conversations.open({
          users: userId,
        })

        if (!dmResponse.channel?.id) {
          console.warn(`Could not open DM with user ${userId}`)
          errorCount++
          continue
        }

        // Generate signed check-in URL
        const checkInUrl = generateSignedAttendanceUrl({
          type: 'checkin',
          slackUserId: userId,
        })

        // Send reminder DM
        await slackClient.chat.postMessage({
          channel: dmResponse.channel.id,
          text: '⏰ Reminder: Please check-in (Office network required)',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⏰ *Reminder: Please check-in*\n\nYou haven\'t checked in today. Click the button below to check-in (office network required).',
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Open check-in page',
                  },
                  url: checkInUrl,
                },
              ],
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Date: ${datePk} • Asia/Karachi time`,
                },
              ],
            },
          ],
        })

        successCount++

        // Rate limiting: wait 200ms between DMs
        if (usersToRemind.indexOf(userId) < usersToRemind.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      } catch (error) {
        console.error(`Error sending DM to user ${userId}:`, error)
        errorCount++
      }
    }

    // Update last sent date if we sent any reminders
    if (successCount > 0) {
      await setAttendanceReminderLastSentDate(datePk)
    }

    return NextResponse.json({
      success: true,
      date: datePk,
      time: timePkHHmm,
      configuredTime: settings.timeHHmm,
      checkedInCount: checkedInUserIds.size,
      channelMembersCount: channelMembers.length,
      remindersSent: successCount,
      errors: errorCount,
      forced: force,
    })
  } catch (err) {
    console.error('Error in attendance reminder cron:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

