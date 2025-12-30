/**
 * Daily Attendance Reminder Cron Endpoint
 * 
 * Sends DM reminders at 9:10 AM PKT (04:10 UTC) to users who haven't checked in.
 * 
 * Scheduled via Vercel Cron: "10 4 * * 1-5" (weekdays at 04:10 UTC)
 * 
 * Flow:
 * 1. Verify cron secret from path
 * 2. Get today's date in PK time
 * 3. Read Attendance sheet for today's check-ins
 * 4. Get attendance channel members
 * 5. DM users who haven't checked in with check-in link
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { getValues } from '@/lib/googleSheets'
import { generateSignedAttendanceUrl } from '@/lib/attendanceSecurity'
import { nowPk } from '@/lib/timePk'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

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

    const attendanceChannelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID
    if (!attendanceChannelId) {
      console.error('SLACK_ATTENDANCE_CHANNEL_ID is not set')
      return NextResponse.json(
        { error: 'Attendance channel not configured' },
        { status: 500 }
      )
    }

    // Get today's date in PK time
    const { datePk } = nowPk()

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

    return NextResponse.json({
      success: true,
      date: datePk,
      checkedInCount: checkedInUserIds.size,
      channelMembersCount: channelMembers.length,
      remindersSent: successCount,
      errors: errorCount,
    })
  } catch (err) {
    console.error('Error in attendance reminder cron:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

