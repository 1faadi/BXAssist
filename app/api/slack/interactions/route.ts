// app/api/slack/interactions/route.ts

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)
    const payload = params.get('payload')

    if (!payload) {
      return new NextResponse('Missing payload', { status: 400 })
    }

    const parsed = JSON.parse(payload)

    console.log('Slack interaction payload:', JSON.stringify(parsed, null, 2))

    // For now, just acknowledge
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error in /api/slack/interactions', err)
    return new NextResponse('Server error', { status: 500 })
  }
}

export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
