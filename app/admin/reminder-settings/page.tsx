/**
 * Admin Page: Reminder Settings
 * 
 * Allows admins to:
 * - View current reminder time
 * - Change reminder time (HH:mm PKT)
 * - Send test reminder to current user
 * - Trigger scheduler manually
 * 
 * Protected by ADMIN_KEY query parameter.
 */

'use client'

import { useState, useEffect } from 'react'

export default function ReminderSettingsPage() {
  const [reminderTime, setReminderTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [adminKey, setAdminKey] = useState('')

  useEffect(() => {
    // Get admin key from URL params
    const params = new URLSearchParams(window.location.search)
    const key = params.get('key')
    if (key) {
      setAdminKey(key)
      loadSettings(key)
    } else {
      setMessage({ type: 'error', text: 'Missing admin key. Add ?key=YOUR_ADMIN_KEY to URL' })
    }
  }, [])

  async function loadSettings(key: string) {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/reminder-settings?key=${encodeURIComponent(key)}`)
      const data = await res.json()
      if (data.success) {
        setReminderTime(data.reminderTime)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load settings' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    if (!adminKey) {
      setMessage({ type: 'error', text: 'Admin key is required' })
      return
    }

    try {
      setLoading(true)
      setMessage(null)
      const res = await fetch(`/api/admin/reminder-settings?key=${encodeURIComponent(adminKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderTime }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `Reminder time updated to ${reminderTime} PKT` })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setLoading(false)
    }
  }

  async function sendTestReminder() {
    if (!adminKey) {
      setMessage({ type: 'error', text: 'Admin key is required' })
      return
    }

    try {
      setLoading(true)
      setMessage(null)
      // Get current user ID from Slack (you'll need to provide this)
      // For now, we'll use a prompt
      const userId = prompt('Enter Slack User ID to send test reminder to:')
      if (!userId) return

      const res = await fetch(
        `/api/admin/reminder-test?key=${encodeURIComponent(adminKey)}&user=${encodeURIComponent(userId)}`
      )
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `Test reminder sent to ${userId}` })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send test reminder' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send test reminder' })
    } finally {
      setLoading(false)
    }
  }

  async function runScheduler() {
    if (!adminKey) {
      setMessage({ type: 'error', text: 'Admin key is required' })
      return
    }

    try {
      setLoading(true)
      setMessage(null)
      const cronSecret = prompt('Enter CRON_SECRET to run scheduler:')
      if (!cronSecret) return

      const res = await fetch(
        `/api/cron/schedule-checkin-reminders?key=${encodeURIComponent(cronSecret)}`
      )
      const data = await res.json()
      if (data.success) {
        setMessage({
          type: 'success',
          text: `Scheduler ran successfully. Scheduled ${data.scheduled} reminders.`,
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to run scheduler' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to run scheduler' })
    } finally {
      setLoading(false)
    }
  }

  if (!adminKey) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
        <h1>Reminder Settings</h1>
        <p style={{ color: 'red' }}>Missing admin key. Add ?key=YOUR_ADMIN_KEY to URL</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '800px' }}>
      <h1>Attendance Reminder Settings</h1>

      {message && (
        <div
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            borderRadius: '4px',
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <h2>Current Reminder Time</h2>
        <p>
          <strong>{reminderTime || 'Loading...'}</strong> PKT (Asia/Karachi)
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h2>Change Reminder Time</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>
            Time (HH:mm, 24-hour format):
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              style={{
                marginLeft: '10px',
                padding: '8px',
                fontSize: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </label>
          <button
            onClick={saveSettings}
            disabled={loading || !reminderTime}
            style={{
              padding: '8px 16px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
          This time is in Pakistan time (UTC+05:00). The daily scheduler will send reminders at
          this time.
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h2>Test Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={sendTestReminder}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Send Test Reminder Now
          </button>
          <button
            onClick={runScheduler}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#ffc107',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Run Scheduler Now
          </button>
        </div>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
          <strong>Send Test Reminder:</strong> Sends an immediate reminder DM to a user (for
          testing).<br />
          <strong>Run Scheduler Now:</strong> Runs the daily scheduler immediately (schedules
          reminders for all attendance channel members).
        </p>
      </div>

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3>How It Works</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li>
            The daily cron job runs once per day (early morning UTC) and schedules Slack DMs for
            all attendance channel members.
          </li>
          <li>
            When a user checks in, their scheduled reminder is automatically cancelled.
          </li>
          <li>
            Only users who haven&apos;t checked in will receive the reminder at the configured time.
          </li>
          <li>
            Reminder time is stored in Google Sheets Settings tab and can be changed from this
            page.
          </li>
        </ul>
      </div>
    </div>
  )
}

