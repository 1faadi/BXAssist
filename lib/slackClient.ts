// lib/slackClient.ts

import { WebClient } from '@slack/web-api'

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error('SLACK_BOT_TOKEN is not set')
}

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN)

