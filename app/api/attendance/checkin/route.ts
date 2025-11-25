/**
 * Check-in Attendance Endpoint
 * 
 * Endpoint for attendance check-in actions opened from Slack.
 * Requires signed URL + office IP verification.
 * 
 * Flow:
 * 1. User clicks check-in button in Slack (ephemeral message)
 * 2. Browser opens this URL with signed parameters
 * 3. Server validates signature and checks client IP against office allowlist
 * 4. If valid, records check-in in Google Sheets and posts to Slack channel
 * 5. Returns HTML response showing success/error
 */

import { NextRequest, NextResponse } from 'next/server'
import { recordCheckIn } from '@/lib/googleSheets'
import {
  getClientIp,
  isIpAllowed,
  verifySignedAttendanceRequest,
} from '@/lib/attendanceSecurity'
import { slackClient } from '@/lib/slackClient'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const slackUserId = url.searchParams.get('u') || ''
    const ts = url.searchParams.get('ts') || ''
    const sig = url.searchParams.get('sig') || ''

    // Validate signature
    if (
      !slackUserId ||
      !ts ||
      !sig ||
      !verifySignedAttendanceRequest({ type: 'checkin', slackUserId, ts, sig })
    ) {
      return html('Invalid or expired check-in link.')
    }

    // Check IP allowlist
    const clientIp = getClientIp(req)
    if (!isIpAllowed(clientIp)) {
      return html(
        `❌ You are not on the office network. Your IP: ${clientIp || 'unknown'}`
      )
    }

    // Lookup name from Slack
    const userInfo = await slackClient.users.info({ user: slackUserId })
    const employeeName =
      (userInfo.user?.profile as any)?.real_name ||
      (userInfo.user?.profile as any)?.display_name ||
      slackUserId

    // Record check-in
    const result = await recordCheckIn({ slackUserId, employeeName })

    if (result.alreadyCheckedIn) {
      return html(
        `You already checked in today at ${result.checkInTime}.`
      )
    }

    const { timePk, timePkHHmm } = await import('@/lib/timePk').then((m) => m.nowPk())

    // Post to attendance channel
    const attendanceChannelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID
    if (attendanceChannelId) {
      await slackClient.chat.postMessage({
        channel: attendanceChannelId,
        text: `🟢 Check-in: ${employeeName} at ${timePkHHmm}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🟢 Check-in Recorded',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Employee:*\n<@${slackUserId}> (${employeeName})`,
              },
              {
                type: 'mrkdwn',
                text: `*Date:*\n${result.date}`,
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${timePk}`,
              },
              {
                type: 'mrkdwn',
                text: `*Network:*\nOffice ✅`,
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Recorded by BXAssist • Asia/Karachi time',
              },
            ],
          },
        ],
      })
    }

    return html(`✅ Check-in recorded for ${employeeName} at ${timePkHHmm}.`)
  } catch (err) {
    console.error('Error in check-in endpoint:', err)
    return html('❌ An error occurred while recording check-in. Please try again.')
  }
}

function html(body: string): NextResponse {
  const content = `<!doctype html><html><head><meta charset="utf-8"><title>Check-in</title></head><body style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto;">${body}</body></html>`
  return new NextResponse(content, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

