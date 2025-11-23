/**
 * Environment variable type definitions
 * These should be set in Vercel or your environment
 */
declare namespace NodeJS {
  interface ProcessEnv {
    // OpenRouter configuration (for embeddings and chat completions)
    OPENROUTER_API_KEY: string
    APP_URL?: string // Optional: for OpenRouter app attribution

    // Qdrant configuration
    QDRANT_URL: string
    QDRANT_API_KEY: string
    QDRANT_COLLECTION_NAME?: string // Optional: defaults to 'policy-index'

    // Slack configuration (optional, for future integration)
    SLACK_BOT_TOKEN?: string
    SLACK_SIGNING_SECRET?: string

    // Google Sheets configuration (optional, for future integration)
    SPREADSHEET_ID?: string
    GOOGLE_SERVICE_ACCOUNT_JSON?: string

    // Birthday cron token (optional, for future integration)
    BIRTHDAY_CRON_TOKEN?: string
  }
}

