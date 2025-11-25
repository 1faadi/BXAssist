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
import {
  appendLeaveRequestRow,
  setLeaveDecision,
  appendOvertimeRequestRow,
  setOvertimeDecision,
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

      // Post message in card format (similar to check-in/out) with Approve/Reject buttons
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

    // 2b) Handle overtime request modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'overtime_request_modal'
    ) {
      const state = payload.view.state.values

      // Extract form values
      const projectName: string = state.ot_project.value.value
      const assignedByUserId: string = state.ot_assigned_by.value.selected_user
      const reason: string = state.ot_reason?.value?.value ?? ''

      const requesterId: string = payload.user.id

      // Get requester's display name (for Google Sheets only)
      const requesterInfo = await slackClient.users.info({ user: requesterId })
      const employeeName =
        (requesterInfo.user?.profile as any)?.real_name ||
        (requesterInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        requesterId

      // Get overtime channel ID
      const overtimeChannelId = process.env.SLACK_OVERTIME_CHANNEL_ID
      if (!overtimeChannelId) {
        return NextResponse.json(
          {
            response_action: 'errors',
            errors: {
              ot_project: 'Overtime channel not configured. Please contact admin.',
            },
          },
          { status: 500 }
        )
      }

      // Format requested time in PK timezone
      const requestedTime = new Date().toLocaleString('en-GB', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })

      // Post main message to overtime channel (NO buttons)
      const message = await slackClient.chat.postMessage({
        channel: overtimeChannelId,
        text: `⏱️ Overtime Request from <@${requesterId}>`, // fallback
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⏱️ Overtime Request',
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
                text: `*Project:*\n${projectName}`,
              },
              {
                type: 'mrkdwn',
                text: `*Assigned by:*\n<@${assignedByUserId}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Requested on:*\n${requestedTime} (PKT)`,
              },
            ],
          },
          ...(reason
            ? ([
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Task / Reason:*\n${reason}`,
                  },
                },
              ] as any[])
            : []),
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

      // Save to Google Sheets
      await appendOvertimeRequestRow({
        timestamp: nowIso,
        slackUserId: requesterId,
        employeeName,
        projectName,
        assignedByUserId,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Send ephemeral messages to approvers with buttons
      const approverIds = (process.env.SLACK_OVERTIME_APPROVER_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (approverIds.length > 0) {
        for (const approverId of approverIds) {
          try {
            await slackClient.chat.postEphemeral({
              channel: channelId,
              user: approverId,
              text: 'Overtime request pending approval',
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Overtime Request*\n*Employee:* <@${requesterId}>\n*Project:* ${projectName}\n*Assigned by:* <@${assignedByUserId}>`,
                  },
                },
                ...(reason
                  ? ([
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `*Task / Reason:*\n${reason}`,
                        },
                      },
                    ] as any[])
                  : []),
                {
                  type: 'actions',
                  block_id: 'ot_decision',
                  elements: [
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'Approve',
                      },
                      style: 'primary',
                      action_id: 'ot_approve',
                      value: JSON.stringify({ channelId, messageTs: ts }),
                    },
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'Reject',
                      },
                      style: 'danger',
                      action_id: 'ot_reject',
                      value: JSON.stringify({ channelId, messageTs: ts }),
                    },
                  ],
                },
              ] as any,
            })
          } catch (ephemeralError) {
            // Ignore errors for individual approvers
            console.warn(`Could not send ephemeral to approver ${approverId}:`, ephemeralError)
          }
        }
      }

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 3) Handle button clicks (Approve/Reject)
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0]
      if (!action) return new NextResponse('', { status: 200 })

      // Handle overtime approve/reject
      if (action.action_id === 'ot_approve' || action.action_id === 'ot_reject') {
        // Validate approver
        const approverIds = (process.env.SLACK_OVERTIME_APPROVER_IDS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

        const approverId: string = payload.user.id
        if (!approverIds.includes(approverId)) {
          // Not an authorized approver
          return NextResponse.json({
            response_action: 'ephemeral',
            text: 'You are not authorized to approve/reject overtime requests.',
          })
        }

        // Determine decision
        const decision: 'Approved' | 'Rejected' =
          action.action_id === 'ot_approve' ? 'Approved' : 'Rejected'

        // Get channel/ts from button value
        let channelId: string
        let messageTs: string

        if (action.value) {
          try {
            const valueData = JSON.parse(action.value)
            channelId = valueData.channelId
            messageTs = valueData.messageTs
          } catch {
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

        // Get approver info
        const approverInfo = await slackClient.users.info({ user: approverId })
        const approverName =
          (approverInfo.user?.profile as any)?.real_name ||
          (approverInfo.user?.profile as any)?.display_name ||
          payload.user.username ||
          approverId

        // Update Google Sheets
        let decisionResult
        try {
          decisionResult = await setOvertimeDecision({
            channelId,
            messageTs,
            decision,
            decidedBy: approverName,
          })
        } catch (error: any) {
          // If already decided, return ephemeral error
          if (error.message?.includes('already decided')) {
            return NextResponse.json({
              response_action: 'ephemeral',
              text: 'This overtime request has already been decided.',
            })
          }
          throw error
        }

        const {
          status,
          decidedBy,
          decidedAt,
          requesterId,
          projectName,
          assignedByUserId,
          reason,
        } = decisionResult

        // Check if already decided (from sheet)
        if (status !== decision) {
          return NextResponse.json({
            response_action: 'ephemeral',
            text: `This overtime request has already been ${status.toLowerCase()}.`,
          })
        }

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

        // Format decision time in PK timezone
        const decisionTime = new Date(decidedAt).toLocaleString('en-GB', {
          timeZone: 'Asia/Karachi',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        // Build updated blocks for main channel message
        const updatedBlocks = originalMessage?.blocks
          ? (originalMessage.blocks as any[])
              .map((block: any) => {
                if (block.type === 'context') {
                  // Update status line with decision info
                  return {
                    ...block,
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: `*Status:* ${status} by ${decidedBy} at ${decisionTime} (PKT)`,
                      },
                    ],
                  }
                }
                return block
              })
              .filter(Boolean)
          : [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '⏱️ Overtime Request',
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
                    text: `*Project:*\n${projectName}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Assigned by:*\n<@${assignedByUserId}>`,
                  },
                ],
              },
              ...(reason
                ? ([
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: `*Task / Reason:*\n${reason}`,
                      },
                    },
                  ] as any[])
                : []),
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `*Status:* ${status} by ${decidedBy} at ${decisionTime} (PKT)`,
                  },
                ],
              },
            ]

        // Update main channel message
        await slackClient.chat.update({
          channel: channelId,
          ts: messageTs,
          text: `⏱️ Overtime Request ${status.toLowerCase()} by ${decidedBy}`, // fallback
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
              decision === 'Approved' ? 'Overtime Approved' : 'Overtime Rejected'

            await slackClient.chat.postMessage({
              channel: dmResponse.channel.id,
              text: `${emoji} Your overtime request for ${projectName} has been ${status.toLowerCase()} by ${decidedBy}.`,
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
                      text: `*Project:*\n${projectName}`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Assigned by:*\n<@${assignedByUserId}>`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Decision:*\n${status} by ${decidedBy}`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Time:*\n${decisionTime} (PKT)`,
                    },
                  ],
                },
                ...(reason
                  ? ([
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `*Task / Reason:*\n${reason}`,
                        },
                      },
                    ] as any[])
                  : []),
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `Decision made at ${decisionTime} (PKT)`,
                    },
                  ],
                },
              ] as any,
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
                text: `✅ Overtime request ${status.toLowerCase()}. The requester has been notified.`,
              },
            },
          ],
        })
      }

      // Handle leave approve/reject (existing logic)
      if (
        action.action_id !== 'leave_approve' &&
        action.action_id !== 'leave_reject'
      ) {
        return new NextResponse('', { status: 200 })
      }

      // Determine decision
      const decision: 'Approved' | 'Rejected' =
        action.action_id === 'leave_approve' ? 'Approved' : 'Rejected'

      // Get channel/ts from payload (buttons are in main message)
      const channelId: string =
        payload.container?.channel_id || payload.channel?.id || ''
      const messageTs: string =
        payload.container?.message_ts || payload.message?.ts || ''

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

      // Build updated blocks for main channel message (remove buttons after decision)
      const updatedBlocks = originalMessage?.blocks
        ? (originalMessage.blocks as any[])
            .map((block: any) => {
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
              // Remove the actions block (buttons) after decision
              if (block.type === 'actions' && block.block_id === 'leave_decision') {
                return null
              }
              return block
            })
            .filter(Boolean) // Remove null blocks
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
