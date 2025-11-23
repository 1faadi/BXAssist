import OpenAI from 'openai'

/**
 * OpenRouter API client configuration
 * 
 * OpenRouter provides access to multiple LLM models through a unified API.
 * This client is configured to use OpenRouter's endpoint.
 */
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('Missing OPENROUTER_API_KEY environment variable')
}

export const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    // Optional: uncomment if you want app attribution on OpenRouter
    // "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    // "X-Title": "Office Policy Assistant",
  },
})

