import { NextRequest, NextResponse } from 'next/server'
import { answerFromPolicy } from '@/lib/policyRag'
import { verifySlackSignature } from '@/lib/slack'

/**
 * Slack slash command handler for /policy
 * 
 * When a user runs /policy Some question here, this endpoint:
 * 1. Extracts the question from the command text
 * 2. Calls the RAG policy-chat logic
 * 3. Returns a Slack-compatible text response
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
    const text = params.get('text') || ''

    if (!text.trim()) {
      return NextResponse.text(
        'Please provide a question. Usage: /policy What is the leave policy?'
      )
    }

    // Get answer from policy
    const result = await answerFromPolicy(text.trim())

    // Format response for Slack
    let response = 'According to the policy:\n\n' + result.answer

    // If the answer indicates it's not in the policy, adjust the response
    if (
      result.answer.includes("doesn't appear clearly") ||
      result.answer.includes('not defined') ||
      result.answer.includes('does not appear to be clearly defined')
    ) {
      response =
        "This doesn't appear clearly in the policy documents. Please consult with HR for clarification."
    }

    return NextResponse.text(response)
  } catch (error: any) {
    console.error('Error in policy-slack API:', error)
    return NextResponse.text(
      '❌ An error occurred while processing your question. Please try again later.',
      { status: 500 }
    )
  }
}

