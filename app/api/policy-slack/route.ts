import { NextRequest, NextResponse } from 'next/server'
import { answerFromPolicy } from '@/lib/policyRag'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Slack slash command handler for /policy
 * 
 * Uses Slack's delayed response pattern to avoid operation_timeout:
 * 1. Immediately responds with "thinking..." message
 * 2. Processes RAG asynchronously
 * 3. Posts final answer to Slack via response_url
 */
export async function POST(req: NextRequest) {
  // 1) Parse Slack's x-www-form-urlencoded body
  const bodyText = await req.text()
  const params = new URLSearchParams(bodyText)

  const command = params.get('command')
  const question = (params.get('text') || '').trim()
  const userId = params.get('user_id') || 'unknown'
  const userName = params.get('user_name') || 'user'
  const responseUrl = params.get('response_url')

  console.log('[/policy] incoming', { command, userId, userName, responseUrl })

  if (command !== '/policy') {
    return new NextResponse('Unknown command', { status: 400 })
  }

  // If user sent just `/policy`
  if (!question) {
    return new NextResponse(
      "Please provide a question, e.g. `/policy What is the probation period?`",
      { status: 200, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  if (!responseUrl) {
    console.error('[/policy] Missing response_url in Slack payload')
    // We still answer synchronously as a fallback
    const fallback = await answerFromPolicy(question)
    return new NextResponse(
      `📘 *Policy answer for <@${userId}>:*\n\n${fallback.answer}`,
      { status: 200, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  // 2) Fire-and-forget async work to compute answer and POST to response_url
  ;(async () => {
    try {
      console.log('[/policy] starting background RAG for', { userId })

      const result = await answerFromPolicy(question)

      const payload = {
        response_type: 'ephemeral', // only visible to the user
        text: `📘 *Policy answer for <@${userId}>:*\n\n${result.answer}`,
      }

      const res = await fetch(responseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(
          '[/policy] response_url POST failed',
          res.status,
          res.statusText,
          text
        )
      } else {
        console.log('[/policy] response_url POST ok')
      }
    } catch (err) {
      console.error('[/policy] background error', err)
      // Try to tell the user something went wrong
      try {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text:
              '⚠️ Sorry, something went wrong while answering from the policy. Please try again.',
          }),
        })
      } catch (e) {
        console.error('[/policy] failed to send error via response_url', e)
      }
    }
  })() // no await → don't delay the HTTP response

  // 3) Immediate "thinking..." reply so Slack doesn't timeout
  const thinkingMessage = `Got it <@${userId}>, thinking about your policy question... I'll reply here in a moment.`

  return new NextResponse(thinkingMessage, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}
