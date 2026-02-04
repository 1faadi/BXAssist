import { useEffect, useState } from 'react'

export type SheetId = 'LeaveRequests' | 'OvertimeRequests' | 'ShortLeaveRequests'

export type EditRowState = { rowIndex: number; values: string[] } | null

export function useRecordsState() {
  const [sheet, setSheet] = useState<SheetId>('LeaveRequests')
  const [month, setMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [useMonthFilter, setUseMonthFilter] = useState(true)
  const [data, setData] = useState<string[][]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<EditRowState>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ sheet })
      if (useMonthFilter && month) params.set('month', month)
      const res = await fetch(`/api/sheets/records?${params}`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load')
      setData(json.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load depends on sheet, month, useMonthFilter
  }, [sheet, month, useMonthFilter])

  const handleExport = () => {
    if (!data.length) return
    const exportHeaders = getHeaders(sheet)
    const lines = [
      exportHeaders.join(','),
      ...data.map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sheet.toLowerCase()}-${month || 'all'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleSaveEdit = async () => {
    if (!editingRow) return
    setSaving(true)
    try {
      const res = await fetch('/api/sheets/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheet,
          rowIndex: editingRow.rowIndex,
          values: editingRow.values,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to update')
      setEditingRow(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return {
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
    load,
    handleExport,
    handleSaveEdit,
  }
}

const HEADERS: Record<SheetId, string[]> = {
  LeaveRequests: [
    'Timestamp', 'Slack User', 'Employee', 'From', 'To', 'Reason',
    'Status', 'Decision By', 'Decision At', 'Msg Ts', 'Channel',
  ],
  OvertimeRequests: [
    'Timestamp', 'Slack User', 'Employee', 'Project', 'Assigned By',
    'Hours', 'Minutes', 'Reason', 'Status', 'Decision By', 'Decision At', 'Msg Ts', 'Channel',
  ],
  ShortLeaveRequests: [
    'Timestamp', 'Slack User', 'Employee', 'From', 'To', 'Time From', 'Time To',
    'Reason', 'Status', 'Decision By', 'Decision At', 'Msg Ts', 'Channel',
  ],
}

export function getHeaders(sheet: SheetId): string[] {
  return HEADERS[sheet]
}

export const SHEETS: { id: SheetId; label: string }[] = [
  { id: 'LeaveRequests', label: 'Leave requests' },
  { id: 'OvertimeRequests', label: 'Overtime' },
  { id: 'ShortLeaveRequests', label: 'Short leave' },
]
