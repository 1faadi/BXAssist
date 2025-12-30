/**
 * Build Policy Index Script
 * 
 * This script reads the PDF file from data/policies/, extracts text,
 * chunks it, generates embeddings, and uploads to Qdrant vector database.
 * 
 * Usage:
 *   npx tsx scripts/buildPolicyIndex.mts
 *   or
 *   npm run build-policy-index
 * 
 * Requirements:
 *   - pdf-parse package must be installed
 *   - OPENROUTER_API_KEY environment variable (for embeddings and chat)
 *   - QDRANT_URL environment variable
 *   - QDRANT_API_KEY environment variable
 *   - QDRANT_COLLECTION_NAME environment variable (optional, defaults to 'policy-index')
 *   - PDF file should be placed in data/policies/ (e.g., "D1_ Company Policies .pdf")
 *   - The script will look for any .pdf file in that directory
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import pdfParse from 'pdf-parse'
import OpenAI from 'openai'
import { QdrantClient } from '@qdrant/js-client-rest'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local if it exists
config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Type definition for a policy chunk
 */
type PolicyChunk = {
  id: string
  text: string
  embedding?: number[]
}

/**
 * Initialize OpenRouter client for embeddings
 */
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('Missing OPENROUTER_API_KEY environment variable')
}

const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

/**
 * Clean extracted text from PDF
 * Normalizes whitespace and removes excessive line breaks
 * @param text - Raw text from PDF
 * @returns Cleaned text
 */
function cleanText(text: string): string {
  // Replace multiple newlines with single newline
  let cleaned = text.replace(/\n{3,}/g, '\n\n')
  // Replace multiple spaces with single space
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ')
  // Trim whitespace
  return cleaned.trim()
}

/**
 * Chunk text into segments of approximately 500-800 characters
 * Splits on sentence boundaries to keep chunks coherent
 * @param text - The text to chunk
 * @param minChunkSize - Minimum chunk size in characters (default: 500)
 * @param maxChunkSize - Maximum chunk size in characters (default: 800)
 * @returns Array of text chunks
 */
function chunkText(
  text: string,
  minChunkSize: number = 500,
  maxChunkSize: number = 800
): string[] {
  const chunks: string[] = []

  // Split by sentences (period, exclamation, question mark followed by space or newline)
  const sentences = text.split(/(?<=[.!?])\s+/)

  let currentChunk = ''

  for (const sentence of sentences) {
    // If adding this sentence would exceed max size, save current chunk and start new one
    if (
      currentChunk.length + sentence.length > maxChunkSize &&
      currentChunk.length >= minChunkSize
    ) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter((chunk) => chunk.length > 0)
}

/**
 * Read PDF file and extract text
 * @param filePath - Path to the PDF file
 * @returns Extracted text content
 */
async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Find PDF files in the policies directory
 * @returns Array of PDF file paths
 */
async function findPDFFiles(): Promise<string[]> {
  const policiesDir = join(process.cwd(), 'data', 'policies')

  try {
    const files = await readdir(policiesDir)
    const pdfFiles = files.filter((file) => file.toLowerCase().endsWith('.pdf'))

    if (pdfFiles.length === 0) {
      return []
    }

    return pdfFiles.map((file) => join(policiesDir, file))
  } catch (error) {
    console.error('Error reading policies directory:', error)
    return []
  }
}

/**
 * Main function to build the policy index
 */
async function buildPolicyIndex() {
  console.log('Building policy index from PDF and uploading to Qdrant...')

  // Check for required environment variables
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is not set')
    process.exit(1)
  }

  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    console.error('Error: QDRANT_URL and QDRANT_API_KEY environment variables must be set')
    process.exit(1)
  }

  // Find PDF files
  const pdfFiles = await findPDFFiles()

  if (pdfFiles.length === 0) {
    console.error('Error: No PDF files found in data/policies/')
    console.error('Please place your policy PDF file in data/policies/')
    process.exit(1)
  }

  if (pdfFiles.length > 1) {
    console.warn(
      `Warning: Multiple PDF files found. Using the first one: ${pdfFiles[0]}`
    )
  }

  const pdfPath = pdfFiles[0]
  console.log(`Reading PDF: ${pdfPath}`)

  // Extract text from PDF
  let fullText: string
  try {
    fullText = await extractTextFromPDF(pdfPath)
    console.log(`Extracted ${fullText.length} characters from PDF`)
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    process.exit(1)
  }

  // Clean the text
  const cleanedText = cleanText(fullText)
  console.log(`Cleaned text: ${cleanedText.length} characters`)

  // Chunk the text
  const textChunks = chunkText(cleanedText)
  console.log(`Created ${textChunks.length} chunks`)

  // Create policy chunks with IDs
  const policyChunks: PolicyChunk[] = textChunks.map((text, index) => ({
    id: `chunk_${String(index + 1).padStart(4, '0')}`,
    text,
  }))

  console.log(`\nGenerating embeddings for ${policyChunks.length} chunks...`)

  // Initialize Qdrant client
  const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
  })

  const collectionName = process.env.QDRANT_COLLECTION_NAME || 'policy-index'

  // Check if collection exists, create if it doesn't
  console.log(`Checking collection: ${collectionName}...`)
  try {
    const collections = await qdrantClient.getCollections()
    const collectionExists = collections.collections.some(
      (c) => c.name === collectionName
    )

    if (!collectionExists) {
      console.log(`Creating collection: ${collectionName}...`)
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 1536, // text-embedding-3-small dimension
          distance: 'Cosine',
        },
      })
      console.log('Collection created.')
    } else {
      console.log('Collection already exists.')
      // Optionally clear existing points (uncomment if needed)
      // console.log('Clearing existing vectors...')
      // await qdrantClient.delete(collectionName, {
      //   filter: {
      //     must: [],
      //   },
      // })
      // console.log('Existing vectors cleared.')
    }
  } catch (error) {
    console.error('Error checking/creating collection:', error)
    process.exit(1)
  }

  // Generate embeddings in batches
  const batchSize = 100

  // Process chunks in batches
  for (let i = 0; i < policyChunks.length; i += batchSize) {
    const batch = policyChunks.slice(i, i + batchSize)
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        policyChunks.length / batchSize
      )}...`
    )

    // Generate embeddings for this batch using OpenRouter
    const texts = batch.map((chunk) => chunk.text)
    const embeddingResponse = await openrouterClient.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: texts,
    })

    // Prepare points for Qdrant
    // Extract numeric ID from chunk ID (e.g., "chunk_0001" -> 1)
    const points = batch.map((chunk, idx) => {
      const numericId = parseInt(chunk.id.replace('chunk_', ''), 10)
      return {
        id: numericId,
        vector: embeddingResponse.data[idx].embedding,
        payload: {
          text: chunk.text,
          chunk_id: chunk.id,
        },
      }
    })

    // Upsert to Qdrant
    await qdrantClient.upsert(collectionName, {
      wait: true,
      points: points,
    })
    console.log(`  ✓ Uploaded ${points.length} vectors to Qdrant`)

    // Small delay to avoid rate limits
    if (i + batchSize < policyChunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  console.log(`\n✅ Policy index uploaded to Qdrant successfully!`)
  console.log(`   Total chunks: ${policyChunks.length}`)
  console.log(`   Average chunk size: ${Math.round(
    policyChunks.reduce((sum, c) => sum + c.text.length, 0) / policyChunks.length
  )} characters`)
  console.log(`   Collection name: ${collectionName}`)
}

// Run the script
buildPolicyIndex().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
