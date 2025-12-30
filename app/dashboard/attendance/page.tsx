import AttendanceClient from './AttendanceClient'

export const dynamic = 'force-dynamic'

export default function AttendancePage() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const defaultDate = `${yyyy}-${mm}-${dd}`

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid rgba(248,113,113,0.18)',
          boxShadow: '0 18px 40px rgba(251,146,60,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Top nav / brand bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.5rem',
            borderBottom: '1px solid rgba(248,113,113,0.3)',
            background: 'linear-gradient(135deg, #f97316, #fb923c)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f97316',
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              BX
            </div>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: 0.04,
                  color: '#111827',
                }}
              >
                BXTrack Attendance 
              </div>
              <div style={{ fontSize: 11, color: '#fef9c3' }}>
                Attendance &amp; Time Tracking
              </div>
            </div>
          </div>

          <nav
            aria-label="Main navigation"
            style={{
              display: 'flex',
              gap: '0.9rem',
              fontSize: 13,
            }}
          >
            <a
              href="/dashboard"
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: 999,
                color: '#fffbeb',
                textDecoration: 'none',
                border: '1px solid rgba(254,249,195,0.3)',
              }}
            >
              Overview
            </a>
            <a
              href="/dashboard/attendance"
              style={{
                padding: '0.35rem 0.9rem',
                borderRadius: 999,
                color: '#f97316',
                background: '#fffbeb',
                textDecoration: 'none',
                fontWeight: 600,
                border: '1px solid rgba(248,113,113,0.6)',
              }}
            >
              Attendance
            </a>
            <a
              href="/dashboard/employees"
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: 999,
                color: '#fffbeb',
                textDecoration: 'none',
                border: '1px solid rgba(254,249,195,0.35)',
              }}
            >
              Employees
            </a>
          </nav>
        </header>

        <main
          style={{
            padding: '1.5rem 1.75rem 1.75rem',
            color: '#111827',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '1.5rem',
                  margin: 0,
                  letterSpacing: 0.02,
                }}
              >
                Daily Attendance
              </h1>
              <p style={{ margin: '0.25rem 0 0', fontSize: 12, color: '#6b7280' }}>
                First check-in to last check-out defines working time. Multiple punches
                are preserved for full audit history.
              </p>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#92400e',
                padding: '0.35rem 0.7rem',
                borderRadius: 999,
                border: '1px solid rgba(248,113,113,0.35)',
                background: '#fffbeb',
              }}
            >
              Device IPs synced • {process.env.K50_IPS || process.env.K50_IP || 'N/A'}
            </div>
          </div>

          <AttendanceClient defaultDate={defaultDate} />
        </main>
      </div>
    </div>
  )
}


