/**
 * Admin API: Test Reminder
 * 
 * Sends an immediate test reminder DM to a specified user.
 * 
 * Query params:
 * - key: ADMIN_KEY (required)
 * - user: Slack user ID (required)
 * 
 * This is useful for testing the reminder message without waiting for the scheduled time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { generateSignedAttendanceUrl } from '@/lib/attendanceSecurity'
import { getPkDateStr } from '@/lib/pkTime'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    const userId = url.searchParams.get('user')

    const adminKey = process.env.ADMIN_KEY
    if (!adminKey || key !== adminKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'user parameter is required' },
        { status: 400 }
      )
    }

    // Open IM channel
    const dmResponse = await slackClient.conversations.open({
      users: userId,
    })

    if (!dmResponse.channel?.id) {
      return NextResponse.json(
        { error: 'Could not open DM with user' },
        { status: 500 }
      )
    }

    const imChannelId = dmResponse.channel.id
    const datePk = getPkDateStr()

    // Generate signed check-in URL
    const checkInUrl = generateSignedAttendanceUrl({
      type: 'checkin',
      slackUserId: userId,
    })

    // Send immediate test message
    await slackClient.chat.postMessage({
      channel: imChannelId,
      text: '⏰ Test Reminder: Please check-in (Office network required)',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⏰ *Test Reminder: Please check-in*\n\nThis is a test reminder. Click the button below to check-in (office network required).',
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
              text: `Date: ${datePk} • Asia/Karachi time • TEST MESSAGE`,
            },
          ],
        },
      ],
    })

    return NextResponse.json({
      success: true,
      message: 'Test reminder sent',
      userId,
      datePk,
    })
  } catch (err) {
    console.error('Error in /api/admin/reminder-test:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}

