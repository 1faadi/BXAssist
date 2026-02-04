'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/dashboard-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Invalid password')
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
        padding: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: '100%',
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid rgba(248,113,113,0.18)',
          boxShadow: '0 18px 40px rgba(251,146,60,0.25)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '1.25rem 1.5rem',
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
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                BXTrack
              </div>
              <div style={{ fontSize: 11, color: '#fef9c3' }}>
                Dashboard login
              </div>
            </div>
          </div>
        </header>

        <main style={{ padding: '1.5rem 1.75rem' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: '#111827' }}>
            Enter password
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 1.25rem' }}>
            Access to the dashboard is restricted.
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 15,
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <p style={{ color: '#dc2626', fontSize: 13, margin: '0.5rem 0 0' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !password.trim()}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem 1rem',
                borderRadius: 8,
                border: '1px solid #f97316',
                background: loading ? '#fed7aa' : '#f97316',
                color: loading ? '#9a3412' : '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Checking…' : 'Log in'}
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}
