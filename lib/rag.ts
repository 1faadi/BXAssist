import OpenAI from 'openai'
import ragKB from '@/data/rag_kb.json'

/**
 * Type definition for a knowledge base item
 */
export type KBItem = {
  id: string
  text: string
  embedding: number[]
}

/**
 * Load the RAG knowledge base from the JSON file
 */
const knowledgeBase: KBItem[] = (Array.isArray(ragKB) ? ragKB : []) as KBItem[]

/**
 * Initialize OpenAI client
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score (0 to 1)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * Retrieve the most relevant context chunks for a given question
 * @param question - The user's question
 * @param topK - Number of top chunks to retrieve (default: 5)
 * @returns Array of KBItem objects sorted by relevance
 */
export async function retrieveContext(
  question: string,
  topK: number = 5
): Promise<KBItem[]> {
  // Check if knowledge base is empty
  if (knowledgeBase.length === 0) {
    return []
  }

  // Embed the question
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  })

  const questionEmbedding = embeddingResponse.data[0].embedding

  // Calculate similarity with all KB items
  const similarities = knowledgeBase.map((item) => ({
    item,
    similarity: cosineSimilarity(questionEmbedding, item.embedding),
  }))

  // Sort by similarity (descending) and return top K
  similarities.sort((a, b) => b.similarity - a.similarity)

  return similarities.slice(0, topK).map((s) => s.item)
}

/**
 * Answer a question based on the policy knowledge base
 * @param question - The user's question
 * @returns Object containing the answer text and source IDs
 */
export async function answerFromPolicy(question: string): Promise<{
  answer: string
  sources: string[]
}> {
  // Retrieve relevant context
  const contextItems = await retrieveContext(question, 5)

  if (contextItems.length === 0) {
    return {
      answer:
        "This doesn't appear clearly in the policy documents. Please consult with HR for clarification.",
      sources: [],
    }
  }

  // Build context text from retrieved items
  const contextText = contextItems.map((item) => item.text).join('\n\n')

  // Create system prompt that instructs the model to only use provided context
  const systemPrompt = `You are a helpful assistant that answers questions based on company policy documents. 
You must ONLY answer using the provided context. If the context does not contain enough information to answer the question, 
you must say: "This doesn't appear clearly in the policy documents. Please consult with HR for clarification."

Do not make up information or use knowledge outside of the provided context.`

  // Call OpenAI chat completion
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Context from policy documents:\n\n${contextText}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })

  const answer = completion.choices[0]?.message?.content || "This doesn't appear clearly in the policy documents."

  // Extract source IDs
  const sources = contextItems.map((item) => item.id)

  return {
    answer,
    sources,
  }
}

