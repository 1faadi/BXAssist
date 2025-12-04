/**
 * Daily Scheduler Cron Endpoint
 * 
 * Runs once per day (early morning UTC) to schedule Slack DMs for attendance reminders.
 * 
 * Flow:
 * 1. Reads reminder time from Settings tab (default: "09:10")
 * 2. Gets all members of attendance channel
 * 3. For each member, schedules a DM at the configured PK time
 * 4. Saves scheduled message IDs to AttendanceReminderQueue
 * 
 * When users check in, their scheduled reminder is cancelled.
 * 
 * Secured by CRON_SECRET query parameter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { getSetting } from '@/lib/googleSheets'
import {
  upsertReminderQueueRow,
  findReminderForUser,
} from '@/lib/googleSheets'
import { getPkDateStr, pkTimeToUtcEpochSeconds } from '@/lib/pkTime'
import { generateSignedAttendanceUrl } from '@/lib/attendanceSecurity'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || key !== cronSecret) {
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

    // 1. Get reminder time from Settings (default: "09:10")
    const reminderTime = (await getSetting('attendanceReminderTime')) || '09:10'
    console.log(`Reminder time: ${reminderTime} PKT`)

    // 2. Compute today's PK date and UTC epoch for scheduled time
    const datePk = getPkDateStr()
    const postAt = pkTimeToUtcEpochSeconds(datePk, reminderTime)
    console.log(`Scheduling reminders for ${datePk} at ${reminderTime} PKT (UTC epoch: ${postAt})`)

    // 3. Get all members of attendance channel (with pagination)
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

    // 4. For each member, schedule a DM
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const memberId of channelMembers) {
      try {
        // Optional: Skip bots (can be expensive to check all, so we'll schedule for all)
        // If you want to skip bots, uncomment:
        // const userInfo = await slackClient.users.info({ user: memberId })
        // if (userInfo.user?.is_bot || userInfo.user?.deleted) {
        //   skippedCount++
        //   continue
        // }

        // Check if reminder already scheduled for today
        const existing = await findReminderForUser({
          datePk,
          slackUserId: memberId,
        })

        if (existing && existing.status === 'scheduled') {
          console.log(`Reminder already scheduled for user ${memberId}`)
          skippedCount++
          continue
        }

        // Open IM channel
        const dmResponse = await slackClient.conversations.open({
          users: memberId,
        })

        if (!dmResponse.channel?.id) {
          console.warn(`Could not open DM with user ${memberId}`)
          errorCount++
          continue
        }

        const imChannelId = dmResponse.channel.id

        // Generate signed check-in URL
        const checkInUrl = generateSignedAttendanceUrl({
          type: 'checkin',
          slackUserId: memberId,
        })

        // Schedule message
        const scheduleResponse = await slackClient.chat.scheduleMessage({
          channel: imChannelId,
          post_at: postAt,
          text: '📣 Standup Reminder',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📣 Standup Reminder',
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Please post your daily standup using */standup* now.',
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Time: ${reminderTime} (PKT)`,
                },
              ],
            },
          ],
        })

        const scheduledMessageId = scheduleResponse.scheduled_message_id
        if (!scheduledMessageId) {
          console.warn(`No scheduled_message_id returned for user ${memberId}`)
          errorCount++
          continue
        }

        // Save to queue
        await upsertReminderQueueRow({
          datePk,
          slackUserId: memberId,
          imChannelId,
          scheduledMessageId,
          postAt,
          status: 'scheduled',
        })

        successCount++

        // Small delay to avoid rate limits
        if (channelMembers.indexOf(memberId) < channelMembers.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      } catch (error) {
        console.error(`Error scheduling reminder for user ${memberId}:`, error)
        errorCount++
      }
    }

    return NextResponse.json({
      success: true,
      date: datePk,
      reminderTime,
      postAt,
      totalMembers: channelMembers.length,
      scheduled: successCount,
      skipped: skippedCount,
      errors: errorCount,
    })
  } catch (err) {
    console.error('Error in schedule-checkin-reminders cron:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}

