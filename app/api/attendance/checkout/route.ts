/**
 * Checkout Attendance Endpoint
 * 
 * Endpoint for attendance checkout actions opened from Slack.
 * Requires signed URL + office IP verification.
 * 
 * Flow:
 * 1. User clicks checkout button in Slack (ephemeral message)
 * 2. Browser opens this URL with signed parameters
 * 3. Server validates signature and checks client IP against office allowlist
 * 4. If valid, records checkout in Google Sheets and posts to Slack channel
 * 5. Returns HTML response showing success/error with total hours
 */

import { NextRequest, NextResponse } from 'next/server'
import { recordCheckOut } from '@/lib/googleSheets'
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
      !verifySignedAttendanceRequest({ type: 'checkout', slackUserId, ts, sig })
    ) {
      return html('Invalid or expired checkout link.')
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

    // Record checkout
    const result = await recordCheckOut({ slackUserId, employeeName })

    if (!result.canCheckout) {
      return html('❌ No check-in found for today. Please check in first.')
    }

    if (result.alreadyCheckedOut) {
      return html(
        `You already checked out today at ${result.checkOutTime}. Check-in was at ${result.checkInTime}.`
      )
    }

    const { timePkHHmm } = await import('@/lib/timePk').then((m) => m.nowPk())

    // Post to attendance channel
    const attendanceChannelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID
    if (attendanceChannelId && result.totalHours) {
      await slackClient.chat.postMessage({
        channel: attendanceChannelId,
        text: `🔴 Check-out: <@${slackUserId}> at ${timePkHHmm}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔴 Check-out Recorded',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Employee:*\n<@${slackUserId}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Date:*\n${result.date}`,
              },
              {
                type: 'mrkdwn',
                text: `*Check-in:*\n${result.checkInTime}`,
              },
              {
                type: 'mrkdwn',
                text: `*Check-out:*\n${result.checkOutTime}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏱ *Total:* ${result.totalHours}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Have a great day 👋',
              },
            ],
          },
        ],
      })
    }

    // Build success message
    const successMsg = `✅ Check-out recorded for ${employeeName} at ${timePkHHmm}.<br><br>
      <strong>Summary:</strong><br>
      Date: ${result.date}<br>
      Check-in: ${result.checkInTime}<br>
      Check-out: ${result.checkOutTime}<br>
      Total Hours: ${result.totalHours}`

    return html(successMsg)
  } catch (err) {
    console.error('Error in checkout endpoint:', err)
    return html('❌ An error occurred while recording checkout. Please try again.')
  }
}

function html(body: string): NextResponse {
  const content = `<!doctype html><html><head><meta charset="utf-8"><title>Check-out</title></head><body style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto;">${body}</body></html>`
  return new NextResponse(content, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

