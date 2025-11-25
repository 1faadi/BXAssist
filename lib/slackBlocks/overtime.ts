/**
 * Slack Block Builders for Overtime Requests
 * 
 * Pure functions that build Slack message blocks from data.
 * No Slack API calls - just block structure generation.
 */

/**
 * Build blocks for the main overtime channel message
 */
export function buildOvertimeChannelBlocks(input: {
  requesterId: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  decisionByMention?: string // e.g. <@Uxxx> or display name
  decisionAtText?: string // formatted PK time
}): any[] {
  const { requesterId, projectName, assignedByUserId, hours, minutes, reason, status, decisionByMention, decisionAtText } = input

  // Format duration: "2h 30m" or "2h" if minutes is 0
  const durationText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`

  const blocks: any[] = [
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
  ]

  // Add reason block if provided
  if (reason) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Task / Reason:*\n${reason}`,
      },
    })
  }

  // Add status context
  let statusText: string
  if (status === 'Pending') {
    statusText = '*Status:* Pending approval'
  } else if (status === 'Approved' || status === 'Rejected') {
    if (decisionByMention && decisionAtText) {
      statusText = `*Status:* ${status} by ${decisionByMention} at ${decisionAtText} (PKT)`
    } else if (decisionByMention) {
      statusText = `*Status:* ${status} by ${decisionByMention}`
    } else {
      statusText = `*Status:* ${status}`
    }
  } else {
    statusText = `*Status:* ${status}`
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: statusText,
      },
    ],
  })

  return blocks
}

/**
 * Build blocks for approver DM messages (after decision, no buttons)
 */
export function buildOvertimeApproverDmBlocks(input: {
  requesterId: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason?: string
  finalText: string // "✅ Approved" or "❌ Rejected" or "⚠️ Already decided"
  decisionByMention?: string
  decisionAtText?: string
}): any[] {
  const { requesterId, projectName, assignedByUserId, hours, minutes, reason, finalText, decisionByMention, decisionAtText } = input

  // Format duration
  const durationText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: finalText,
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
  ]

  // Add reason block if provided
  if (reason) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Task / Reason:*\n${reason}`,
      },
    })
  }

  // Add context with decision info if available
  if (decisionByMention && decisionAtText) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Decided by ${decisionByMention} at ${decisionAtText} (PKT)`,
        },
      ],
    })
  } else if (finalText.includes('Already decided')) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: finalText.includes('Approved') 
            ? '⚠️ This request was already approved.'
            : '⚠️ This request was already rejected.',
        },
      ],
    })
  }

  return blocks
}

/**
 * Build blocks for requester DM notification
 */
export function buildOvertimeRequesterDmBlocks(input: {
  status: 'Approved' | 'Rejected'
  requesterId: string
  projectName: string
  assignedByUserId: string
  hours: number
  minutes: number
  reason?: string
  decidedByMention: string // display name or mention
  decidedAtText: string
}): any[] {
  const { status, projectName, assignedByUserId, hours, minutes, reason, decidedByMention, decidedAtText } = input

  // Format duration
  const durationText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`

  const emoji = status === 'Approved' ? '✅' : '❌'
  const headerText = status === 'Approved' ? 'Overtime Approved' : 'Overtime Rejected'

  const blocks: any[] = [
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
          text: `*Decision:*\n${status} by ${decidedByMention}`,
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${decidedAtText} (PKT)`,
        },
      ],
    },
  ]

  // Add reason block if provided
  if (reason) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Task / Reason:*\n${reason}`,
      },
    })
  }

  // Add context
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Decision made at ${decidedAtText} (PKT)`,
      },
    ],
  })

  return blocks
}

