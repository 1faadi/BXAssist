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
  getOvertimeRequestByKey,
  appendShortLeaveRequestRow,
  setShortLeaveDecision,
} from '@/lib/googleSheets'
import { toBullets } from '@/lib/textFormat'

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

      // Format text fields as bullet points
      const formattedProgress = toBullets(progressText)
      const formattedTomorrowPlan = tomorrowPlan.trim() ? toBullets(tomorrowPlan) : ''

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
            text: `*Tasks / Progress:*\n${formattedProgress}`,
          },
        },
      ]

      // Add tomorrow's plan if provided
      if (formattedTomorrowPlan) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Tomorrow's Plan:*\n${formattedTomorrowPlan}`,
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

      // Parse and validate hours/minutes
      const hoursRaw = state.ot_hours.value.value
      const minutesRaw = state.ot_minutes?.value?.value ?? '0'
      const hours = Number(hoursRaw)
      const minutes = Number(minutesRaw)

      // Validate hours
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            ot_hours: 'Enter a valid hour (0-24)',
          },
        })
      }

      // Validate minutes
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            ot_minutes: 'Enter valid minutes (0-59)',
          },
        })
      }

      // Compute display duration string
      const durationText = `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim()

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

      // Build channel message blocks (NO buttons - visible to everyone)
      const channelMessageBlocks = [
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
                text: `*Duration:*\n${durationText}`,
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
              text: `*Status:* Pending approval (waiting for <@${assignedByUserId}>)`,
              },
            ],
          },
      ]

      // Post ONE message to overtime channel (NO buttons)
      const message = await slackClient.chat.postMessage({
        channel: overtimeChannelId,
        text: `⏱️ Overtime Request from <@${requesterId}>`, // fallback
        blocks: channelMessageBlocks as any,
      })

      const ts = message.ts as string
      const channelId = message.channel as string
      const nowIso = new Date().toISOString()

      // Build ephemeral message blocks (WITH buttons - only visible to assignedByUserId)
      const ephemeralMessageBlocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⏱️ Overtime Approval Required',
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
              text: `*Duration:*\n${durationText}`,
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
          type: 'actions',
          block_id: 'ot_decision',
          elements: [
            {
              type: 'button',
              style: 'primary',
              text: {
                type: 'plain_text',
                text: 'Approve',
              },
              action_id: 'ot_approve',
              value: JSON.stringify({
                channelId: channelId,
                messageTs: ts,
              }),
            },
            {
              type: 'button',
              style: 'danger',
              text: {
                type: 'plain_text',
                text: 'Reject',
              },
              action_id: 'ot_reject',
              value: JSON.stringify({
                channelId: channelId,
                messageTs: ts,
              }),
            },
          ],
        },
      ]

      // Post ephemeral message to assignedByUserId (with buttons)
      await slackClient.chat.postEphemeral({
        channel: overtimeChannelId,
        user: assignedByUserId,
        text: 'Overtime approval required',
        blocks: ephemeralMessageBlocks as any,
      })

      // Save to Google Sheets
      await appendOvertimeRequestRow({
        timestamp: nowIso,
        slackUserId: requesterId,
        employeeName,
        projectName,
        assignedByUserId,
        hours,
        minutes,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 2c) Handle short leave request modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'short_leave_request_modal'
    ) {
      const state = payload.view.state.values
      // Extract form values
      const fromDate: string = state.sl_from_date.value.selected_date
      const toDate: string = state.sl_to_date.value.selected_date
      const timeFrom: string | undefined = state.sl_time_from.value.selected_time // HH:mm
      const timeTo: string | undefined = state.sl_time_to?.value?.selected_time // HH:mm
      const reason: string = state.sl_reason.value.value

      // Basic validation: dates
      if (fromDate > toDate) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            sl_to_date: 'End date must be on or after start date',
          },
        })
      }

      // Validate times presence
      if (!timeFrom || !timeTo) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            sl_time_to: 'Both "Time from" and "Time to" are required.',
          },
        })
      }

      // Validate Slack timepicker format HH:mm
      const timeRegex = /^\d{2}:\d{2}$/
      if (!timeRegex.test(timeFrom) || !timeRegex.test(timeTo)) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            sl_time_to: 'Invalid time format. Please select times in HH:mm.',
          },
        })
      }

      // Validate "Time from" within allowed range: 9:00 AM to 6:00 PM (09:00 to 18:00)
      const [fromHours, fromMinutes] = timeFrom.split(':').map(Number)
      const fromTotalMinutes = fromHours * 60 + fromMinutes
      const minTime = 9 * 60 // 09:00 = 540 minutes
      const maxTime = 18 * 60 // 18:00 = 1080 minutes

      if (fromTotalMinutes < minTime || fromTotalMinutes > maxTime) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            sl_time_from: 'Time must be between 9:00 AM and 6:00 PM',
          },
        })
      }

      // If same date, ensure timeTo > timeFrom
      if (fromDate === toDate) {
        const [toHours, toMinutes] = timeTo.split(':').map(Number)
        const toTotalMinutes = toHours * 60 + toMinutes

        if (toTotalMinutes <= fromTotalMinutes) {
          return NextResponse.json({
            response_action: 'errors',
            errors: {
              sl_time_to:
                'Time to must be after time from (same-day short leave).',
            },
          })
        }
      }

      const requesterId: string = payload.user.id

      // Get requester's display name (for Google Sheets only)
      const requesterInfo = await slackClient.users.info({ user: requesterId })
      const employeeName =
        (requesterInfo.user?.profile as any)?.real_name ||
        (requesterInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        requesterId

      // Get short leave channel ID
      const shortLeaveChannelId = process.env.SLACK_SHORT_LEAVE_CHANNEL_ID
      if (!shortLeaveChannelId) {
        return NextResponse.json(
          {
            response_action: 'errors',
            errors: {
              sl_from_date: 'Short leave channel not configured. Please contact admin.',
            },
          },
          { status: 500 }
        )
      }

      // Build channel message blocks function (will be reused for update with buttons)
      const buildChannelMessageBlocks = (includeButtons: boolean, messageTs?: string) => {
        const blocks: any[] = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🕒 Short Leave Request',
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
              {
                type: 'mrkdwn',
                text: `*Time:*\n${timeFrom} → ${timeTo}`,
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
                text: '*Status:* Pending approval',
              },
            ],
          },
        ]

        // Add actions block with buttons if requested
        if (includeButtons && messageTs) {
          blocks.push({
            type: 'actions',
            block_id: 'sl_decision',
            elements: [
              {
                type: 'button',
                style: 'primary',
                text: {
                  type: 'plain_text',
                  text: 'Approve',
                },
                action_id: 'sl_approve',
                value: JSON.stringify({
                  channelId: shortLeaveChannelId,
                  messageTs: messageTs,
                }),
              },
              {
                type: 'button',
                style: 'danger',
                text: {
                  type: 'plain_text',
                  text: 'Reject',
                },
                action_id: 'sl_reject',
                value: JSON.stringify({
                  channelId: shortLeaveChannelId,
                  messageTs: messageTs,
                }),
              },
            ],
          })
        }

        return blocks
      }

      // Post message to short leave channel (NO buttons initially)
      const message = await slackClient.chat.postMessage({
        channel: shortLeaveChannelId,
        text: `🕒 Short Leave Request from <@${requesterId}>`, // fallback
        blocks: buildChannelMessageBlocks(false) as any,
      })

      const ts = message.ts as string
      const channelId = message.channel as string
      const nowIso = new Date().toISOString()

      // Update message to add buttons with correct messageTs
      await slackClient.chat.update({
        channel: channelId,
        ts: ts,
        text: `🕒 Short Leave Request from <@${requesterId}>`,
        blocks: buildChannelMessageBlocks(true, ts) as any,
      })

      // Save to Google Sheets
      await appendShortLeaveRequestRow({
        timestamp: nowIso,
        slackUserId: requesterId,
        employeeName,
        fromDate,
        toDate,
        timeFrom,
        timeTo,
        reason,
        status: 'Pending',
        slackMessageTs: ts,
        slackChannelId: channelId,
      })

      // Close modal
      return NextResponse.json({ response_action: 'clear' })
    }

    // 2d) Handle standup modal submission
    if (
      payload.type === 'view_submission' &&
      payload.view?.callback_id === 'standup_modal'
    ) {
      const state = payload.view.state.values

      // Extract form values
      const project: string = state.su_project.value.value
      const taskRaw: string = state.su_task.value.value

      // Validate
      const errors: Record<string, string> = {}
      if (!project || !project.trim()) {
        errors.su_project = 'Project name is required'
      }
      if (!taskRaw || !taskRaw.trim()) {
        errors.su_task = "Today's task is required"
      }

      if (Object.keys(errors).length > 0) {
        return NextResponse.json({
          response_action: 'errors',
          errors,
        })
      }

      // Format tasks into bullets
      const formattedTasks = toBullets(taskRaw)

      // Get PK date string (YYYY-MM-DD)
      const { datePk, nowIso } = await import('@/lib/timePk').then((m) => m.nowPk())

      const userId: string = payload.user.id

      // Get employee's display name (for Google Sheets)
      const userInfo = await slackClient.users.info({ user: userId })
      const employeeName =
        (userInfo.user?.profile as any)?.real_name ||
        (userInfo.user?.profile as any)?.display_name ||
        payload.user.username ||
        userId

      // Get standup channel ID
      const standupChannelId = process.env.SLACK_STANDUP_CHANNEL_ID
      if (!standupChannelId) {
        return NextResponse.json(
          {
            response_action: 'errors',
            errors: {
              su_project: 'Standup channel not configured. Please contact admin.',
            },
          },
          { status: 500 }
        )
      }

      // Post message to standup channel
      const message = await slackClient.chat.postMessage({
        channel: standupChannelId,
        text: `📣 Standup from <@${userId}>`, // fallback
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📣 Standup',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Employee:*\n<@${userId}>`,
              },
              {
                type: 'mrkdwn',
                text: `*Date:*\n${datePk} (PKT)`,
              },
              {
                type: 'mrkdwn',
                text: `*Project:*\n${project}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Today's Task:*\n${formattedTasks}`,
            },
          },
        ] as any,
      })

      const ts = message.ts as string
      const channelId = message.channel as string

      // Save to Google Sheets (optional)
      try {
        const { appendStandupRow } = await import('@/lib/googleSheets')
        await appendStandupRow({
          timestamp: nowIso,
          datePkt: datePk,
          slackUserId: userId,
          employeeName,
          projectName: project,
          todaysTask: taskRaw, // Store raw task text, not formatted
          slackMessageTs: ts,
          slackChannelId: channelId,
        })
      } catch (sheetsError) {
        // Log but don't fail if Sheets logging fails
        console.warn('Could not save standup to Google Sheets:', sheetsError)
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
        const approverId: string = payload.user.id

        // Parse channelId and messageTs from button value
        let channelId: string
        let messageTs: string
        if (action.value) {
          try {
            const valueData = JSON.parse(action.value)
            channelId = valueData.channelId
            messageTs = valueData.messageTs
          } catch {
            return NextResponse.json({
              response_type: 'ephemeral',
              text: '❌ Invalid request data. Please try again.',
            })
          }
        } else {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Missing request data. Please try again.',
          })
        }

        if (!channelId || !messageTs) {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Invalid request data. Please try again.',
          })
        }

        // Load overtime request from Google Sheets
        const overtimeRequest = await getOvertimeRequestByKey({
          channelId,
          messageTs,
        })

        if (!overtimeRequest) {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Overtime request not found.',
          })
        }

        // Authorization: Only the "Assigned by" person can approve/reject
        if (approverId !== overtimeRequest.assignedByUserId) {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: `❌ Only <@${overtimeRequest.assignedByUserId}> can approve/reject this overtime request.`,
          })
        }

        // Determine decision
        const decision: 'Approved' | 'Rejected' =
          action.action_id === 'ot_approve' ? 'Approved' : 'Rejected'

        // Get approver info
        const approverInfo = await slackClient.users.info({ user: approverId })
        const approverName =
          (approverInfo.user?.profile as any)?.real_name ||
          (approverInfo.user?.profile as any)?.display_name ||
          payload.user.username ||
          approverId

        // Update Google Sheets (check if already decided)
        const decisionResult = await setOvertimeDecision({
          channelId,
          messageTs,
          decision,
          decidedBy: approverName,
        })

        const {
          alreadyDecided,
          status,
          decidedBy,
          decidedAt,
          requesterId,
          projectName,
          assignedByUserId,
          hours,
          minutes,
          reason,
        } = decisionResult

        // Format duration text
        const durationText = `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim()

        // Format decision time in PK timezone
        const decisionTime = new Date(decidedAt).toLocaleString('en-GB', {
          timeZone: 'Asia/Karachi',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        // If already decided, replace ephemeral message and return
        if (alreadyDecided) {
          return NextResponse.json({
            response_type: 'ephemeral',
            replace_original: true,
            text: `⚠️ Decision already recorded`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `⚠️ This overtime request has already been ${status.toLowerCase()} by ${decidedBy} at ${decisionTime} (PKT).`,
                },
              },
            ] as any,
          })
        }

        // New decision - update channel message and DM requester
        // 1. Update the overtime channel message (show status - no buttons to remove)
        const updatedChannelBlocks = [
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
                    text: `*Duration:*\n${durationText}`,
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
                text: `*Status:* ${status} by <@${approverId}> at ${decisionTime} (PKT)`,
                  },
                ],
              },
        ]

        // Update channel message (status only, no buttons to remove)
        await slackClient.chat.update({
          channel: channelId,
          ts: messageTs,
          text: `⏱️ Overtime Request ${status.toLowerCase()} by ${decidedBy}`, // fallback
          blocks: updatedChannelBlocks as any,
        })

        // 2. DM requester (only once, idempotency handled by setOvertimeDecision)
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
              text: `${emoji} Your overtime request for ${projectName} (${durationText}) has been ${status.toLowerCase()} by <@${approverId}>.`,
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
                      text: `*Duration:*\n${durationText}`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Decision:*\n${status} by <@${approverId}>`,
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

        // 3. Replace ephemeral message to remove buttons
        const emoji = decision === 'Approved' ? '✅' : '❌'
        return NextResponse.json({
          response_type: 'ephemeral',
          replace_original: true,
          text: `${emoji} Decision recorded: ${status}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${emoji} *Decision recorded: ${status}*\n\nYour decision has been recorded. The requester has been notified.`,
              },
            },
          ] as any,
        })
      }

      // Handle short leave approve/reject
      if (action.action_id === 'sl_approve' || action.action_id === 'sl_reject') {
        const approverId: string = payload.user.id

        // Parse channelId and messageTs from button value
        let channelId: string
        let messageTs: string
        if (action.value) {
          try {
            const valueData = JSON.parse(action.value)
            channelId = valueData.channelId
            messageTs = valueData.messageTs
          } catch {
            return NextResponse.json({
              response_type: 'ephemeral',
              text: '❌ Invalid request data. Please try again.',
            })
          }
        } else {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Missing request data. Please try again.',
          })
        }

        if (!channelId || !messageTs) {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Invalid request data. Please try again.',
          })
        }

        // Determine decision
        const decision: 'Approved' | 'Rejected' =
          action.action_id === 'sl_approve' ? 'Approved' : 'Rejected'

        // Update Google Sheets (check if already decided)
        const decisionResult = await setShortLeaveDecision({
          channelId,
          messageTs,
          decision,
          decidedById: approverId,
        })

        const {
          alreadyDecided,
          status,
          decidedById,
          decidedAtIso,
          requesterId,
          fromDate,
          toDate,
          timeFrom,
        timeTo,
          reason,
        } = decisionResult

        // Format decision time in PK timezone
        const decisionTime = new Date(decidedAtIso).toLocaleString('en-GB', {
          timeZone: 'Asia/Karachi',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        // If already decided, return ephemeral message to clicker
        if (alreadyDecided) {
          return NextResponse.json({
            response_type: 'ephemeral',
            text: `⚠️ Already decided: ${status} by <@${decidedById}>`,
          })
        }

        // New decision - update channel message (remove buttons) and DM requester
        // 1. Update the channel message (remove actions block, show status)
        const updatedChannelBlocks = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🕒 Short Leave Request',
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
              {
                type: 'mrkdwn',
                text: `*Time:*\n${timeFrom} → ${timeTo}`,
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
                text: `*Status:* ${status} by <@${approverId}> at ${decisionTime} (PKT)`,
              },
            ],
          },
        ]

        // Update channel message (buttons removed by not including actions block)
        await slackClient.chat.update({
          channel: channelId,
          ts: messageTs,
          text: `🕒 Short Leave Request ${status.toLowerCase()} by <@${approverId}>`, // fallback
          blocks: updatedChannelBlocks as any,
        })

        // 2. DM requester
        try {
          const dmResponse = await slackClient.conversations.open({
            users: requesterId,
          })

          if (dmResponse.channel?.id) {
            const emoji = decision === 'Approved' ? '✅' : '❌'
            const headerText =
              decision === 'Approved' ? 'Short Leave Approved' : 'Short Leave Rejected'

            await slackClient.chat.postMessage({
              channel: dmResponse.channel.id,
              text: `${emoji} Your short leave (${fromDate} → ${toDate}, ${timeFrom} → ${timeTo}) has been ${status.toLowerCase()} by <@${approverId}>.`,
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
                      text: `*Time:*\n${timeFrom} → ${timeTo}`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Decision:*\n${status} by <@${approverId}>`,
                    },
                    {
                      type: 'mrkdwn',
                      text: `*Time:*\n${decisionTime} (PKT)`,
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

        // Return 200 (idempotent - no response needed)
        return new NextResponse('', { status: 200 })
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
