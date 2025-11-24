import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack/verifyRequest'
import { slackClient } from '@/lib/slack/client'
import { env } from '@/lib/env'
import {
  appendLeaveRequestRow,
  updateLeaveRequestApproval,
  findLeaveRequestByMessage,
} from '@/lib/googleSheets'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Slack Interactivity Handler
 * 
 * This endpoint handles Slack interactivity payloads:
 * - Modal submissions
 * - Button clicks (approvals)
 * 
 * Slack Configuration:
 * - Interactivity URL: https://your-domain.vercel.app/api/slack/interactions
 * - Method: POST
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('x-slack-signature') || ''
    const timestamp = req.headers.get('x-slack-request-timestamp') || ''

    // Parse the form-encoded body
    const params = new URLSearchParams(rawBody)
    const payloadStr = params.get('payload')

    if (!payloadStr) {
      return NextResponse.json(
        { error: 'Missing payload' },
        { status: 400 }
      )
    }

    // Verify Slack signature
    if (!verifySlackSignature(rawBody, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(payloadStr)

    // Handle modal submission
    if (payload.type === 'view_submission') {
      return await handleModalSubmission(payload)
    }

    // Handle button clicks (approvals)
    if (payload.type === 'block_actions') {
      return await handleButtonClick(payload)
    }

    return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 })
  } catch (error: any) {
    console.error('Error in interactivity handler:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Handle modal submission for leave request
 */
async function handleModalSubmission(payload: any): Promise<NextResponse> {
  try {
    if (payload.view.callback_id !== 'leave_request_modal') {
      return NextResponse.json({ response_action: 'clear' })
    }

    const values = payload.view.state.values
    const userId = payload.user.id
    const userName = payload.user.name

    // Extract form values
    const leaveDate = values.leave_date?.value?.selected_date || ''
    const leaveType = values.leave_type?.value?.selected_option?.value || ''
    const reason = values.reason?.value?.value || ''

    // Validate required fields
    if (!leaveDate || !leaveType || !reason) {
      return NextResponse.json({
        response_action: 'errors',
        errors: {
          leave_date: !leaveDate ? 'Leave date is required' : undefined,
          leave_type: !leaveType ? 'Leave type is required' : undefined,
          reason: !reason ? 'Reason is required' : undefined,
        },
      })
    }

    // Get user's real name from Slack
    let employeeName = userName
    try {
      const userInfo = await slackClient.users.info({ user: userId })
      employeeName =
        userInfo.user?.real_name || userInfo.user?.profile?.display_name || userName
    } catch (error) {
      console.warn('Could not fetch user info, using username:', error)
    }

    // Post message to leave channel
    const messageBlocks = [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*Leave Request*\n*Employee:* <@${userId}> (${employeeName})\n*Date:* ${leaveDate}\n*Type:* ${leaveType}\n*Reason:* ${reason}`,
        },
      },
      {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text: `Status: *Pending approval* | Requested: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty}|${new Date().toLocaleDateString()}>`,
          },
        ],
      },
      {
        type: 'actions' as const,
        block_id: 'approval_actions',
        elements: [
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: 'Approve (Manager 1)',
            },
            style: 'primary' as const,
            action_id: 'approve_manager_1',
            value: JSON.stringify({ userId, leaveDate, leaveType }),
          },
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: 'Approve (Manager 2)',
            },
            style: 'primary' as const,
            action_id: 'approve_manager_2',
            value: JSON.stringify({ userId, leaveDate, leaveType }),
          },
        ],
      },
    ]

    const postResult = await slackClient.chat.postMessage({
      channel: env.slack.leaveChannelId,
      text: `Leave Request from ${employeeName}`,
      blocks: messageBlocks,
    })

    if (!postResult.ok || !postResult.ts || !postResult.channel) {
      throw new Error('Failed to post message to Slack')
    }

    // Save to Google Sheets
    const timestamp = new Date().toISOString()
    await appendLeaveRequestRow({
      timestamp,
      slackUserId: userId,
      employeeName,
      leaveDate,
      leaveType,
      reason,
      status: 'Pending',
      slackMessageTs: postResult.ts,
      slackChannelId: postResult.channel,
    })

    console.log(
      `✅ Leave request created: ${employeeName} - ${leaveDate} - ${leaveType}`
    )

    // Close modal
    return NextResponse.json({ response_action: 'clear' })
  } catch (error: any) {
    console.error('Error handling modal submission:', error)
    return NextResponse.json({
      response_action: 'errors',
      errors: {
        reason: 'An error occurred. Please try again.',
      },
    })
  }
}

/**
 * Handle button click for approvals
 */
async function handleButtonClick(payload: any): Promise<NextResponse> {
  try {
    const action = payload.actions?.[0]
    if (!action) {
      return new NextResponse('', { status: 200 })
    }

    const actionId = action.action_id
    const approverUserId = payload.user.id
    const approverUserName = payload.user.name

    // Get approver's real name
    let approverName = approverUserName
    try {
      const userInfo = await slackClient.users.info({ user: approverUserId })
      approverName =
        userInfo.user?.real_name ||
        userInfo.user?.profile?.display_name ||
        approverUserName
    } catch (error) {
      console.warn('Could not fetch approver info:', error)
    }

    const channelId = payload.channel?.id || payload.container.channel_id
    const messageTs = payload.message?.ts || payload.container.message_ts

    if (!channelId || !messageTs) {
      console.error('Missing channel or message timestamp')
      return new NextResponse('', { status: 200 })
    }

    // Determine which manager approved
    const isManager1 = actionId === 'approve_manager_1'
    const isManager2 = actionId === 'approve_manager_2'

    if (!isManager1 && !isManager2) {
      return new NextResponse('', { status: 200 })
    }

    // Find existing leave request in Google Sheets
    const existingRequest = await findLeaveRequestByMessage(channelId, messageTs)

    if (!existingRequest) {
      console.error('Could not find leave request in Google Sheets')
      return new NextResponse('', { status: 200 })
    }

    // Check if this manager already approved
    const manager1Approved = existingRequest.manager1ApprovedBy
    const manager2Approved = existingRequest.manager2ApprovedBy

    if (
      (isManager1 && manager1Approved) ||
      (isManager2 && manager2Approved)
    ) {
      // Already approved by this manager
      return new NextResponse('', { status: 200 })
    }

    // Update Google Sheets
    const approvalTimestamp = new Date().toISOString()
    await updateLeaveRequestApproval({
      channelId,
      messageTs,
      approverRole: isManager1 ? 'manager1' : 'manager2',
      approverUserName: approverName,
      approverUserId,
    })

    // Get updated request to check if both approved
    const updatedRequest = await findLeaveRequestByMessage(channelId, messageTs)
    const bothApproved =
      updatedRequest?.manager1ApprovedBy && updatedRequest?.manager2ApprovedBy

    // Update Slack message
    const updatedBlocks = [...(payload.message?.blocks || [])]

    // Update status in context block
    const statusText = bothApproved
      ? `Status: *Approved ✅* | Approved by: ${updatedRequest.manager1ApprovedBy} & ${updatedRequest.manager2ApprovedBy}`
      : isManager1
        ? `Status: *Approved by Manager 1* (${approverName}) | Waiting for Manager 2`
        : `Status: *Approved by Manager 2* (${approverName}) | Waiting for Manager 1`

    // Find and update context block
    const contextBlockIndex = updatedBlocks.findIndex(
      (b: any) => b.type === 'context'
    )
    if (contextBlockIndex !== -1) {
      updatedBlocks[contextBlockIndex] = {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: statusText,
          },
        ],
      }
    }

    // Update action buttons
    const actionsBlockIndex = updatedBlocks.findIndex(
      (b: any) => b.block_id === 'approval_actions'
    )
    if (actionsBlockIndex !== -1) {
      const actionsBlock = updatedBlocks[actionsBlockIndex]
      const buttons = actionsBlock.elements || []

      if (bothApproved) {
        // Remove both buttons or disable them
        updatedBlocks[actionsBlockIndex] = {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `✅ *Fully Approved* | Manager 1: ${updatedRequest.manager1ApprovedBy} | Manager 2: ${updatedRequest.manager2ApprovedBy}`,
            },
          ],
        }
      } else {
        // Update the clicked button
        const buttonIndex = isManager1 ? 0 : 1
        if (buttons[buttonIndex]) {
          buttons[buttonIndex] = {
            ...buttons[buttonIndex],
            text: {
              type: 'plain_text',
              text: `✅ Approved by ${approverName}`,
            },
            style: undefined,
            disabled: true,
          }
        }
        updatedBlocks[actionsBlockIndex] = {
          ...actionsBlock,
          elements: buttons,
        }
      }
    }

    // Update the message
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: payload.message?.text || 'Leave Request',
      blocks: updatedBlocks,
    })

    console.log(
      `✅ Leave request approved: ${isManager1 ? 'Manager 1' : 'Manager 2'} by ${approverName}`
    )

    return new NextResponse('', { status: 200 })
  } catch (error: any) {
    console.error('Error handling button click:', error)
    return new NextResponse('', { status: 200 }) // Always return 200 to avoid retries
  }
}

