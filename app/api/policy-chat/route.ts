import { NextRequest, NextResponse } from 'next/server'
import { answerFromPolicy } from '@/lib/policyRag'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

/**
 * Policy Chat API endpoint
 * 
 * POST /api/policy-chat
 * 
 * Request body:
 *   { question: string }
 * 
 * Response:
 *   { answer: string, chunks: { id: string, text: string }[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid 'question' field" },
        { status: 400 }
      )
    }

    const result = await answerFromPolicy(question)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('policy-chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

