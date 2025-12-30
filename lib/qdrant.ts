import { QdrantClient } from '@qdrant/js-client-rest'

/**
 * Initialize Qdrant client
 * 
 * Get your API key and URL from: https://cloud.qdrant.io/
 */
if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
  throw new Error('Missing QDRANT_URL or QDRANT_API_KEY environment variable')
}

export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
})

/**
 * Get Qdrant collection name
 * @param collectionName - Name of the collection (default: 'policy-index')
 * @returns Collection name string
 */
export function getCollectionName(collectionName: string = 'policy-index'): string {
  return collectionName
}

