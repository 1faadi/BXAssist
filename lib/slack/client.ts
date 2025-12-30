import { WebClient } from '@slack/web-api'

/**
 * Slack WebClient Configuration
 * 
 * Exports a configured WebClient instance for Slack API calls.
 * Used by slash command handlers and interactivity handlers.
 * 
 * Requires SLACK_BOT_TOKEN environment variable.
 */
function getSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    throw new Error('Missing SLACK_BOT_TOKEN environment variable')
  }
  return new WebClient(token)
}

// Lazy initialization - only create client when needed
let _slackClient: WebClient | null = null

export const slackClient = new Proxy({} as WebClient, {
  get(_target, prop) {
    if (!_slackClient) {
      _slackClient = getSlackClient()
    }
    return (_slackClient as any)[prop]
  },
})

