/**
 * Environment Configuration
 * 
 * Centralized environment variable access with validation.
 * Throws clear errors if required variables are missing.
 * 
 * Note: This module is lazy-loaded to avoid build-time errors
 * when environment variables are not set during build.
 */

function getEnv(key: string, required = true): string {
  const value = process.env[key]
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value || ''
}

// Lazy getter functions to avoid build-time errors
export const env = {
  // Slack configuration
  get slack() {
    return {
      botToken: getEnv('SLACK_BOT_TOKEN'),
      signingSecret: getEnv('SLACK_SIGNING_SECRET'),
      leaveChannelId: getEnv('SLACK_LEAVE_CHANNEL_ID'),
    }
  },

  // Google Sheets configuration
  get googleSheets() {
    return {
      clientEmail: getEnv('GOOGLE_SHEETS_CLIENT_EMAIL', false),
      privateKey: getEnv('GOOGLE_SHEETS_PRIVATE_KEY', false),
      spreadsheetId: getEnv('GOOGLE_SHEETS_SPREADSHEET_ID', false),
    }
  },

  // OpenRouter (for policy RAG)
  get openRouter() {
    return {
      apiKey: getEnv('OPENROUTER_API_KEY', false),
    }
  },

  // Qdrant (for policy RAG)
  get qdrant() {
    return {
      url: getEnv('QDRANT_URL', false),
      apiKey: getEnv('QDRANT_API_KEY', false),
      collectionName: getEnv('QDRANT_COLLECTION_NAME', false) || 'policy-index',
    }
  },
}

