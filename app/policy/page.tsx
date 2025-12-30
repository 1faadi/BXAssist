'use client'

import { useState } from 'react'

type PolicyChunk = {
  id: string
  text: string
}

/**
 * Policy Chat UI Page
 * 
 * A simple UI for testing the policy chatbot functionality.
 * This page allows users to ask questions and see answers from the policy knowledge base.
 */
export default function PolicyPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [chunks, setChunks] = useState<PolicyChunk[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setAnswer(null)
    setChunks([])

    try {
      const res = await fetch('/api/policy-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Request failed')
      }

      const data = await res.json()
      setAnswer(data.answer)
      setChunks(data.chunks || [])
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: '42rem',
        margin: '0 auto',
        padding: '2.5rem 1rem',
      }}
    >
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          marginBottom: '1rem',
        }}
      >
        Office Policy Assistant
      </h1>
      <p
        style={{
          fontSize: '0.875rem',
          color: '#666',
          marginBottom: '1rem',
        }}
      >
        Ask questions about the company policy PDF. Answers are based only on
        the policy text.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <textarea
          style={{
            width: '100%',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.5rem',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
          }}
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Example: What is the probation period for new employees?"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            backgroundColor: '#000',
            color: '#fff',
            fontSize: '0.875rem',
            border: 'none',
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !question.trim() ? 0.6 : 1,
            alignSelf: 'flex-start',
          }}
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>

      {error && (
        <div
          style={{
            fontSize: '0.875rem',
            color: '#dc2626',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {answer && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.75rem',
            backgroundColor: '#f9f9f9',
            marginBottom: '1rem',
          }}
        >
          <h2
            style={{
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Answer
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {answer}
          </p>
        </div>
      )}

      {chunks.length > 0 && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.75rem',
            fontSize: '0.75rem',
            color: '#374151',
          }}
        >
          <h3
            style={{
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Relevant policy excerpts
          </h3>
          <ol
            style={{
              listStyle: 'decimal inside',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {chunks.map((c) => (
              <li key={c.id}>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#6b7280',
                    marginBottom: '0.25rem',
                  }}
                >
                  {c.id}
                </div>
                <div>{c.text}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </main>
  )
}

