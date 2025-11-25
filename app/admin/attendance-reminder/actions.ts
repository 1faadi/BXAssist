/**
 * Server Actions for Attendance Reminder Admin Page
 */

'use server'

import { revalidatePath } from 'next/cache'
import {
  getAttendanceReminderSettings,
  setAttendanceReminderSettings,
} from '@/lib/settingsSheets'

/**
 * Save attendance reminder settings
 */
export async function saveSettings(formData: {
  timeHHmm: string
  enabled: boolean
}) {
  try {
    await setAttendanceReminderSettings({
      timeHHmm: formData.timeHHmm,
      enabled: formData.enabled,
    })

    revalidatePath('/admin/attendance-reminder')
    return { success: true }
  } catch (error) {
    console.error('Error saving settings:', error)
    throw new Error('Failed to save settings')
  }
}

/**
 * Send test reminder immediately
 */
export async function sendTestNow(): Promise<string> {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      throw new Error('CRON_SECRET not configured')
    }

    // Determine base URL
    let appBaseUrl = process.env.APP_BASE_URL
    if (!appBaseUrl) {
      // Fallback for Vercel
      const vercelUrl = process.env.VERCEL_URL
      if (vercelUrl) {
        appBaseUrl = `https://${vercelUrl}`
      } else {
        appBaseUrl = 'http://localhost:3000'
      }
    }

    const url = `${appBaseUrl}/api/cron/attendance-reminder/${cronSecret}?force=1`

    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'User-Agent': 'AttendanceReminderAdmin/1.0',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    if (result.error) {
      throw new Error(result.error)
    }

    // Format result message
    if (result.skipped) {
      return `Skipped: ${result.message || 'Unknown reason'}`
    }

    return `✅ Test reminder sent successfully!\n\n` +
      `Date: ${result.date}\n` +
      `Time: ${result.time}\n` +
      `Configured Time: ${result.configuredTime}\n` +
      `Checked In: ${result.checkedInCount}\n` +
      `Channel Members: ${result.channelMembersCount}\n` +
      `Reminders Sent: ${result.remindersSent}\n` +
      `Errors: ${result.errors}`
  } catch (error) {
    console.error('Error sending test reminder:', error)
    throw error
  }
}

