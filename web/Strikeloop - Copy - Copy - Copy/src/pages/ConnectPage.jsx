import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { runAnalysis } from '../lib/api.js'

function Spinner() {
  return (
    <svg
      style={{ width: 14, height: 14, marginRight: 6, flexShrink: 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

function Checkmark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22C55E"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ color: '#F5F5F5', flexShrink: 0 }}
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#52525B', flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

export default function ConnectPage() {
  const navigate = useNavigate()
  const {
    setJobId,
    setGithubRepo: setContextRepo,
    setGithubConnected: setContextGH,
    setAwsConnected: setContextAWS,
    addRunRecord,
  } = useApp()

  const [githubInput, setGithubInput] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubLoading, setGithubLoading] = useState(false)

  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [awsConnected, setAwsConnected] = useState(false)
  const [awsLoading, setAwsLoading] = useState(false)

  const [runLoading, setRunLoading] = useState(false)

  const bothConnected = githubConnected && awsConnected

  function handleConnectGitHub() {
    if (!githubInput.trim()) return
    setGithubLoading(true)
    setTimeout(() => {
      setGithubConnected(true)
      setGithubLoading(false)
      setContextGH(true)
      setContextRepo(githubInput.trim())
    }, 1500)
  }

  function handleConnectAWS() {
    if (!accessKey.trim() || !secretKey.trim()) return
    setAwsLoading(true)
    setTimeout(() => {
      setAwsConnected(true)
      setAwsLoading(false)
      setContextAWS(true)
    }, 1500)
  }

  async function handleRunAnalysis() {
    if (!bothConnected || runLoading) return
    setRunLoading(true)
    try {
      const data = await runAnalysis({
        github_url: githubInput.trim(),
        branch: 'main',
        expected_users: 10000,
        requests_per_user_per_day: 50,
      })
      setJobId(data.job_id)
      addRunRecord({
        jobId: data.job_id,
        repo: githubInput.trim(),
        createdAt: new Date().toISOString(),
        status: 'running',
      })
      navigate(`/run/${data.job_id}`)
    } catch (err) {
      console.error(err)
      setRunLoading(false)
    }
  }

  const inputStyle = {
    background: 'transparent',
    border: '1px solid #1F1F1F',
    borderRadius: 9,
    padding: '9px 13px',
    fontSize: 13,
    color: '#F5F5F5',
    fontFamily: 'Geist Mono, monospace',
    letterSpacing: '0.02em',
    outline: 'none',
    width: '100%',
    transition: 'border-color 150ms ease',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      {/* Top bar */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        background: '#0A0A0A',
        borderBottom: '1px solid #1F1F1F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 50,
      }}>
        {/* Left: logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28,
            height: 28,
            border: '1px solid #1F1F1F',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500, color: '#F5F5F5' }}>IA</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#F5F5F5' }}>Infra.ai</span>
        </div>

        {/* Right: docs + beta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="#"
            style={{
              fontSize: 14,
              color: '#52525B',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#F5F5F5'}
            onMouseLeave={e => e.currentTarget.style.color = '#52525B'}
          >
            Docs
          </a>
          <span style={{
            border: '1px solid #1F1F1F',
            borderRadius: 999,
            fontSize: 11,
            color: '#52525B',
            padding: '2px 8px',
          }}>
            Beta
          </span>
        </div>
      </header>

      {/* Content */}
      <div style={{
        maxWidth: 946,
        margin: '0 auto',
        paddingTop: '20vh',
        paddingLeft: 24,
        paddingRight: 24,
      }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: '#52525B',
            margin: 0,
          }}>
            Infrastructure Intelligence
          </p>
          <h1 style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
            color: '#F5F5F5',
            margin: '4px 0 0',
          }}>
            Connect your stack
          </h1>
          <p style={{
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.6,
            color: '#A1A1AA',
            maxWidth: 320,
            margin: '12px auto 0',
          }}>
            Link your GitHub repository and AWS account to begin automated infrastructure analysis.
          </p>
        </div>

        {/* Cards row */}
        <div style={{ display: 'flex', gap: 13, alignItems: 'stretch' }}>

        {/* GitHub card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#111111',
            border: `1px solid ${githubConnected ? 'rgba(34,197,94,0.2)' : '#1F1F1F'}`,
            borderRadius: 13,
            padding: 22,
            transition: 'border-color 100ms ease',
          }}
          onMouseEnter={e => { if (!githubConnected) e.currentTarget.style.borderColor = '#2E2E2E' }}
          onMouseLeave={e => { if (!githubConnected) e.currentTarget.style.borderColor = '#1F1F1F' }}
        >
          {/* Card row 1 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitHubIcon />
              <span style={{ fontSize: 15, fontWeight: 500, color: '#F5F5F5' }}>GitHub</span>
            </div>
            {githubConnected ? (
              <span style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 999,
                fontSize: 11,
                color: '#22C55E',
                padding: '2px 8px',
              }}>Connected</span>
            ) : (
              <span style={{
                border: '1px solid #1F1F1F',
                borderRadius: 999,
                fontSize: 11,
                color: '#52525B',
                padding: '2px 8px',
              }}>Not connected</span>
            )}
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: '#A1A1AA', margin: '9px 0 0' }}>
            Connect your repository to analyse code structure and dependencies.
          </p>

          {!githubConnected && (
            <>
              {/* Inputs */}
              <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <input
                  type="text"
                  placeholder="https://github.com/org/repo"
                  value={githubInput}
                  onChange={e => setGithubInput(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = '#3F3F46'}
                  onBlur={e => e.currentTarget.style.borderColor = '#1F1F1F'}
                />
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder="Personal Access Token"
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 36 }}
                    onFocus={e => e.currentTarget.style.borderColor = '#3F3F46'}
                    onBlur={e => e.currentTarget.style.borderColor = '#1F1F1F'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: '#52525B',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 150ms ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
                    onMouseLeave={e => e.currentTarget.style.color = '#52525B'}
                  >
                    <EyeIcon visible={showToken} />
                  </button>
                </div>
              </div>

              {/* Spacer pushes button to bottom */}
              <div style={{ flex: 1 }} />

              {/* Button */}
              <button
                onClick={handleConnectGitHub}
                disabled={githubLoading}
                style={{
                  marginTop: 13,
                  width: '100%',
                  background: '#F5F5F5',
                  color: '#0A0A0A',
                  border: 'none',
                  borderRadius: 9,
                  padding: '9px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: githubLoading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 150ms ease',
                  minHeight: 40,
                }}
                onMouseEnter={e => { if (!githubLoading) e.currentTarget.style.background = '#E4E4E7' }}
                onMouseLeave={e => { if (!githubLoading) e.currentTarget.style.background = '#F5F5F5' }}
              >
                {githubLoading ? <><Spinner />Verifying…</> : 'Connect GitHub'}
              </button>
            </>
          )}


          {githubConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Checkmark />
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#A1A1AA', letterSpacing: '0.02em' }}>
                {githubInput.replace(/^https?:\/\//, '')}
              </span>
            </div>
          )}
        </div>

        {/* AWS card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#111111',
            border: `1px solid ${awsConnected ? 'rgba(34,197,94,0.2)' : '#1F1F1F'}`,
            borderRadius: 13,
            padding: 22,
            transition: 'border-color 100ms ease',
          }}
          onMouseEnter={e => { if (!awsConnected) e.currentTarget.style.borderColor = '#2E2E2E' }}
          onMouseLeave={e => { if (!awsConnected) e.currentTarget.style.borderColor = '#1F1F1F' }}
        >
          {/* Card row 1 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: '#1F1F1F',
                border: '1px solid #2E2E2E',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: '#A1A1AA',
                letterSpacing: '0.02em',
              }}>
                AWS
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#F5F5F5' }}>Amazon Web Services</span>
            </div>
            {awsConnected ? (
              <span style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 999,
                fontSize: 11,
                color: '#22C55E',
                padding: '2px 8px',
              }}>Connected</span>
            ) : (
              <span style={{
                border: '1px solid #1F1F1F',
                borderRadius: 999,
                fontSize: 11,
                color: '#52525B',
                padding: '2px 8px',
              }}>Not connected</span>
            )}
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: '#A1A1AA', margin: '9px 0 0' }}>
            Provide IAM credentials to read CloudWatch and Cost Explorer data.
          </p>

          {!awsConnected && (
            <>
              {/* Two inputs */}
              <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <input
                  type="text"
                  placeholder="Access Key ID"
                  value={accessKey}
                  onChange={e => setAccessKey(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = '#3F3F46'}
                  onBlur={e => e.currentTarget.style.borderColor = '#1F1F1F'}
                />
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Secret Access Key"
                    value={secretKey}
                    onChange={e => setSecretKey(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 36 }}
                    onFocus={e => e.currentTarget.style.borderColor = '#3F3F46'}
                    onBlur={e => e.currentTarget.style.borderColor = '#1F1F1F'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: '#52525B',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 150ms ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
                    onMouseLeave={e => e.currentTarget.style.color = '#52525B'}
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
              </div>

              {/* Spacer pushes button to bottom */}
              <div style={{ flex: 1 }} />

              {/* Button */}
              <button
                onClick={handleConnectAWS}
                disabled={awsLoading}
                style={{
                  marginTop: 18,
                  width: '100%',
                  background: '#F5F5F5',
                  color: '#0A0A0A',
                  border: 'none',
                  borderRadius: 9,
                  padding: '9px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: awsLoading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 150ms ease',
                  minHeight: 40,
                }}
                onMouseEnter={e => { if (!awsLoading) e.currentTarget.style.background = '#E4E4E7' }}
                onMouseLeave={e => { if (!awsLoading) e.currentTarget.style.background = '#F5F5F5' }}
              >
                {awsLoading ? <><Spinner />Verifying…</> : 'Connect AWS'}
              </button>
            </>
          )}

          {awsConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Checkmark />
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#A1A1AA', letterSpacing: '0.02em' }}>
                IAM credentials verified
              </span>
            </div>
          )}
        </div>

        </div>{/* end cards row */}

        {/* Run analysis button */}
        <button
          onClick={handleRunAnalysis}
          disabled={!bothConnected || runLoading}
          style={{
            marginTop: 16,
            width: '100%',
            background: bothConnected ? '#F5F5F5' : '#1F1F1F',
            color: bothConnected ? '#0A0A0A' : '#52525B',
            border: 'none',
            borderRadius: 13,
            padding: '13px 18px',
            fontSize: 15,
            fontWeight: bothConnected ? 500 : 400,
            cursor: bothConnected && !runLoading ? 'pointer' : 'not-allowed',
            opacity: bothConnected ? 1 : 0.5,
            pointerEvents: bothConnected && !runLoading ? 'auto' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 300ms ease, color 300ms ease, opacity 300ms ease',
            minHeight: 53,
          }}
          onMouseEnter={e => { if (bothConnected && !runLoading) e.currentTarget.style.background = '#E4E4E7' }}
          onMouseLeave={e => { if (bothConnected && !runLoading) e.currentTarget.style.background = '#F5F5F5' }}
        >
          {runLoading ? <><Spinner />Running analysis…</> : 'Run analysis →'}
        </button>

        {/* Fine print */}
        <div style={{
          marginTop: 13,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 7,
        }}>
          <LockIcon />
          <span style={{ fontSize: 12, color: '#52525B' }}>
            Your credentials are never stored. Analysis runs locally.
          </span>
        </div>
      </div>
    </div>
  )
}
