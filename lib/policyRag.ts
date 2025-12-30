import { openrouterClient } from './openrouter'
import { qdrantClient, getCollectionName } from './qdrant'

/**
 * Type definition for a policy chunk
 */
export type PolicyChunk = {
  id: string
  text: string
}

/**
 * Type definition for a policy answer
 */
export type PolicyAnswer = {
  answer: string
  chunks: PolicyChunk[]
}

/**
 * Retrieve the top K most relevant policy chunks from Qdrant
 * Uses vector similarity search with embeddings
 * @param question - The user's question
 * @param topK - Number of top chunks to retrieve (default: 5)
 * @returns Array of PolicyChunk objects sorted by relevance
 */
export async function retrieveTopChunks(
  question: string,
  topK = 5
): Promise<PolicyChunk[]> {
  try {
    console.log(`🔍 Retrieving chunks for question: "${question}"`)

    // Generate embedding for the question using OpenRouter
    const embeddingResponse = await openrouterClient.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: question,
    })

    if (!embeddingResponse.data || embeddingResponse.data.length === 0) {
      console.error('❌ No embedding generated')
      return []
    }

    const questionEmbedding = embeddingResponse.data[0].embedding
    console.log(`✅ Generated embedding (dimension: ${questionEmbedding.length})`)

    // Query Qdrant
    const collectionName = getCollectionName(
      process.env.QDRANT_COLLECTION_NAME || 'policy-index'
    )

    console.log(`🔎 Searching collection: ${collectionName}`)

    const searchResult = await qdrantClient.search(collectionName, {
      vector: questionEmbedding,
      limit: topK,
      with_payload: true,
      score_threshold: 0.3, // Minimum similarity score (0-1)
    })

    console.log(`📊 Found ${searchResult.length} results from Qdrant`)

    if (searchResult.length === 0) {
      console.warn('⚠️ No results found in Qdrant collection')
      return []
    }

    // Log scores for debugging
    searchResult.forEach((result: any, idx: number) => {
      console.log(
        `  Result ${idx + 1}: Score=${result.score?.toFixed(4)}, ID=${result.id}`
      )
    })

    // Extract chunks from Qdrant results
    const chunks: PolicyChunk[] = searchResult
      .filter((result: any) => {
        const hasPayload = result.payload && result.payload.text
        if (!hasPayload) {
          console.warn(`⚠️ Result ${result.id} missing payload or text`)
        }
        return hasPayload
      })
      .map((result: any) => ({
        id: result.id.toString(),
        text: result.payload?.text as string,
      }))

    console.log(`✅ Retrieved ${chunks.length} valid chunks`)
    return chunks
  } catch (error) {
    console.error('❌ Error retrieving chunks from Qdrant:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Stack:', error.stack)
    }
    return []
  }
}

/**
 * Answer a question based on the policy knowledge base using OpenRouter
 * @param question - The user's question
 * @returns Object containing the answer text and relevant chunks
 */
export async function answerFromPolicy(question: string): Promise<PolicyAnswer> {
  console.log(`\n📝 Processing question: "${question}"`)

  // Retrieve chunks for context (using k=4 for better balance)
  const topChunks = await retrieveTopChunks(question, 4)

  if (topChunks.length === 0) {
    console.warn('⚠️ No chunks retrieved, returning default response')
    return {
      answer:
        "This does not appear to be clearly defined in the current policy document. Please consult with HR for clarification.",
      chunks: [],
    }
  }

  console.log(`📚 Building context from ${topChunks.length} chunks`)

  // Build context text from retrieved chunks with better formatting
  const contextText = topChunks
    .map((c, idx) => {
      const textPreview = c.text.substring(0, 100) + '...'
      console.log(`  Chunk ${idx + 1} (ID: ${c.id}): ${textPreview}`)
      return `[Policy Section ${idx + 1}]\n${c.text}`
    })
    .join('\n\n---\n\n')

  console.log(`📄 Context length: ${contextText.length} characters`)

  const systemPrompt = `You are BXTrack Solutions' official company policy assistant, specialized in helping employees understand and navigate company policies, procedures, and workplace guidelines.

**CRITICAL INSTRUCTIONS:**

You MUST answer questions based STRICTLY and ONLY on the policy text provided in the CONTEXT section below. You are a RAG (Retrieval-Augmented Generation) system - you can ONLY use information that is explicitly present in the provided context.

**RESPONSE RULES:**

1. **Use Only Provided Context:**
   - Rely EXCLUSIVELY on the policy text in the CONTEXT section below
   - Do NOT use any external knowledge, training data, or assumptions
   - Do NOT invent rules, policies, or procedures not explicitly stated in the context
   - If information is not in the context, you do NOT know it

2. **When Information is Available in Context:**
   - Provide clear, accurate answers based directly on the context
   - Quote or reference specific policy sections when relevant
   - Synthesize information from multiple context sections if needed
   - Use a professional yet friendly tone appropriate for workplace communication
   - Format responses clearly with plain text (avoid markdown symbols like #, *, etc.)

3. **When Information is NOT Available in Context:**
   - If the answer is not clearly stated or cannot be reasonably inferred from the provided context, you MUST respond with:
     "This does not appear to be clearly defined in the current policy document. Please consult with HR for clarification."
   - Do NOT guess, assume, or provide partial information
   - Do NOT say "based on general knowledge" or similar phrases
   - Be honest about the limitation

4. **Context Quality Assessment:**
   - If the context appears incomplete or unclear, acknowledge this limitation
   - Always prioritize accuracy over completeness
   - If multiple policy sections are relevant, synthesize them clearly without contradiction

**COMPANY CONTEXT:**
- BXTrack Solutions operates on a 5-day work week (Monday-Friday)
- Office hours: 9:00 AM to 6:00 PM with a break from 1:20 PM to 2:20 PM
- For HR-related questions not covered in the policy, direct users to: hr@bxtrack.com

**POLICY CONTEXT (Use ONLY this information to answer questions):**

${contextText}

**FINAL REMINDERS:**
- Answer ONLY from the policy context provided above
- If the answer isn't in the context, explicitly state that it's not defined in the policy
- Never invent or assume policy details
- Be helpful but always accurate and honest about limitations
- If you're unsure, direct users to HR rather than guessing`.trim()

  console.log('🤖 Sending request to OpenRouter...')
  console.log(`📤 System prompt length: ${systemPrompt.length} characters`)
  console.log(`📤 User question: "${question}"`)

  try {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Based on the policy context provided above, please answer the following question: ${question}`,
      },
    ]

    const completion = await openrouterClient.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages,
      temperature: 0.4, // Slightly higher for more natural responses
      max_tokens: 1024, // Increased for more detailed answers
    })

    const answer =
      completion.choices[0]?.message?.content?.toString() ??
      'Sorry, I could not generate an answer.'

    if (!answer || answer.trim().length === 0) {
      console.error('❌ Empty answer from OpenRouter')
      return {
        answer:
          'Sorry, I could not generate an answer. Please try rephrasing your question or contact HR for assistance.',
        chunks: topChunks,
      }
    }

    console.log(`✅ Generated answer (${answer.length} characters)`)
    console.log(`📋 Answer preview: ${answer.substring(0, 150)}...`)

    return { answer, chunks: topChunks }
  } catch (error) {
    console.error('❌ Error calling OpenRouter:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
    return {
      answer:
        'An error occurred while processing your question. Please try again or contact HR for assistance.',
      chunks: topChunks,
    }
  }
}

