/**
 * Slack Interactivity Handler for Leave Requests
 * 
 * This endpoint handles Slack interactivity payloads:
 * - Modal submissions (leave request form)
 * - Button clicks (Approve/Reject decisions)
 * 
 * Current leave decision model: Single manager, approve/reject, synced with Google Sheets.
 * 
 * Flow:
 * 1. User submits /leave-req modal → message posted with Approve/Reject buttons
 * 2. Manager clicks Approve or Reject → updates Google Sheets and Slack message
 * 3. Buttons are removed after decision is made
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { appendLeaveRequestRow, setLeaveDecision } from '@/lib/googleSheets'

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

    // 1) Handle modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'leave_request_modal'
    ) {
      const state = payload.view.state.values

      // Extract form values
      const fromDate: string = state.leave_from_date.value.selected_date
      const toDate: string = state.leave_to_date.value.selected_date
      const leaveType: string = state.leave_type.value.selected_option.value
      const reason: string = state.reason.value.value
      const slackUserId: string = payload.user.id

      // Get employee's display name
      const userInfo = await slackClient.users.info({ user: slackUserId })
      const employeeName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        slackUserId

      // Post message with Approve/Reject buttons
      const message = await slackClient.chat.postMessage({
        channel: LEAVE_CHANNEL_ID,
        text: `New leave request from ${employeeName}`, // fallback
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*New leave request*\n*Employee:* <@${slackUserId}> (${employeeName})\n*Dates:* ${fromDate} → ${toDate}\n*Type:* ${leaveType}\n*Reason:* ${reason}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '*Status:* Pending',
              },
            ],
          },
          {
            type: 'actions',
            block_id: 'leave_decision',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Approve',
                },
                style: 'primary',
                action_id: 'leave_approve',
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Reject',
                },
                style: 'danger',
                action_id: 'leave_reject',
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
        fromDate,
        toDate,
        leaveType,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 2) Handle button clicks (Approve/Reject)
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0]
      if (!action) return new NextResponse('', { status: 200 })

      // Only handle our decision buttons
      if (
        action.action_id !== 'leave_approve' &&
        action.action_id !== 'leave_reject'
      ) {
        return new NextResponse('', { status: 200 })
      }

      // Determine decision
      const decision: 'Approved' | 'Rejected' =
        action.action_id === 'leave_approve' ? 'Approved' : 'Rejected'

      const channelId: string =
        payload.container?.channel_id || payload.channel?.id
      const messageTs: string =
        payload.container?.message_ts || payload.message?.ts

      if (!channelId || !messageTs) {
        return new NextResponse('Missing channel/ts', { status: 400 })
      }

      // Get manager (approver) info
      const approverId: string = payload.user.id
      const approverInfo = await slackClient.users.info({ user: approverId })
      const approverName =
        (approverInfo.user?.profile as any)?.real_name ||
        (approverInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        approverId

      // Update Google Sheets
      const { status, decidedBy, decidedAt } = await setLeaveDecision({
        channelId,
        messageTs,
        decision,
        decidedBy: approverName,
      })

      // Build updated blocks for Slack message
      const blocks = payload.message.blocks as any[]
      const updatedBlocks = blocks
        .map((block: any) => {
          if (block.type === 'context') {
            // Update status line with decision info
            return {
              ...block,
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Status:* ${status} by ${decidedBy} at ${new Date(decidedAt).toLocaleString()}`,
                },
              ],
            }
          }

          if (block.type === 'actions' && block.block_id === 'leave_decision') {
            // Remove the actions block entirely after decision
            return null
          }

          return block
        })
        .filter(Boolean) // remove null blocks

      // Update Slack message
      await slackClient.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `Leave request ${status.toLowerCase()} by ${decidedBy}`, // fallback
        blocks: updatedBlocks as any,
      })

      return new NextResponse('', { status: 200 })
    }

    // Default ack
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error in /api/slack/interactions', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
