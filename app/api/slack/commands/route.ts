/**
 * Slack Slash Commands Handler
 * 
 * This endpoint handles Slack slash commands:
 * - /leave-req - Opens leave request modal
 * - /daily-report - Opens daily progress report modal
 * - /check-in - Returns ephemeral message with button to open check-in page (office network only)
 * - /checkout - Returns ephemeral message with button to open checkout page (office network only)
 * 
 * Slack Configuration:
 * - Slash command URL: https://your-domain.vercel.app/api/slack/commands
 * - Method: POST
 */

import { NextRequest, NextResponse } from 'next/server'
import { slackClient } from '@/lib/slackClient'
import { generateSignedAttendanceUrl } from '@/lib/attendanceSecurity'

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
    const channelId = params.get('channel_id')

    console.log('Slash command received', { command, userId })

    const attendanceChannelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID
    const isAttendanceChannel = channelId === attendanceChannelId

    // Handle /check-in command
    if (command === '/check-in') {
      if (!userId) {
        return NextResponse.json(
          { error: 'Missing user_id' },
          { status: 400 }
        )
      }

      if (!isAttendanceChannel) {
        return NextResponse.json({
          response_type: 'ephemeral',
          text: `Please use \`/check-in\` in the designated attendance channel.`,
        })
      }

      const url = generateSignedAttendanceUrl({
        type: 'checkin',
        slackUserId: userId,
      })

      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Click the button below to complete your check-in (office network only).',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Click the button below to complete your check-in (available only on the office network).',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open check-in page' },
                url,
              },
            ],
          },
        ],
      })
    }

    // Handle /checkout command
    if (command === '/checkout') {
      if (!userId) {
        return NextResponse.json(
          { error: 'Missing user_id' },
          { status: 400 }
        )
      }

      if (!isAttendanceChannel) {
        return NextResponse.json({
          response_type: 'ephemeral',
          text: `Please use \`/checkout\` in the designated attendance channel.`,
        })
      }

      const url = generateSignedAttendanceUrl({
        type: 'checkout',
        slackUserId: userId,
      })

      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Click the button below to complete your checkout (office network only).',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Click the button below to complete your checkout (available only on the office network).',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open check-out page' },
                url,
              },
            ],
          },
        ],
      })
    }

    // Commands that require trigger_id (modals)
    if (!triggerId) {
      return new NextResponse('Missing trigger_id', { status: 400 })
    }

    // Handle /leave-req command
    if (command === '/leave-req') {
      // Default leave dates = tomorrow in YYYY-MM-DD
      const today = new Date()
      today.setDate(today.getDate() + 1)
      const defaultFrom = today.toISOString().slice(0, 10)
      // default To = same as From for now
      const defaultTo = defaultFrom

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
              block_id: 'leave_from_date',
              label: {
                type: 'plain_text',
                text: 'Leave from (start date)',
              },
              element: {
                type: 'datepicker',
                action_id: 'value',
                initial_date: defaultFrom,
              },
            },
            {
              type: 'input',
              block_id: 'leave_to_date',
              label: {
                type: 'plain_text',
                text: 'Leave to (end date)',
              },
              element: {
                type: 'datepicker',
                action_id: 'value',
                initial_date: defaultTo,
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
    }

    // Handle /overtime-req command
    if (command === '/overtime-req') {
      await slackClient.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'overtime_request_modal',
          title: {
            type: 'plain_text',
            text: 'Overtime Request',
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
              block_id: 'ot_project',
              label: {
                type: 'plain_text',
                text: 'Project Name',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
              },
            },
            {
              type: 'input',
              block_id: 'ot_hours',
              label: {
                type: 'plain_text',
                text: 'Hours',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g. 2',
                },
              },
            },
            {
              type: 'input',
              optional: true,
              block_id: 'ot_minutes',
              label: {
                type: 'plain_text',
                text: 'Minutes (optional)',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g. 30 (default 0)',
                },
              },
            },
            {
              type: 'input',
              block_id: 'ot_assigned_by',
              label: {
                type: 'plain_text',
                text: 'Assigned by',
              },
              element: {
                type: 'users_select',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select who assigned this overtime',
                },
              },
            },
            {
              type: 'input',
              block_id: 'ot_reason',
              optional: true,
              label: {
                type: 'plain_text',
                text: 'Task / Reason (optional)',
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
    }

    // Handle /short-leave-req command
    if (command === '/short-leave-req') {
      // Get today's date in PKT (YYYY-MM-DD)
      const { datePk, timePkHHmm } = await import('@/lib/timePk').then((m) => m.nowPk())
      
      // Round time to next 5 minutes and ensure it's within 9:00 AM - 6:00 PM range
      const [hours, minutes] = timePkHHmm.split(':').map(Number)
      const roundedMinutes = Math.ceil(minutes / 5) * 5
      let roundedHours = roundedMinutes >= 60 ? (hours + 1) % 24 : hours
      const roundedMins = roundedMinutes >= 60 ? 0 : roundedMinutes
      
      // Clamp to allowed range: 9:00 AM (09:00) to 6:00 PM (18:00)
      const timeInMinutes = roundedHours * 60 + roundedMins
      const minTime = 9 * 60 // 09:00 = 540 minutes
      const maxTime = 18 * 60 // 18:00 = 1080 minutes
      
      let initialTime: string
      if (timeInMinutes < minTime) {
        // Before 9:00 AM, set to 9:00 AM
        initialTime = '09:00'
      } else if (timeInMinutes > maxTime) {
        // After 6:00 PM, set to 6:00 PM
        initialTime = '18:00'
      } else {
        // Within range, use rounded time
        initialTime = `${String(roundedHours).padStart(2, '0')}:${String(roundedMins).padStart(2, '0')}`
      }

      await slackClient.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'short_leave_request_modal',
          title: {
            type: 'plain_text',
            text: 'Short Leave Request',
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
              block_id: 'sl_from_date',
              label: {
                type: 'plain_text',
                text: 'Date from',
              },
              element: {
                type: 'datepicker',
                action_id: 'value',
                initial_date: datePk,
              },
            },
            {
              type: 'input',
              block_id: 'sl_to_date',
              label: {
                type: 'plain_text',
                text: 'Date to',
              },
              element: {
                type: 'datepicker',
                action_id: 'value',
                initial_date: datePk,
              },
            },
            {
              type: 'input',
              block_id: 'sl_time_from',
              label: {
                type: 'plain_text',
                text: 'Time from',
              },
              element: {
                type: 'timepicker',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select time',
                },
                initial_time: initialTime,
              },
            },
            {
              type: 'input',
              block_id: 'sl_time_to',
              label: {
                type: 'plain_text',
                text: 'Time to',
              },
              element: {
                type: 'timepicker',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select time',
                },
              },
            },
            {
              type: 'input',
              block_id: 'sl_reason',
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
    }

    // Handle /daily-report command
    if (command === '/daily-report') {
      await slackClient.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'daily_report_modal',
          title: {
            type: 'plain_text',
            text: 'Daily Report',
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
              block_id: 'dr_project_name',
              label: {
                type: 'plain_text',
                text: 'Project Name',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
              },
            },
            {
              type: 'input',
              block_id: 'dr_hours',
              label: {
                type: 'plain_text',
                text: 'Hours',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
              },
            },
            {
              type: 'input',
              block_id: 'dr_reporting_to',
              label: {
                type: 'plain_text',
                text: 'Reporting To',
              },
              element: {
                type: 'multi_users_select',
                action_id: 'value',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select reporting managers',
                },
              },
            },
            {
              type: 'input',
              block_id: 'dr_progress',
              label: {
                type: 'plain_text',
                text: 'Progress / Tasks done today',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: '• Task 1\n• Task 2\n• Task 3',
                },
              },
            },
            {
              type: 'input',
              block_id: 'dr_tomorrow',
              label: {
                type: 'plain_text',
                text: "Tomorrow's plan (optional)",
              },
              optional: true,
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: '• Plan item 1\n• Plan item 2',
                },
              },
            },
          ],
        },
      })

      // Respond quickly (Slack just needs 200 OK)
      return new NextResponse('', { status: 200 })
    }

    // Handle /standup command
    if (command === '/standup') {
      await slackClient.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'standup_modal',
          title: {
            type: 'plain_text',
            text: 'Standup',
          },
          submit: {
            type: 'plain_text',
            text: 'Send',
          },
          close: {
            type: 'plain_text',
            text: 'Cancel',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'su_project',
              label: {
                type: 'plain_text',
                text: 'Project Name',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
              },
            },
            {
              type: 'input',
              block_id: 'su_task',
              label: {
                type: 'plain_text',
                text: "Today's Task",
              },
              element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: '• Task 1\n• Task 2',
                },
              },
            },
          ],
        },
      })

      // Respond quickly (Slack just needs 200 OK)
      return new NextResponse('', { status: 200 })
    }

    // Unknown command
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `Unknown command: ${command}. Available commands: /check-in, /checkout, /leave-req, /daily-report, /overtime-req, /short-leave-req, /standup`,
    })
  } catch (err) {
    console.error('Error in /api/slack/commands', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
