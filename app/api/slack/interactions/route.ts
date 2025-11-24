// app/api/slack/interactions/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { appendLeaveRequestRow } from '@/lib/googleSheets'

const LEAVE_CHANNEL_ID = process.env.SLACK_LEAVE_CHANNEL_ID

if (!LEAVE_CHANNEL_ID) {
  throw new Error('SLACK_LEAVE_CHANNEL_ID is not set')
}

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)
    const payloadStr = params.get('payload')

    if (!payloadStr) {
      return new NextResponse('Missing payload', { status: 400 })
    }

    const payload = JSON.parse(payloadStr)

    console.log('Slack interaction payload:', payload.type, payload.view?.callback_id)

    // Handle modal submission
    if (payload.type === 'view_submission' && payload.view?.callback_id === 'leave_request_modal') {
      const state = payload.view.state.values

      // From your logged payload
      const leaveDate: string =
        state.leave_date?.value?.selected_date ||
        state.leave_date?.value?.selected_date // defensive

      const leaveType: string =
        state.leave_type?.value?.selected_option?.value ||
        state.leave_type?.value?.selected_option?.value

      const reason: string =
        state.reason?.value?.value ||
        state.reason?.value?.value

      const slackUserId: string = payload.user.id

      // Get nice display name
      const userInfo = await slackClient.users.info({ user: slackUserId })
      const employeeName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        slackUserId

      // Post message to leave channel
      const message = await slackClient.chat.postMessage({
        channel: LEAVE_CHANNEL_ID,
        text: `Leave request from ${employeeName}`, // fallback
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*New leave request*\n*Employee:* <@${slackUserId}> (${employeeName})\n*Date:* ${leaveDate}\n*Type:* ${leaveType}\n*Reason:* ${reason}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '*Status:* Pending approval',
              },
            ],
          },
        ],
      })

      const ts = message.ts as string
      const channelId = message.channel as string
      const nowIso = new Date().toISOString()

      // Save to Google Sheets
      await appendLeaveRequestRow({
        timestamp: nowIso,
        slackUserId,
        employeeName,
        leaveDate,
        leaveType,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Tell Slack to close/clear the modal
      return NextResponse.json({
        response_action: 'clear',
      })
    }

    // For now, just ack other interaction types
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error in /api/slack/interactions', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
