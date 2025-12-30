"use client"

import { useEffect, useState } from 'react'

type Row = {
  date: string
  deviceUid: number
  name: string
  checkInIso: string
  checkOutIso: string
}

type RawPunch = {
  date: string
  deviceUid: number
  name: string
  punchIso: string
  sourceIp: string
}

type RowWithPunches = Row & {
  punches: RawPunch[]
  workingSeconds: number
}

export default function AttendanceClient({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate)
  const [rows, setRows] = useState<RowWithPunches[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)

  async function load(d: string) {
    setLoading(true)
    setError(null)
    try {
      const [dailyRes, rawRes] = await Promise.all([
        fetch(`/api/attendance?date=${encodeURIComponent(d)}`),
        fetch(`/api/attendance/raw?date=${encodeURIComponent(d)}`),
      ])

      const dailyJson = await dailyRes.json()
      const rawJson = await rawRes.json()

      if (!dailyRes.ok || !dailyJson.ok) {
        throw new Error(dailyJson.error || 'Failed to load attendance')
      }
      if (!rawRes.ok || !rawJson.ok) {
        throw new Error(rawJson.error || 'Failed to load raw punches')
      }

      const daily: Row[] = dailyJson.data || []
      const raw: RawPunch[] = rawJson.data || []

      // Group punches by employee UID
      const punchesByUid = new Map<number, RawPunch[]>()
      for (const p of raw) {
        const list = punchesByUid.get(p.deviceUid) || []
        list.push(p)
        punchesByUid.set(p.deviceUid, list)
      }
      for (const list of punchesByUid.values()) {
        list.sort((a, b) => a.punchIso.localeCompare(b.punchIso))
      }

      const combined: RowWithPunches[] = daily.map((r) => {
        const punches = punchesByUid.get(r.deviceUid) || []
        const workingSeconds =
          r.checkInIso && r.checkOutIso
            ? (new Date(r.checkOutIso).getTime() - new Date(r.checkInIso).getTime()) / 1000
            : 0
        return {
          ...r,
          punches,
          workingSeconds: workingSeconds > 0 ? workingSeconds : 0,
        }
      })

      setRows(combined)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(defaultDate)
  }, [defaultDate])

  function formatTime(iso: string) {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  function handleExport() {
    if (!rows.length) return
    const header = ['Date', 'Device UID', 'Name', 'Check-in', 'Check-out']
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.date,
          r.deviceUid,
          `"${r.name.replace(/"/g, '""')}"`,
          r.checkInIso,
          r.checkOutIso,
        ].join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n') + '\n'], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${date}.csv`
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
          gap: '0.9rem',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: 14 }}>
          Date:{' '}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value
              setDate(v)
              void load(v)
            }}
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            setSyncing(true)
            setError(null)
            try {
              const res = await fetch('/api/devices/sync', { method: 'POST' })
              const json = await res.json()
              if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Failed to sync devices')
              }
              await load(date)
            } catch (err: any) {
              setError(err.message || String(err))
            } finally {
              setSyncing(false)
            }
          }}
          disabled={syncing}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 999,
            border: '1px solid #f97316',
            background: syncing ? '#fed7aa' : '#f97316',
            color: syncing ? '#9a3412' : '#ffffff',
            cursor: syncing ? 'wait' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 18px rgba(248,113,113,0.35)',
          }}
        >
          {syncing ? 'Syncing from devices…' : 'Sync latest from devices'}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={!rows.length}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: rows.length ? '#0f766e' : '#e5e5e5',
            color: rows.length ? '#fff' : '#777',
            cursor: rows.length ? 'pointer' : 'default',
            fontSize: 14,
          }}
        >
          Export CSV
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <p style={{ color: 'red', fontSize: 14 }}>
          Error loading attendance: {error}
        </p>
      )}

      {!loading && !rows.length && !error && (
        <p style={{ fontSize: 14, color: '#555' }}>No attendance for this date.</p>
      )}

      {!!rows.length && (
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
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Device UID</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Check-In</th>
                <th style={thStyle}>Check-Out</th>
                <th style={thStyle}>Working Time</th>
                <th style={thStyle}>Punches</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.date}-${r.deviceUid}`
                const isExpanded = !!expanded[key]
                return (
                  <>
                    <tr
                      key={key}
                      style={{
                        cursor: r.punches.length > 1 ? 'pointer' : 'default',
                        backgroundColor: isExpanded ? '#fff7ed' : undefined,
                      }}
                      onClick={() => {
                        if (!r.punches.length) return
                        setExpanded((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }}
                    >
                      <td style={tdStyle}>{r.name}</td>
                      <td style={tdStyle}>{r.deviceUid}</td>
                      <td style={tdStyle}>{r.date}</td>
                      <td style={tdStyle}>{formatTime(r.checkInIso)}</td>
                      <td style={tdStyle}>
                        {r.checkOutIso ? formatTime(r.checkOutIso) : '—'}
                      </td>
                      <td style={tdStyle}>{formatDuration(r.workingSeconds)}</td>
                      <td style={tdStyle}>
                        {r.punches.length || 0}
                        {r.punches.length > 1 ? ' (click)' : ''}
                      </td>
                    </tr>
                    {isExpanded && r.punches.length > 0 && (
                      <tr key={`${key}-details`}>
                        <td
                          style={{
                            ...tdStyle,
                            background: '#fffaf0',
                            borderTop: '1px solid #fcd34d',
                          }}
                          colSpan={7}
                        >
                          <div style={{ margin: '0.4rem 0 0.2rem', fontSize: 12 }}>
                            Punch history for <strong>{r.name}</strong> on{' '}
                            <strong>{r.date}</strong>:
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: 12,
                              }}
                            >
                              <thead>
                                <tr>
                                  <th style={thStyle}>#</th>
                                  <th style={thStyle}>Type</th>
                                  <th style={thStyle}>Time</th>
                                  <th style={thStyle}>Source Device IP</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.punches.map((p, idx) => (
                                  <tr key={`${key}-${idx}`}>
                                    <td style={tdStyle}>{idx + 1}</td>
                                    <td style={tdStyle}>{getPunchType(p.sourceIp)}</td>
                                    <td style={tdStyle}>{formatTime(p.punchIso)}</td>
                                    <td style={tdStyle}>{p.sourceIp}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
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

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '—'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (!hrs && !mins) return '<1m'
  if (!hrs) return `${mins}m`
  if (!mins) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function getPunchType(sourceIp: string) {
  // Convention: 192.168.0.201 = Check-in device, 192.168.0.200 = Check-out device
  if (sourceIp === '192.168.0.201') return 'Check-in'
  if (sourceIp === '192.168.0.200') return 'Check-out'
  return '—'
}


