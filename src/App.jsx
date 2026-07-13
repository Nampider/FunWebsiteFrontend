import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const configuredApiOrigin = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '')

function apiUrl(path) {
  return `${configuredApiOrigin}${path}`
}

function webSocketUrl() {
  const base = configuredApiOrigin || window.location.origin
  const url = new URL('/ws/chat', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

async function parseResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message || `Request failed (${response.status})`)
  }
  return body
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
  })
  return parseResponse(response)
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort(
    (left, right) => new Date(left.sentAt) - new Date(right.sentAt),
  )
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function App() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('chris')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [connection, setConnection] = useState('offline')
  const [health, setHealth] = useState('checking')
  const socketRef = useRef(null)
  const endRef = useRef(null)

  const getCsrf = useCallback(() => request('/api/auth/csrf'), [])

  const loadHistory = useCallback(async () => {
    const history = await request('/api/messages?limit=100')
    setMessages((current) => mergeMessages(current, history))
  }, [])

  useEffect(() => {
    let active = true

    Promise.allSettled([
      request('/actuator/health'),
      getCsrf().then(() => request('/api/auth/me')),
    ]).then(([healthResult, authResult]) => {
      if (!active) return
      setHealth(healthResult.status === 'fulfilled' ? 'online' : 'offline')
      if (authResult.status === 'fulfilled') setUser(authResult.value)
      setBooting(false)
    })

    return () => {
      active = false
    }
  }, [getCsrf])

  useEffect(() => {
    if (!user?.authenticated) return undefined

    let disposed = false
    let reconnectTimer

    const connect = () => {
      setConnection('connecting')
      const socket = new WebSocket(webSocketUrl())
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (!disposed) setConnection('online')
      })

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data)
          setMessages((current) => mergeMessages(current, [message]))
        } catch {
          setConnection('error')
        }
      })

      socket.addEventListener('close', () => {
        if (disposed) return
        setConnection('offline')
        reconnectTimer = window.setTimeout(connect, 2000)
      })

      socket.addEventListener('error', () => {
        if (!disposed) setConnection('error')
      })
    }

    loadHistory().catch(() => setConnection('error'))
    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
      setConnection('offline')
    }
  }, [loadHistory, user])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleLogin = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setAuthError('')

    try {
      const csrf = await getCsrf()
      const body = new URLSearchParams({ username, password })
      const authenticated = await request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          [csrf.headerName]: csrf.token,
        },
        body,
      })

      await getCsrf()
      setPassword('')
      setMessages([])
      setUser(authenticated)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      const csrf = await getCsrf()
      await request('/api/auth/logout', {
        method: 'POST',
        headers: { [csrf.headerName]: csrf.token },
      })
    } finally {
      setUser(null)
      setMessages([])
      setDraft('')
    }
  }

  const handleSend = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return
    socketRef.current.send(JSON.stringify({ text }))
    setDraft('')
  }

  const chatMessages = useMemo(
    () => messages.filter((message) => message.type === 'CHAT'),
    [messages],
  )

  if (booting) {
    return (
      <main className="boot-screen" aria-live="polite">
        <div className="brand-mark" aria-hidden="true">K</div>
        <p>Opening the private room…</p>
      </main>
    )
  }

  if (!user?.authenticated) {
    return (
      <main className="login-shell">
        <section className="login-story" aria-labelledby="welcome-title">
          <div className="wordmark"><span className="brand-mark">K</span> KinLine</div>
          <div className="story-copy">
            <p className="eyebrow">A small room for your people</p>
            <h1 id="welcome-title">Private conversation, without the noise.</h1>
            <p className="lede">
              A focused two-person chat backed by authenticated sessions and a
              live WebSocket connection.
            </p>
          </div>
          <div className="privacy-note">
            <span className="privacy-dot" aria-hidden="true" />
            Messages stay in server memory and clear when the backend restarts.
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="backend-status">
            <span className={`status-dot ${health}`} aria-hidden="true" />
            Backend {health}
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <p className="eyebrow">Welcome back</p>
            <h2 id="login-title">Enter the room</h2>
            <p className="form-intro">Use one of the accounts configured by the backend.</p>

            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            {authError && <p className="form-error" role="alert">{authError}</p>}

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in securely'}
            </button>

          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="chat-shell">
      <aside className="chat-sidebar">
        <div className="wordmark"><span className="brand-mark">K</span> KinLine</div>
        <div className="room-card">
          <p className="eyebrow">Current room</p>
          <h1>Family room</h1>
          <div className="connection-line">
            <span className={`status-dot ${connection}`} aria-hidden="true" />
            {connection === 'online' ? 'Live connection' : connection}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="profile-row">
            <span className="avatar">{user.username.charAt(0).toUpperCase()}</span>
            <div><strong>{user.username}</strong><small>Authenticated</small></div>
          </div>
          <button className="text-button" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <section className="conversation" aria-label="Family room conversation">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Private chat</p>
            <h2>Family room</h2>
          </div>
          <span className="message-count">{chatMessages.length} messages</span>
        </header>

        <div className="message-list" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <span aria-hidden="true">✦</span>
              <h3>Nothing here yet</h3>
              <p>Send the first message when the connection is ready.</p>
            </div>
          )}

          {messages.map((message) => {
            if (message.type !== 'CHAT') {
              return <p className={`system-message ${message.type.toLowerCase()}`} key={message.id}>{message.text}</p>
            }

            const own = message.username === user.username
            return (
              <article className={`message-row ${own ? 'own' : ''}`} key={message.id}>
                {!own && <span className="avatar small">{message.username.charAt(0).toUpperCase()}</span>}
                <div className="message-stack">
                  <div className="message-meta">
                    <strong>{own ? 'You' : message.username}</strong>
                    <time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time>
                  </div>
                  <p className="message-bubble">{message.text}</p>
                </div>
              </article>
            )
          })}
          <div ref={endRef} />
        </div>

        <form className="composer" onSubmit={handleSend}>
          <label className="sr-only" htmlFor="message">Message</label>
          <textarea
            id="message"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form.requestSubmit()
              }
            }}
            placeholder={connection === 'online' ? 'Write a message…' : 'Waiting for connection…'}
            rows="1"
            disabled={connection !== 'online'}
          />
          <div className="composer-actions">
            <span>{draft.length}/500</span>
            <button type="submit" disabled={!draft.trim() || connection !== 'online'} aria-label="Send message">Send <span aria-hidden="true">↗</span></button>
          </div>
        </form>
      </section>
    </main>
  )
}

export default App
