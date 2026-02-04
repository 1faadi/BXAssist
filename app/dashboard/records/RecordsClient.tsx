'use client'

import { useRecordsState, SHEETS, getHeaders } from './useRecordsState'

const thStyle = {
  textAlign: 'left' as const,
  padding: '0.5rem 0.6rem',
  borderBottom: '1px solid #ddd',
  background: '#f5f5f5',
}

const tdStyle = {
  padding: '0.45rem 0.6rem',
  borderBottom: '1px solid #eee',
}

function formatCell(val: string): string {
  if (!val) return '—'
  if (val.length > 40) return val.slice(0, 37) + '...'
  return val
}

function formatDate(val: string): string {
  if (!val) return '—'
  const d = val.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const parsed = new Date(val)
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return val
}

export default function RecordsClient() {
  const {
    sheet,
    setSheet,
    month,
    setMonth,
    useMonthFilter,
    setUseMonthFilter,
    data,
    loading,
    error,
    editingRow,
    setEditingRow,
    saving,
    handleExport,
    handleSaveEdit,
  } = useRecordsState()

  const tableHeaders = getHeaders(sheet)

  return (
    <section>
      <div
        style={{
          display: 'flex',
          gap: '0.9rem',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSheet(s.id)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 999,
              border: sheet === s.id ? '1px solid rgba(248,113,113,0.6)' : '1px solid #ccc',
              background: sheet === s.id ? '#fffbeb' : '#f5f5f5',
              color: sheet === s.id ? '#f97316' : '#374151',
              fontWeight: sheet === s.id ? 600 : 400,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.9rem',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={useMonthFilter}
            onChange={(e) => setUseMonthFilter(e.target.checked)}
          />
          Filter by month
        </label>
        {useMonthFilter && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
          />
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={!data.length}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: data.length ? '#0f766e' : '#e5e5e5',
            color: data.length ? '#fff' : '#777',
            cursor: data.length ? 'pointer' : 'default',
            fontSize: 14,
          }}
        >
          Export CSV
        </button>
      </div>

      {loading && <p style={{ fontSize: 14, color: '#6b7280' }}>Loading…</p>}
      {error && (
        <p style={{ color: '#dc2626', fontSize: 14 }}>Error: {error}</p>
      )}

      {!loading && !data.length && !error && (
        <p style={{ fontSize: 14, color: '#6b7280' }}>No records for this selection.</p>
      )}

      {!loading && data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}></th>
                {tableHeaders.map((h, i) => (
                  <th key={i} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                const sheetRowIndex = idx + 2
                return (
                  <tr
                    key={idx}
                    style={{ cursor: 'pointer', backgroundColor: editingRow?.rowIndex === sheetRowIndex ? '#fff7ed' : undefined }}
                    onClick={() => setEditingRow({ rowIndex: sheetRowIndex, values: [...row] })}
                  >
                    <td style={tdStyle}>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>Edit</span>
                    </td>
                    {row.map((cell, i) => (
                      <td key={i} style={tdStyle} title={cell}>
                        {i === 0 || (sheet === 'LeaveRequests' && (i === 3 || i === 4)) || (sheet === 'ShortLeaveRequests' && (i === 3 || i === 4)) ? formatDate(cell) : formatCell(cell)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => !saving && setEditingRow(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '1.5rem',
              maxWidth: 560,
              width: '90%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: 18 }}>Edit row (sheet row {editingRow.rowIndex})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tableHeaders.map((label, i) => (
                <label key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: '#374151' }}>{label}</span>
                  <input
                    type="text"
                    value={editingRow.values[i] ?? ''}
                    onChange={(e) => {
                      const next = e.target.value
                      setEditingRow((prev) => {
                        if (!prev) return null
                        return {
                          ...prev,
                          values: prev.values.map((v, j) => (j === i ? next : v)),
                        }
                      })
                    }}
                    style={{
                      padding: '0.5rem 0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: '1px solid #f97316',
                  background: '#f97316',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: saving ? 'wait' : 'pointer',
                  fontSize: 14,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => !saving && setEditingRow(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  background: '#f5f5f5',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
