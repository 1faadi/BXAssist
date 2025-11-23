import { NextRequest, NextResponse } from 'next/server'
import { appendRow } from '@/lib/googleSheets'
import { postMessage, openModal, verifySlackSignature } from '@/lib/slack'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Handle Slack slash commands and interactive payloads
 * 
 * Supported commands:
 * - /checkin - Record check-in time
 * - /checkout - Record checkout time
 * - /leave - Open leave request modal
 * 
 * Also handles modal submissions for leave requests
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-slack-signature') || ''
    const timestamp = request.headers.get('x-slack-request-timestamp') || ''

    // Parse the form-encoded body
    const params = new URLSearchParams(rawBody)

    // Handle Slack URL verification challenge
    const challenge = params.get('challenge')
    if (challenge) {
      // This is a URL verification request from Slack
      return NextResponse.json({ challenge })
    }

    // Verify Slack signature for all other requests
    if (!verifySlackSignature(rawBody, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Check if this is an interactive payload (modal submission)
    const payload = params.get('payload')
    if (payload) {
      return handleInteractivePayload(JSON.parse(payload))
    }

    // Handle slash commands
    const command = params.get('command')
    const userId = params.get('user_id')
    const userName = params.get('user_name')
    const triggerId = params.get('trigger_id')
    const text = params.get('text') || ''

    if (!command || !userId || !userName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    switch (command) {
      case '/checkin':
        return await handleCheckin(userId, userName)

      case '/checkout':
        return await handleCheckout(userId, userName)

      case '/leave':
        if (!triggerId) {
          return NextResponse.json(
            { error: 'Missing trigger_id' },
            { status: 400 }
          )
        }
        return await handleLeaveModal(triggerId)

      default:
        return NextResponse.json(
          { error: `Unknown command: ${command}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Error handling Slack request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Handle /checkin command
 * Records check-in time in the Attendance sheet
 */
async function handleCheckin(
  userId: string,
  userName: string
): Promise<NextResponse> {
  try {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0] // HH:MM:SS

    // Append row: Date, User ID, User Name, Check-in, Checkout
    await appendRow('Attendance!A:E', [dateStr, userId, userName, timeStr, ''])

    return new NextResponse(
      `✅ Check-in recorded for ${userName} at ${timeStr}`,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error recording check-in:', error)
    return new NextResponse(
      '❌ Error recording check-in. Please try again or contact support.',
      { status: 500 }
    )
  }
}

/**
 * Handle /checkout command
 * Records checkout time in the Attendance sheet
 */
async function handleCheckout(
  userId: string,
  userName: string
): Promise<NextResponse> {
  try {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0] // HH:MM:SS

    // Append row: Date, User ID, User Name, Check-in (blank), Checkout
    await appendRow('Attendance!A:E', [dateStr, userId, userName, '', timeStr])

    return new NextResponse(
      `✅ Checkout recorded for ${userName} at ${timeStr}`,
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error recording checkout:', error)
    return new NextResponse(
      '❌ Error recording checkout. Please try again or contact support.',
      { status: 500 }
    )
  }
}

/**
 * Handle /leave command
 * Opens a modal for leave request submission
 */
async function handleLeaveModal(triggerId: string): Promise<NextResponse> {
  try {
    const modalView = {
      type: 'modal',
      callback_id: 'leave_request_modal',
      title: {
        type: 'plain_text',
        text: 'Request Leave',
      },
      submit: {
        type: 'plain_text',
        text: 'Submit',
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'from_date',
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            placeholder: {
              type: 'plain_text',
              text: 'YYYY-MM-DD',
            },
          },
          label: {
            type: 'plain_text',
            text: 'From Date (YYYY-MM-DD)',
          },
        },
        {
          type: 'input',
          block_id: 'to_date',
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            placeholder: {
              type: 'plain_text',
              text: 'YYYY-MM-DD',
            },
          },
          label: {
            type: 'plain_text',
            text: 'To Date (YYYY-MM-DD)',
          },
        },
        {
          type: 'input',
          block_id: 'leave_type',
          element: {
            type: 'static_select',
            action_id: 'value',
            options: [
              {
                text: {
                  type: 'plain_text',
                  text: 'Annual',
                },
                value: 'Annual',
              },
              {
                text: {
                  type: 'plain_text',
                  text: 'Sick',
                },
                value: 'Sick',
              },
              {
                text: {
                  type: 'plain_text',
                  text: 'Casual',
                },
                value: 'Casual',
              },
            ],
          },
          label: {
            type: 'plain_text',
            text: 'Leave Type',
          },
        },
        {
          type: 'input',
          block_id: 'reason',
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Reason for leave...',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Reason',
          },
        },
      ],
    }

    const result = await openModal(triggerId, modalView)

    if (!result.ok) {
      return new NextResponse(
        '❌ Error opening leave request form. Please try again.',
        { status: 500 }
      )
    }

    // Return 200 OK immediately (Slack requires this)
    return NextResponse.json({})
  } catch (error: any) {
    console.error('Error opening leave modal:', error)
    return new NextResponse(
      '❌ Error opening leave request form. Please try again.',
      { status: 500 }
    )
  }
}

/**
 * Handle interactive payload (modal submission)
 */
async function handleInteractivePayload(payload: any): Promise<NextResponse> {
  try {
    // Check if this is a leave request modal submission
    if (payload.type === 'view_submission' && payload.view.callback_id === 'leave_request_modal') {
      const values = payload.view.state.values
      const userId = payload.user.id
      const userName = payload.user.name

      // Extract form values
      const fromDate =
        values.from_date?.value?.value || ''
      const toDate = values.to_date?.value?.value || ''
      const leaveType = values.leave_type?.value?.selected_option?.value || ''
      const reason = values.reason?.value?.value || ''

      // Validate required fields
      if (!fromDate || !toDate || !leaveType || !reason) {
        return NextResponse.json({
          response_action: 'errors',
          errors: {
            from_date: !fromDate ? 'From date is required' : undefined,
            to_date: !toDate ? 'To date is required' : undefined,
            leave_type: !leaveType ? 'Leave type is required' : undefined,
            reason: !reason ? 'Reason is required' : undefined,
          },
        })
      }

      // Get current timestamp
      const timestamp = new Date().toISOString()

      // Append to LeaveRequests sheet
      // Columns: Timestamp, User ID, User Name, From Date, To Date, Type, Reason, Status
      await appendRow('LeaveRequests!A:H', [
        timestamp,
        userId,
        userName,
        fromDate,
        toDate,
        leaveType,
        reason,
        'Pending',
      ])

      // Post message to #hr channel
      const message = `📋 *New Leave Request*\n\n` +
        `*User:* <@${userId}> (${userName})\n` +
        `*From:* ${fromDate}\n` +
        `*To:* ${toDate}\n` +
        `*Type:* ${leaveType}\n` +
        `*Reason:* ${reason}\n` +
        `*Status:* Pending`

      await postMessage('#hr', message)

      // Return success response to close modal
      return NextResponse.json({
        response_action: 'clear',
      })
    }

    // Unknown payload type
    return NextResponse.json({ error: 'Unknown payload type' }, { status: 400 })
  } catch (error: any) {
    console.error('Error handling interactive payload:', error)
    return NextResponse.json({
      response_action: 'errors',
      errors: {
        reason: 'An error occurred. Please try again.',
      },
    })
  }
}

