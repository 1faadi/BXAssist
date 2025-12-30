import Link from 'next/link'

export default function DashboardHome() {
  return (
    <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
        Attendance Admin Dashboard
      </h1>
      <p style={{ marginBottom: '2rem', color: '#555' }}>
        View device users and daily attendance synced from your K50 device (CSV-backed).
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Link href="/dashboard/attendance">
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderRadius: 12,
              border: '1px solid #ddd',
              cursor: 'pointer',
              background: '#fafafa',
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 8, fontSize: '1.1rem' }}>
              Daily Attendance
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              Browse per-day check-in / check-out and export to CSV.
            </p>
          </div>
        </Link>

        <Link href="/dashboard/employees">
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderRadius: 12,
              border: '1px solid #ddd',
              cursor: 'pointer',
              background: '#fafafa',
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 8, fontSize: '1.1rem' }}>
              Employees
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              View employees synced from the K50 device.
            </p>
          </div>
        </Link>
      </div>
    </main>
  )
}


