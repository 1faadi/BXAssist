/**
 * Daily Report Reminder Cron Endpoint
 * 
 * Runs daily at 5:50 PM Asia/Karachi (12:50 UTC) to remind users to submit daily reports.
 * 
 * Flow:
 * 1. Validates Authorization header or secret query param
 * 2. Gets today's date in Asia/Karachi (YYYY-MM-DD)
 * 3. Checks CronLogs tab to see if reminder already sent today
 * 4. If not sent, posts reminder message to Slack channel
 * 5. Logs the send to CronLogs tab
 * 
 * Secured by CRON_SECRET (Bearer header or ?secret= query param).
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { cronWasSentToday, logCronSend } from '@/lib/googleSheets'
import { getPkDateStr } from '@/lib/pkTime'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret - check Bearer header first, then query param
    const authHeader = req.headers.get('authorization')
    const url = new URL(req.url)
    const secretParam = url.searchParams.get('secret')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('CRON_SECRET is not set')
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      )
    }

    // Check Bearer token first
    let isValid = false
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      isValid = token === cronSecret
    } else if (secretParam) {
      // Fallback to query param
      isValid = secretParam === cronSecret
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dailyReportChannelId = process.env.SLACK_DAILY_REPORT_CHANNEL_ID
    if (!dailyReportChannelId) {
      console.error('SLACK_DAILY_REPORT_CHANNEL_ID is not set')
      return NextResponse.json(
        { error: 'Daily report channel not configured' },
        { status: 500 }
      )
    }

    // Get today's date in Asia/Karachi (YYYY-MM-DD)
    const datePkt = getPkDateStr()
    const jobName = 'daily-report-reminder'

    // Check if reminder already sent today
    const alreadySent = await cronWasSentToday(jobName, datePkt)
    if (alreadySent) {
      console.log(`Daily report reminder already sent for ${datePkt}`)
      return NextResponse.json({
        ok: true,
        skipped: true,
        date: datePkt,
      })
    }

    // Post reminder message to Slack
    const sentAtIso = new Date().toISOString()
    const messageResponse = await slackClient.chat.postMessage({
      channel: dailyReportChannelId,
      text: '⏰ Daily Report Reminder', // fallback text
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⏰ Daily Report Reminder',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Please submit your daily progress using */daily-report* before leaving.',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Time: 5:50 PM (PKT)`,
            },
          ],
        },
      ],
    })

    if (!messageResponse.ok || !messageResponse.ts) {
      console.error('Failed to post reminder message:', messageResponse.error)
      return NextResponse.json(
        { error: 'Failed to post reminder message', details: messageResponse.error },
        { status: 500 }
      )
    }

    // Log to CronLogs tab
    await logCronSend({
      jobName,
      datePkt,
      sentAtIso,
      slackMessageTs: messageResponse.ts,
    })

    console.log(`Daily report reminder sent for ${datePkt}`)

    return NextResponse.json({
      ok: true,
      sent: true,
      date: datePkt,
      slackMessageTs: messageResponse.ts,
    })
  } catch (err) {
    console.error('Error in daily-report-reminder cron:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}

