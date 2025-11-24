// app/api/slack/commands/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Slack sends x-www-form-urlencoded
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)

    const command = params.get('command')
    const triggerId = params.get('trigger_id')
    const userId = params.get('user_id')

    console.log('Slash command received', { command, userId })

    if (!triggerId) {
      return new NextResponse('Missing trigger_id', { status: 400 })
    }

    // Default leave date = tomorrow in YYYY-MM-DD
    const today = new Date()
    today.setDate(today.getDate() + 1)
    const defaultDate = today.toISOString().slice(0, 10)

    // Open Slack modal
    await slackClient.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'leave_request_modal',
        title: {
          type: 'plain_text',
          text: 'Leave Request',
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
            block_id: 'leave_date',
            label: {
              type: 'plain_text',
              text: 'Leave date',
            },
            element: {
              type: 'datepicker',
              action_id: 'value',
              initial_date: defaultDate,
            },
          },
          {
            type: 'input',
            block_id: 'leave_type',
            label: {
              type: 'plain_text',
              text: 'Leave type',
            },
            element: {
              type: 'static_select',
              action_id: 'value',
              placeholder: {
                type: 'plain_text',
                text: 'Select type',
              },
              options: [
                { text: { type: 'plain_text', text: 'Sick' }, value: 'sick' },
                { text: { type: 'plain_text', text: 'Casual' }, value: 'casual' },
                { text: { type: 'plain_text', text: 'Annual' }, value: 'annual' },
                { text: { type: 'plain_text', text: 'Half Day' }, value: 'half_day' },
                { text: { type: 'plain_text', text: 'Work from Home' }, value: 'wfh' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'reason',
            label: {
              type: 'plain_text',
              text: 'Reason',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              multiline: true,
            },
          },
        ],
      },
    })

    // Respond quickly (Slack just needs 200 OK)
    return new NextResponse('', { status: 200 })
  } catch (err) {
    console.error('Error in /api/slack/commands', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
