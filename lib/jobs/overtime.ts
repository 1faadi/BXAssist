/**
 * Overtime Request Processing
 * 
 * Pure function that handles all heavy processing for overtime requests:
 * - Posts main message to overtime channel
 * - Saves to Google Sheets
 * - Sends DM messages to approvers
 * - Stores approver DM message info in Google Sheets
 * 
 * This function is called via unstable_after() to run after the Slack ACK response.
 */

import { slackClient } from '@/lib/slackClient'
import {
  appendOvertimeRequestRow,
  addOvertimeApproverMessage,
} from '@/lib/googleSheets'

export async function processOvertimeRequest(args: {
  requesterId: string
  requesterName?: string
  projectName: string
  hours: number
  minutes: number
  assignedByUserId: string
  reason: string
}): Promise<void> {
  const {
    requesterId,
    requesterName,
    projectName,
    hours,
    minutes,
    assignedByUserId,
    reason,
  } = args

  // Get requester's display name (for Google Sheets)
  let employeeName = requesterName || requesterId
  try {
    const requesterInfo = await slackClient.users.info({ user: requesterId })
    employeeName =
      (requesterInfo.user?.profile as any)?.real_name ||
      (requesterInfo.user?.profile as any)?.display_name ||
      requesterName ||
      requesterId
  } catch (error) {
    console.warn(`Could not fetch requester info for ${requesterId}:`, error)
  }

  // Get overtime channel ID
  const overtimeChannelId = process.env.SLACK_OVERTIME_CHANNEL_ID
  if (!overtimeChannelId) {
    throw new Error('SLACK_OVERTIME_CHANNEL_ID is not set')
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

  // Compute display duration string
  const durationText = `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim()

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
            text: `*Duration:*\n${durationText}`,
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
    hours,
    minutes,
    reason,
    status: 'Pending',
    slackMessageTs: ts,
    slackChannelId: channelId,
  })

  // Send DM messages to approvers with buttons
  const approverIds = (process.env.SLACK_OVERTIME_APPROVER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const requestKey = `${channelId}:${ts}`

  if (approverIds.length > 0) {
    for (const approverId of approverIds) {
      try {
        // Open DM channel
        const dmResponse = await slackClient.conversations.open({
          users: approverId,
        })

        if (!dmResponse.channel?.id) {
          console.warn(`Could not open DM with approver ${approverId}`)
          continue
        }

        const imChannelId = dmResponse.channel.id

        // Send DM with buttons
        const dmMessage = await slackClient.chat.postMessage({
          channel: imChannelId,
          text: 'Overtime approval requested',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '⏱️ Overtime Approval',
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
              elements: [
                {
                  type: 'button',
                  style: 'primary',
                  text: {
                    type: 'plain_text',
                    text: 'Approve',
                  },
                  action_id: 'ot_approve',
                  value: JSON.stringify({ reqKey: requestKey }),
                },
                {
                  type: 'button',
                  style: 'danger',
                  text: {
                    type: 'plain_text',
                    text: 'Reject',
                  },
                  action_id: 'ot_reject',
                  value: JSON.stringify({ reqKey: requestKey }),
                },
              ],
            },
          ] as any,
        })

        // Store DM message info in Google Sheets
        await addOvertimeApproverMessage({
          requestKey,
          approverUserId: approverId,
          imChannelId,
          messageTs: dmMessage.ts as string,
        })

        // Small delay to avoid rate limits
        if (approverIds.indexOf(approverId) < approverIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
      } catch (dmError) {
        // Ignore errors for individual approvers
        console.warn(`Could not send DM to approver ${approverId}:`, dmError)
      }
    }
  }
}

