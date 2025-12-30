/**
 * Environment variable type definitions
 * These should be set in Vercel or your environment
 */
declare namespace NodeJS {
  interface ProcessEnv {
    // OpenRouter configuration (for embeddings and chat completions)
    OPENROUTER_API_KEY?: string
    APP_URL?: string // Optional: for OpenRouter app attribution

    // Qdrant configuration
    QDRANT_URL?: string
    QDRANT_API_KEY?: string
    QDRANT_COLLECTION_NAME?: string // Optional: defaults to 'policy-index'

    // Slack configuration
    SLACK_BOT_TOKEN: string
    SLACK_SIGNING_SECRET: string
    SLACK_LEAVE_CHANNEL_ID: string // Channel ID where leave requests are posted
    SLACK_DAILY_REPORT_CHANNEL_ID?: string // Channel ID where daily reports are posted
    SLACK_ATTENDANCE_CHANNEL_ID?: string // Channel ID where attendance messages are posted
    SLACK_OVERTIME_CHANNEL_ID?: string // Channel ID where overtime requests are posted
    SLACK_SHORT_LEAVE_CHANNEL_ID?: string // Channel ID where short leave requests are posted

    // Attendance security
    APP_BASE_URL: string // Base URL for generating signed attendance links (e.g., https://bx-assist.vercel.app)
    OFFICE_IP_ALLOWLIST?: string // Comma-separated list of public office IP addresses
    ATTENDANCE_SIGNING_SECRET?: string // Secret for signing attendance URLs
    CRON_SECRET?: string // Secret for securing cron endpoints
    ADMIN_KEY?: string // Secret for securing admin pages and API routes

    // Google Sheets configuration
    // Option 1: New format (preferred)
    GOOGLE_SHEETS_CLIENT_EMAIL?: string
    GOOGLE_SHEETS_PRIVATE_KEY?: string
    GOOGLE_SHEETS_SPREADSHEET_ID?: string
    // Option 2: Legacy format (full JSON string)
    SPREADSHEET_ID?: string
    GOOGLE_SERVICE_ACCOUNT_JSON?: string

    // Birthday cron token (optional)
    BIRTHDAY_CRON_TOKEN?: string
  }
}

