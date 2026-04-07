import { Component } from 'react'
import { supabase } from '../supabaseClient'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

/**
 * React Error Boundary — catches render errors in the component tree,
 * logs them to the error_logs table, and shows a recovery UI.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    this.logError(error, errorInfo)
  }

  async logError(error, errorInfo) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('error_logs').insert({
        message: error?.message || String(error),
        stack: error?.stack || null,
        source: 'boundary',
        component_name: errorInfo?.componentStack
          ? extractComponentName(errorInfo.componentStack)
          : this.props.name || null,
        url: window.location.href,
        user_id: user?.id || null,
        user_email: user?.email || null,
        user_agent: navigator.userAgent,
        screen_size: `${window.innerWidth}x${window.innerHeight}`,
        severity: 'error',
      })
    } catch {
      // Silently fail — don't cause another error while logging
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={s.wrapper}>
          <div style={s.card}>
            <div style={s.iconWrap}>
              <AlertTriangle size={32} color="#dc2626" />
            </div>
            <h2 style={s.title}>Something went wrong</h2>
            <p style={s.message}>
              An unexpected error occurred. The error has been automatically logged and our team will investigate.
            </p>
            {this.state.error && (
              <div style={s.errorDetail}>
                <div style={s.errorLabel}>Error</div>
                <pre style={s.errorPre}>{this.state.error.message}</pre>
              </div>
            )}
            <div style={s.actions}>
              <button style={s.primaryBtn} onClick={this.handleReload}>
                <RotateCcw size={14} /> Try Again
              </button>
              <button style={s.secondaryBtn} onClick={this.handleGoHome}>
                <Home size={14} /> Go Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function extractComponentName(componentStack) {
  if (!componentStack) return null
  const lines = componentStack.split('\n').filter(Boolean)
  if (lines.length > 0) {
    const match = lines[0].trim().match(/at (\w+)/)
    return match ? match[1] : null
  }
  return null
}

const s = {
  wrapper: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', padding: '2rem',
  },
  card: {
    maxWidth: 480, width: '100%', background: '#fff', borderRadius: 12,
    border: '1px solid #fecaca', padding: '2.5rem',
    boxShadow: '0 4px 20px rgba(220,38,38,0.08)', textAlign: 'center',
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 16,
    background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 1.25rem',
  },
  title: { fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' },
  message: { fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' },
  errorDetail: {
    background: '#fef2f2', borderRadius: 8, padding: '0.85rem 1rem',
    marginBottom: '1.5rem', textAlign: 'left',
  },
  errorLabel: { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626', marginBottom: '0.3rem' },
  errorPre: { fontSize: '0.78rem', color: '#991b1b', fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'center' },
  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.25rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1.25rem', background: '#f1f5f9',
    color: '#64748b', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer',
  },
}
