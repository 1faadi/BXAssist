import { NextRequest, NextResponse } from 'next/server'
import { answerFromPolicy } from '@/lib/policyRag'
import { verifySlackSignature } from '@/lib/slack'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Slack slash command handler for /policy
 * 
 * Receives /policy slash command from Slack
 * Takes the text after the command as the question
 * Calls answerFromPolicy(question) function
 * Returns a plain text answer back to Slack
 */
export async function POST(req: NextRequest) {
  try {
    // Slack sends x-www-form-urlencoded, not JSON
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)

    // Optional: Verify Slack signature if SLACK_SIGNING_SECRET is set
    const signature = req.headers.get('x-slack-signature') || ''
    const timestamp = req.headers.get('x-slack-request-timestamp') || ''

    // Handle Slack URL verification challenge
    const challenge = params.get('challenge')
    if (challenge) {
      return NextResponse.json({ challenge })
    }

    // Verify signature if signing secret is configured
    if (process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(bodyText, signature, timestamp)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const token = params.get('token') // optional: legacy verification token
    const command = params.get('command') // e.g. "/policy"
    const text = params.get('text') || '' // the user's question
    const userId = params.get('user_id') // U123...
    const userName = params.get('user_name') // slack handle

    if (!command || command !== '/policy') {
      return new NextResponse('Unknown command', { status: 400 })
    }

    if (!text.trim()) {
      return new NextResponse(
        'Please provide a question, e.g. `/policy What is the probation period?`',
        { status: 200 }
      )
    }

    console.log(`📱 Slack /policy command from ${userName} (${userId}): "${text}"`)

    const result = await answerFromPolicy(text.trim())

    const header = `📘 *Policy answer for <@${userId}>:*\n`
    const body = result.answer

    // Slack slash commands accept plain text / markdown-style text
    return new NextResponse(`${header}\n${body}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (err) {
    console.error('❌ Slack /policy error:', err)
    return new NextResponse(
      '⚠️ Sorry, something went wrong while answering from the policy.',
      { status: 200 }
    )
  }
}

