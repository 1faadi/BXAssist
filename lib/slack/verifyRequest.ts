import crypto from 'crypto'

/**
 * Verify Slack Request Signature
 * 
 * Validates that incoming requests from Slack are authentic
 * using the signing secret and HMAC SHA256.
 * 
 * Used by:
 * - Slash command endpoints
 * - Interactivity endpoints
 * 
 * @param rawBody - The raw request body as a string
 * @param signature - The X-Slack-Signature header value
 * @param timestamp - The X-Slack-Request-Timestamp header value
 * @returns true if signature is valid, false otherwise
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

