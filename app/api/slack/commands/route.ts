// app/api/slack/commands/route.ts

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Slack sends x-www-form-urlencoded body
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)

    const command = params.get('command')
    const userId = params.get('user_id')
    const userName = params.get('user_name')
    const text = params.get('text')

    console.log('Slash command received', { command, userId, userName, text })

    // Simple response so we can confirm it works
    return NextResponse.json(
      {
        response_type: 'ephemeral',
        text: `Slash command received ✅\ncommand: ${command}\nuser: ${userName} (${userId})\ntext: ${text}`,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Error in /api/slack/commands', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

// Optional: block other methods
export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
