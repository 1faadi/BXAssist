// app/api/slack/interactions/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import {
  appendLeaveRequestRow,
  updateLeaveRequestApproval,
} from '@/lib/googleSheets'

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

      // Based on your logged payload structure
      const leaveDate: string = state.leave_date.value.selected_date
      const leaveType: string = state.leave_type.value.selected_option.value
      const reason: string = state.reason.value.value
      const slackUserId: string = payload.user.id

      const userInfo = await slackClient.users.info({ user: slackUserId })
      const employeeName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        slackUserId

      // Post message with approve buttons
      const message = await slackClient.chat.postMessage({
        channel: LEAVE_CHANNEL_ID,
        text: `New leave request from ${employeeName}`, // fallback
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
          {
            type: 'actions',
            block_id: 'leave_approvals',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Approve (Manager 1)',
                },
                action_id: 'approve_manager_1',
                style: 'primary',
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Approve (Manager 2)',
                },
                action_id: 'approve_manager_2',
                style: 'primary',
              },
            ],
          },
        ],
      })

      const ts = message.ts as string
      const channelId = message.channel as string
      const nowIso = new Date().toISOString()

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

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 2) Handle button clicks (approvals)
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0]
      if (!action) return new NextResponse('', { status: 200 })

      // Only handle our approve buttons
      if (
        action.action_id !== 'approve_manager_1' &&
        action.action_id !== 'approve_manager_2'
      ) {
        return new NextResponse('', { status: 200 })
      }

      const approverRole =
        action.action_id === 'approve_manager_1' ? 'manager1' : 'manager2'

      const channelId: string =
        payload.container?.channel_id || payload.channel?.id
      const messageTs: string =
        payload.container?.message_ts || payload.message?.ts

      if (!channelId || !messageTs) {
        return new NextResponse('Missing channel/ts', { status: 400 })
      }

      const approverId: string = payload.user.id
      const approverInfo = await slackClient.users.info({ user: approverId })
      const approverName =
        (approverInfo.user?.profile as any)?.real_name ||
        (approverInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        approverId

      const { status, manager1Approved, manager2Approved } =
        await updateLeaveRequestApproval({
          channelId,
          messageTs,
          approverName,
          approverRole,
        })

      // Update message blocks: status text + remove buttons as needed
      const blocks = payload.message.blocks as any[]
      const updatedBlocks = blocks
        .map((block: any) => {
          if (block.type === 'context') {
            // Replace status line
            return {
              ...block,
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Status:* ${status}`,
                },
              ],
            }
          }

          if (block.type === 'actions' && block.block_id === 'leave_approvals') {
            // If fully approved, remove action block entirely
            if (manager1Approved && manager2Approved) {
              return null
            }

            // Otherwise remove only the clicked button
            const filteredElements = block.elements.filter(
              (el: any) => el.action_id !== action.action_id
            )

            return {
              ...block,
              elements: filteredElements,
            }
          }

          return block
        })
        .filter(Boolean) // remove null blocks

      await slackClient.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `Leave request status: ${status}`,
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
