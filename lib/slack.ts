import { WebClient } from '@slack/web-api'
import crypto from 'crypto'

/**
 * Create and return a Slack WebClient instance
 */
function getSlackClient(): WebClient {
  return new WebClient(process.env.SLACK_BOT_TOKEN)
}

/**
 * Post a message to a Slack channel
 * @param channel - Channel ID or name (e.g., '#general' or 'C1234567890')
 * @param text - The message text to post
 * @returns The response from Slack API
 */
export async function postMessage(
  channel: string,
  text: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const client = getSlackClient()

  try {
    const result = await client.chat.postMessage({
      channel,
      text,
    })

    return { ok: result.ok || false, ts: result.ts }
  } catch (error: any) {
    console.error('Error posting message to Slack:', error)
    return { ok: false, error: error.message }
  }
}

/**
 * Open a Slack modal view
 * @param triggerId - The trigger_id from the interaction
 * @param view - The modal view payload
 */
export async function openModal(
  triggerId: string,
  view: any
): Promise<{ ok: boolean; error?: string }> {
  const client = getSlackClient()

  try {
    const result = await client.views.open({
      trigger_id: triggerId,
      view,
    })

    return { ok: result.ok || false }
  } catch (error: any) {
    console.error('Error opening Slack modal:', error)
    return { ok: false, error: error.message }
  }
}

/**
 * Verify Slack request signature
 * @param rawBody - The raw request body as a string
 * @param signature - The X-Slack-Signature header value
 * @param timestamp - The X-Slack-Request-Timestamp header value
 */
export function verifySlackSignature(
  rawBody: string,
  signature: string,
  timestamp: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET

  if (!signingSecret) {
    console.warn('SLACK_SIGNING_SECRET not set, skipping signature verification')
    return false
  }

  // Check if timestamp is too old (replay attack protection)
  const currentTime = Math.floor(Date.now() / 1000)
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    return false
  }

  // Create the signature base string
  const sigBaseString = `v0:${timestamp}:${rawBody}`
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', signingSecret)
      .update(sigBaseString)
      .digest('hex')

  // Compare signatures using timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  )
}

