import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack/verifyRequest'
import { slackClient } from '@/lib/slack/client'
import { env } from '@/lib/env'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Slack Slash Commands Handler
 * 
 * This endpoint handles Slack slash commands.
 * 
 * Slack Configuration:
 * - Slash command URL: https://your-domain.vercel.app/api/slack/commands
 * - Method: POST
 * 
 * Supported commands:
 * - /leave - Opens leave request modal
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('x-slack-signature') || ''
    const timestamp = req.headers.get('x-slack-request-timestamp') || ''

    // Parse the form-encoded body
    const params = new URLSearchParams(rawBody)

    // Handle Slack URL verification challenge
    const challenge = params.get('challenge')
    if (challenge) {
      return NextResponse.json({ challenge })
    }

    // Verify Slack signature
    if (!verifySlackSignature(rawBody, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const command = params.get('command')
    const triggerId = params.get('trigger_id')
    const userId = params.get('user_id')
    const userName = params.get('user_name')

    if (!command || !triggerId) {
      return NextResponse.json(
        { error: 'Missing command or trigger_id' },
        { status: 400 }
      )
    }

    // Handle /leave command
    if (command === '/leave') {
      // Calculate default date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const defaultDate = tomorrow.toISOString().split('T')[0] // YYYY-MM-DD

      const modalView = {
        type: 'modal' as const,
        callback_id: 'leave_request_modal',
        title: {
          type: 'plain_text' as const,
          text: 'Request Leave',
        },
        submit: {
          type: 'plain_text' as const,
          text: 'Submit',
        },
        close: {
          type: 'plain_text' as const,
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'leave_date',
            element: {
              type: 'datepicker' as const,
              action_id: 'value',
              initial_date: defaultDate,
              placeholder: {
                type: 'plain_text' as const,
                text: 'Select date',
              },
            },
            label: {
              type: 'plain_text' as const,
              text: 'Leave Date',
            },
          },
          {
            type: 'input' as const,
            block_id: 'leave_type',
            element: {
              type: 'static_select' as const,
              action_id: 'value',
              placeholder: {
                type: 'plain_text' as const,
                text: 'Select leave type',
              },
              options: [
                {
                  text: {
                    type: 'plain_text' as const,
                    text: 'Sick',
                  },
                  value: 'Sick',
                },
                {
                  text: {
                    type: 'plain_text' as const,
                    text: 'Casual',
                  },
                  value: 'Casual',
                },
                {
                  text: {
                    type: 'plain_text' as const,
                    text: 'Annual',
                  },
                  value: 'Annual',
                },
                {
                  text: {
                    type: 'plain_text' as const,
                    text: 'Half Day',
                  },
                  value: 'Half Day',
                },
                {
                  text: {
                    type: 'plain_text' as const,
                    text: 'Work from Home',
                  },
                  value: 'Work from Home',
                },
              ],
            },
            label: {
              type: 'plain_text' as const,
              text: 'Leave Type',
            },
          },
          {
            type: 'input' as const,
            block_id: 'reason',
            element: {
              type: 'plain_text_input' as const,
              action_id: 'value',
              multiline: true,
              placeholder: {
                type: 'plain_text' as const,
                text: 'Reason for leave...',
              },
            },
            label: {
              type: 'plain_text' as const,
              text: 'Reason',
            },
          },
        ],
      }

      try {
        await slackClient.views.open({
          trigger_id: triggerId,
          view: modalView,
        })

        // Return 200 OK immediately (Slack requires this)
        return new NextResponse('', { status: 200 })
      } catch (error: any) {
        console.error('Error opening leave modal:', error)
        return NextResponse.json(
          { error: 'Failed to open modal' },
          { status: 500 }
        )
      }
    }

    // Unknown command
    return NextResponse.json(
      { error: `Unknown command: ${command}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error in slash commands handler:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

