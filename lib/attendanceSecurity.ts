/**
 * Attendance Security Utilities
 * 
 * This module provides security functions for attendance check-in/checkout:
 * - URL signing/verification for attendance links
 * - IP address extraction and allowlist checking
 * 
 * Why browser-based IP checking?
 * - Slack slash commands only show Slack's server IP, not the user's actual IP
 * - Browser requests to our API routes carry the real client IP via x-forwarded-for
 * - This allows us to verify the user is on the office network before recording attendance
 * 
 * IMPORTANT: OFFICE_IP_ALLOWLIST must contain your public office IP addresses.
 * To find your office IP: from the office network, visit "what is my IP" in a browser.
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'

const SIGNING_SECRET = process.env.ATTENDANCE_SIGNING_SECRET
const APP_BASE_URL = process.env.APP_BASE_URL
const OFFICE_IP_ALLOWLIST = process.env.OFFICE_IP_ALLOWLIST

// Cache parsed IP allowlist
let allowedIps: string[] | null = null

/**
 * Generate a signed URL for attendance check-in/checkout
 * 
 * Creates a time-limited, signed URL that can be verified server-side.
 * The URL includes the user ID, timestamp, and HMAC signature.
 */
export function generateSignedAttendanceUrl(params: {
  type: 'checkin' | 'checkout'
  slackUserId: string
}): string {
  if (!SIGNING_SECRET) {
    throw new Error('ATTENDANCE_SIGNING_SECRET is not set')
  }
  if (!APP_BASE_URL) {
    throw new Error('APP_BASE_URL is not set')
  }

  const { type, slackUserId } = params
  const ts = Date.now().toString()

  // Create signature: type:userId:timestamp
  const payload = `${type}:${slackUserId}:${ts}`
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex')

  return `${APP_BASE_URL}/api/attendance/${type}?u=${encodeURIComponent(slackUserId)}&ts=${ts}&sig=${sig}`
}

/**
 * Verify a signed attendance request
 * 
 * Validates the signature and checks if the request is within the allowed time window (10 minutes).
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifySignedAttendanceRequest(params: {
  type: 'checkin' | 'checkout'
  slackUserId: string
  ts: string
  sig: string
}): boolean {
  if (!SIGNING_SECRET) {
    return false
  }

  const { type, slackUserId, ts, sig } = params

  // Check timestamp age (max 10 minutes)
  const ageMs = Date.now() - Number(ts)
  if (ageMs > 10 * 60 * 1000) {
    return false // Expired
  }
  if (ageMs < 0) {
    return false // Future timestamp (clock skew)
  }

  // Recompute signature
  const payload = `${type}:${slackUserId}:${ts}`
  const expectedSig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex')

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(sig)
  )
}

/**
 * Extract client IP address from Next.js request
 * 
 * For Vercel/Next.js App Router, the real client IP is in x-forwarded-for header.
 * Returns the first IP in the chain (the original client).
 */
export function getClientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    // We want the first one (original client)
    return fwd.split(',')[0].trim()
  }

  // Fallback: try req.ip if available (some environments expose it)
  // @ts-ignore - NextRequest may expose ip in some environments
  return (req as any).ip ?? null
}

/**
 * Check if an IP address is in the office allowlist
 * 
 * Parses OFFICE_IP_ALLOWLIST (comma-separated list) and checks for exact match.
 * Returns false if:
 * - IP is null/undefined
 * - Allowlist is empty/not configured
 * - IP doesn't match any allowed IP
 * 
 * Currently supports exact IP matches only (no CIDR notation).
 */
export function isIpAllowed(ip: string | null): boolean {
  if (!ip) {
    return false
  }

  if (!OFFICE_IP_ALLOWLIST) {
    return false
  }

  // Parse allowlist on first call (cache it)
  if (allowedIps === null) {
    allowedIps = OFFICE_IP_ALLOWLIST.split(',')
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)
  }

  if (allowedIps.length === 0) {
    return false
  }

  // Check for exact match
  return allowedIps.includes(ip)
}

