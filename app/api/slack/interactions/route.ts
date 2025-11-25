/**
 * Slack Interactivity Handler
 * 
 * This endpoint handles Slack interactivity payloads:
 * - Modal submissions:
 *   - leave_request_modal: Leave request form
 *   - daily_report_modal: Daily progress report form
 * - Button clicks (Approve/Reject decisions for leave requests)
 * 
 * Current leave decision model: Single manager, approve/reject, synced with Google Sheets.
 * 
 * Flow:
 * 1. User submits /leave-req modal → message posted with Approve/Reject buttons
 * 2. Manager clicks Approve or Reject → updates Google Sheets and Slack message
 * 3. Buttons are removed after decision is made
 * 
 * Daily Report Flow:
 * 1. User submits /daily-report modal → formatted report posted to daily report channel
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

    // 1) Handle leave request modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'leave_request_modal'
    ) {
      const state = payload.view.state.values

      // Extract form values (no leave type)
      const fromDate: string = state.leave_from_date.value.selected_date
      const toDate: string = state.leave_to_date.value.selected_date
      const reason: string = state.reason.value.value
      const slackUserId: string = payload.user.id

      // Get employee's display name
      const userInfo = await slackClient.users.info({ user: slackUserId })
      const employeeName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        slackUserId

      // Post message in card format (similar to check-in/out) - NO buttons in main message
      const message = await slackClient.chat.postMessage({
        channel: LEAVE_CHANNEL_ID,
        text: `📝 Leave Request from <@${slackUserId}>`, // fallback
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📝 Leave Request',
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
                text: `*Dates:*\n${fromDate} → ${toDate}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Reason:*\n${reason}`,
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
        ],
      })

      const ts = message.ts as string
      const channelId = message.channel as string
      const nowIso = new Date().toISOString()

      // Save to Google Sheets (no leaveType)
      await appendLeaveRequestRow({
        timestamp: nowIso,
        slackUserId,
        employeeName,
        fromDate,
        toDate,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Send ephemeral message to approvers with buttons
      // TODO: Add logic here to identify approvers (e.g., channel members with manager role)
      // For now, we'll send ephemeral to a specific manager or all channel members
      // You can customize this based on your approver-visibility rules
      try {
        // Get channel members to send ephemeral to approvers
        const membersResponse = await slackClient.conversations.members({
          channel: LEAVE_CHANNEL_ID,
        })
        const members = membersResponse.members || []

        // Send ephemeral message with buttons to each member (they'll only see it if they're approvers)
        // In production, you might want to filter to only managers/approvers
        for (const memberId of members) {
          try {
            await slackClient.chat.postEphemeral({
              channel: LEAVE_CHANNEL_ID,
              user: memberId,
              text: 'Leave request pending approval',
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `New leave request from <@${slackUserId}> (${fromDate} → ${toDate})`,
                  },
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
                      value: JSON.stringify({ channelId, messageTs: ts }),
                    },
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'Reject',
                      },
                      style: 'danger',
                      action_id: 'leave_reject',
                      value: JSON.stringify({ channelId, messageTs: ts }),
                    },
                  ],
                },
              ],
            })
          } catch (ephemeralError) {
            // Ignore errors for individual members (e.g., bot can't DM itself)
            console.warn(`Could not send ephemeral to ${memberId}:`, ephemeralError)
          }
        }
      } catch (membersError) {
        console.warn('Could not get channel members for ephemeral:', membersError)
      }

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 2) Handle daily report modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'daily_report_modal'
    ) {
      const state = payload.view.state.values

      // Extract form values
      const projectName = state.dr_project_name.value.value
      const hours = state.dr_hours.value.value
      const reportingUsers: string[] = state.dr_reporting_to.value.selected_users
      const progressText = state.dr_progress.value.value
      const tomorrowPlan = state.dr_tomorrow?.value?.value ?? ''

      // Get reporter info
      const reporterId: string = payload.user.id
      const userInfo = await slackClient.users.info({ user: reporterId })
      const reporterName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        reporterId

      // Format current date
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })

      // Convert selected reporting users to Slack mentions
      const reportingMentions =
        reportingUsers.length > 0
          ? reportingUsers.map((id) => `<@${id}>`).join(' ')
          : 'N/A'

      // Build message blocks
      const blocks: any[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Daily Progress Report',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Reporter:*\n<@${reporterId}> (${reporterName})`,
            },
            {
              type: 'mrkdwn',
              text: `*Date:*\n${dateStr}`,
            },
            {
              type: 'mrkdwn',
              text: `*Project:*\n${projectName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Hours:*\n${hours}`,
            },
            {
              type: 'mrkdwn',
              text: `*Reporting To:*\n${reportingMentions}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Tasks / Progress:*\n${progressText}`,
          },
        },
      ]

      // Add tomorrow's plan if provided
      if (tomorrowPlan.trim()) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Tomorrow's Plan:*\n${tomorrowPlan}`,
          },
        })
      }

      // Post to daily report channel
      const dailyReportChannelId = process.env.SLACK_DAILY_REPORT_CHANNEL_ID
      if (!dailyReportChannelId) {
        console.error('SLACK_DAILY_REPORT_CHANNEL_ID is not set')
        return NextResponse.json(
          {
            response_action: 'errors',
            errors: {
              dr_project_name: 'Daily report channel not configured. Please contact admin.',
            },
          },
          { status: 500 }
        )
      }

      await slackClient.chat.postMessage({
        channel: dailyReportChannelId,
        text: `Daily report from ${reporterName}`, // fallback
        blocks,
      })

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 3) Handle button clicks (Approve/Reject)
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

      // Get channel/ts from button value or payload
      let channelId: string
      let messageTs: string

      if (action.value) {
        // Try to parse from button value
        try {
          const valueData = JSON.parse(action.value)
          channelId = valueData.channelId
          messageTs = valueData.messageTs
        } catch {
          // Fallback to payload
          channelId = payload.container?.channel_id || payload.channel?.id || ''
          messageTs = payload.container?.message_ts || payload.message?.ts || ''
        }
      } else {
        channelId = payload.container?.channel_id || payload.channel?.id || ''
        messageTs = payload.container?.message_ts || payload.message?.ts || ''
      }

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

      // Update Google Sheets (now returns requester info)
      let decisionResult
      try {
        decisionResult = await setLeaveDecision({
          channelId,
          messageTs,
          decision,
          decidedBy: approverName,
        })
      } catch (error: any) {
        // If already decided, return ephemeral error
        if (error.message?.includes('already decided')) {
          return NextResponse.json({
            response_action: 'errors',
            errors: {
              leave_decision: 'This leave request has already been decided.',
            },
          })
        }
        throw error
      }

      const {
        status,
        decidedBy,
        decidedAt,
        requesterId,
        fromDate,
        toDate,
        reason,
      } = decisionResult

      // Get the original message to update it
      let originalMessage
      try {
        const messageResponse = await slackClient.conversations.history({
          channel: channelId,
          latest: messageTs,
          limit: 1,
          inclusive: true,
        })
        originalMessage = messageResponse.messages?.[0]
      } catch (error) {
        console.warn('Could not fetch original message:', error)
      }

      // Build updated blocks for main channel message
      const updatedBlocks = originalMessage?.blocks
        ? (originalMessage.blocks as any[]).map((block: any) => {
            if (block.type === 'context') {
              // Update status line with decision info
              const decisionTime = new Date(decidedAt).toLocaleString()
              return {
                ...block,
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `*Status:* ${status} by ${decidedBy} at ${decisionTime}`,
                  },
                ],
              }
            }
            return block
          })
        : [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📝 Leave Request',
              },
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Employee:*\n<@${requesterId}>`,
                },
                {
                  type: 'mrkdwn',
                  text: `*Dates:*\n${fromDate} → ${toDate}`,
                },
              ],
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Reason:*\n${reason}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Status:* ${status} by ${decidedBy} at ${new Date(decidedAt).toLocaleString()}`,
                },
              ],
            },
          ]

      // Update main channel message
      await slackClient.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `📝 Leave Request ${status.toLowerCase()} by ${decidedBy}`, // fallback
        blocks: updatedBlocks as any,
      })

      // Send DM to requester
      try {
        const dmResponse = await slackClient.conversations.open({
          users: requesterId,
        })

        if (dmResponse.channel?.id) {
          const emoji = decision === 'Approved' ? '✅' : '❌'
          const headerText =
            decision === 'Approved' ? 'Leave Approved' : 'Leave Rejected'

          await slackClient.chat.postMessage({
            channel: dmResponse.channel.id,
            text: `${emoji} Your leave request (${fromDate} → ${toDate}) has been ${status.toLowerCase()} by ${decidedBy}.`,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `${emoji} ${headerText}`,
                },
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Dates:*\n${fromDate} → ${toDate}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Decision:*\n${status} by ${decidedBy}`,
                  },
                ],
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Reason:*\n${reason}`,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `Decision made at ${new Date(decidedAt).toLocaleString()}`,
                  },
                ],
              },
            ],
          })
        }
      } catch (dmError) {
        // Log but don't fail if DM fails
        console.warn(`Could not send DM to requester ${requesterId}:`, dmError)
      }

      // Acknowledge the button click
      return NextResponse.json({
        response_action: 'update',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Leave request ${status.toLowerCase()}. The requester has been notified.`,
            },
          },
        ],
      })
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
