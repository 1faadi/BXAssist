/**
 * Attendance Reminder Admin Page
 * 
 * Allows configuration of attendance reminder settings:
 * - Set reminder time (HH:MM in PKT)
 * - Enable/disable reminders
 * - Send test reminder immediately
 * 
 * Access: /admin/attendance-reminder?key=ADMIN_SECRET
 */

import { Suspense } from 'react'
import AdminClient from './client'

export default function AttendanceReminderAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AdminPageContent searchParams={searchParams} />
    </Suspense>
  )
}

async function AdminPageContent({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const params = await searchParams
  const providedKey = params?.key

  // Verify admin secret (server-side)
  const adminSecret = process.env.ADMIN_SECRET || ''

  if (!adminSecret || providedKey !== adminSecret) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>Unauthorized</h1>
        <p>Invalid or missing admin key.</p>
      </div>
    )
  }

  return <AdminClient />
}

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      await saveSettings({ timeHHmm, enabled })
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTestNow = async () => {
    setTestLoading(true)
    setTestResult(null)

    try {
      const result = await sendTestNow()
      setTestResult(result)
    } catch (error) {
      setTestResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '40px auto',
        padding: '20px',
        fontFamily: 'sans-serif',
      }}
    >
      <h1>Attendance Reminder Settings</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Configure when attendance reminders are sent (Asia/Karachi time).
      </p>

      <form onSubmit={handleSave} style={{ marginBottom: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="time"
            style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
          >
            Reminder Time (PKT)
          </label>
          <input
            type="time"
            id="time"
            value={timeHHmm}
            onChange={(e) => setTimeHHmm(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
          <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
            Time in Asia/Karachi (HH:MM format)
          </small>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ marginRight: '8px', width: '18px', height: '18px' }}
            />
            <span style={{ fontWeight: 'bold' }}>Enable reminders</span>
          </label>
        </div>

        {message && (
          <div
            style={{
              padding: '12px',
              marginBottom: '20px',
              borderRadius: '4px',
              backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
            }}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'white',
            backgroundColor: loading ? '#ccc' : '#007bff',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      <div
        style={{
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #dee2e6',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Test Reminder</h2>
        <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
          Send a test reminder immediately to all users who haven't checked in today.
        </p>

        <button
          onClick={handleTestNow}
          disabled={testLoading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'white',
            backgroundColor: testLoading ? '#ccc' : '#28a745',
            border: 'none',
            borderRadius: '4px',
            cursor: testLoading ? 'not-allowed' : 'pointer',
            marginBottom: testResult ? '12px' : '0',
          }}
        >
          {testLoading ? 'Sending...' : 'Send Test Now'}
        </button>

        {testResult && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
              fontSize: '14px',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
            }}
          >
            {testResult}
          </div>
        )}
      </div>
    </div>
  )
}

