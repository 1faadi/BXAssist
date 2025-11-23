import { NextRequest, NextResponse } from 'next/server'
import { answerFromPolicy } from '@/lib/policyRag'
import { verifySlackSignature } from '@/lib/slack'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Slack slash command handler for /policy
 * 
 * Uses Slack's delayed response pattern to avoid operation_timeout:
 * 1. Immediately responds with "thinking..." message
 * 2. Processes RAG asynchronously
 * 3. Posts final answer to Slack via response_url
 * 
 * Receives /policy slash command from Slack
 * Takes the text after the command as the question
 * Calls answerFromPolicy(question) function
 * Returns answer via response_url (delayed response)
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

    // Extract Slack payload fields
    const token = params.get('token') // optional: legacy verification token
    const command = params.get('command') // e.g. "/policy"
    const text = params.get('text') || '' // the user's question
    const userId = params.get('user_id') // U123...
    const userName = params.get('user_name') // slack handle
    const responseUrl = params.get('response_url') // URL to post delayed response

    // Validate command
    if (!command || command !== '/policy') {
      return new NextResponse('Unknown command', { status: 400 })
    }

    // If no question provided, return immediate helpful message
    if (!text.trim()) {
      return new NextResponse(
        'Please provide a question after the command, e.g. `/policy What is the probation period?`',
        {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }
      )
    }

    // Validate response_url is present (required for delayed response)
    if (!responseUrl) {
      console.error('❌ Missing response_url in Slack payload')
      return new NextResponse(
        'Error: Missing response_url. Please configure your Slack app correctly.',
        { status: 400 }
      )
    }

    console.log(`📱 Slack /policy command from ${userName} (${userId}): "${text}"`)

    // IMMEDIATE RESPONSE: Return "thinking..." message right away to avoid timeout
    // This is what Slack shows immediately to the user
    const immediateResponse = `Got it <@${userId}>, thinking about your policy question… I'll reply here in a moment.`

    // FIRE-AND-FORGET: Start async task to process RAG and post answer via response_url
    // Note: On serverless platforms like Vercel, the runtime typically allows async work
    // to complete even after the HTTP response is sent, as long as the function doesn't
    // terminate immediately. This is a best-effort pattern.
    void (async () => {
      try {
        console.log(`🤖 Processing RAG for question: "${text}"`)

        // Call the RAG function to get the answer
        const result = await answerFromPolicy(text.trim())

        // Format the final answer for Slack
        const header = `📘 *Policy answer for <@${userId}>:*\n\n`
        const answerText = result.answer

        // Post the answer to Slack via response_url as an ephemeral message
        // Ephemeral means only the user who ran the command will see it
        const slackPayload = {
          response_type: 'ephemeral',
          text: `${header}${answerText}`,
        }

        console.log(`📤 Posting answer to Slack via response_url`)

        const response = await fetch(responseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(slackPayload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(
            `❌ Failed to post to response_url: ${response.status} ${errorText}`
          )
        } else {
          console.log(`✅ Successfully posted answer to Slack`)
        }
      } catch (err) {
        console.error('❌ Error in policy-slack async task:', err)

        // Try to post error message to Slack via response_url
        try {
          const errorPayload = {
            response_type: 'ephemeral',
            text: `⚠️ Sorry, something went wrong while answering from the policy. Please try again.`,
          }

          await fetch(responseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(errorPayload),
          })
        } catch (fetchError) {
          console.error('❌ Failed to post error message to Slack:', fetchError)
        }
      }
    })()

    // Return immediate response to Slack (this happens synchronously)
    return new NextResponse(immediateResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (err) {
    console.error('❌ Slack /policy route error:', err)
    return new NextResponse(
      '⚠️ Sorry, something went wrong while processing your request.',
      { status: 200 }
    )
  }
}
