"use client"

import { useEffect, useState } from 'react'

type Employee = {
  deviceUid: number
  name: string
}

export default function EmployeesClient() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/users')
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Failed to load users')
        }
        setEmployees(json.data || [])
      } catch (err: any) {
        setError(err.message || String(err))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  function handleExport() {
    if (!employees.length) return
    const header = ['Device UID', 'Name']
    const lines = [
      header.join(','),
      ...employees.map((e) =>
        [e.deviceUid, `"${(e.name || '').replace(/"/g, '""')}"`].join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n') + '\n'], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employees.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: '#555' }}>
          Total employees: {employees.length}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={!employees.length}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: employees.length ? '#0f766e' : '#e5e5e5',
            color: employees.length ? '#fff' : '#777',
            cursor: employees.length ? 'pointer' : 'default',
            fontSize: 14,
          }}
        >
          Export CSV
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <p style={{ color: 'red', fontSize: 14 }}>
          Error loading employees: {error}
        </p>
      )}

      {!!employees.length && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Device UID</th>
                <th style={thStyle}>Name</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.deviceUid}>
                  <td style={tdStyle}>{e.deviceUid}</td>
                  <td style={tdStyle}>{e.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !employees.length && !error && (
        <p style={{ fontSize: 14, color: '#555' }}>No employees found.</p>
      )}
    </section>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.6rem',
  borderBottom: '1px solid #ddd',
  background: '#f5f5f5',
}

const tdStyle: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  borderBottom: '1px solid #eee',
}


