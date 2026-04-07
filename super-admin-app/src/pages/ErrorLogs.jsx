import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { AlertTriangle, Bug, Check, Search, ChevronDown, ChevronUp, Filter, RefreshCw, Globe, Zap, Code, Wifi, Terminal, Eye } from 'lucide-react'

const SOURCE_META = {
  boundary:  { label: 'React Crash', icon: Zap, color: '#dc2626', bg: '#fef2f2' },
  runtime:   { label: 'Runtime Error', icon: Code, color: '#ea580c', bg: '#fff7ed' },
  promise:   { label: 'Async Error', icon: Terminal, color: '#d97706', bg: '#fffbeb' },
  network:   { label: 'Network', icon: Wifi, color: '#0284c7', bg: '#f0f9ff' },
  console:   { label: 'Console', icon: Terminal, color: '#64748b', bg: '#f8fafc' },
  manual:    { label: 'Manual Report', icon: Bug, color: '#7c3aed', bg: '#f5f3ff' },
}

const SEVERITY_COLORS = {
  error:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  warning: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  info:    { bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' },
}

export default function ErrorLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterResolved, setFilterResolved] = useState('unresolved')
  const [page, setPage] = useState(0)
  const [stats, setStats] = useState({ total: 0, error: 0, warning: 0, resolved: 0 })
  const PAGE_SIZE = 50

  useEffect(() => { loadOrgs(); loadLogs() }, [page, filterSource, filterSeverity, filterResolved])

  async function loadOrgs() {
    const { data } = await supabase.from('organizations').select('id, name, slug')
    const map = {}
    ;(data || []).forEach(o => { map[o.id] = o })
    setOrgs(map)
  }

  async function loadLogs() {
    setLoading(true)

    // Stats query
    const { count: totalCount } = await supabase.from('error_logs').select('id', { count: 'exact', head: true })
    const { count: errorCount } = await supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('severity', 'error')
    const { count: warnCount } = await supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('severity', 'warning')
    const { count: resolvedCount } = await supabase.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolved', true)
    setStats({ total: totalCount || 0, error: errorCount || 0, warning: warnCount || 0, resolved: resolvedCount || 0 })

    // Main query
    let query = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterSource !== 'all') query = query.eq('source', filterSource)
    if (filterSeverity !== 'all') query = query.eq('severity', filterSeverity)
    if (filterResolved === 'unresolved') query = query.eq('resolved', false)
    else if (filterResolved === 'resolved') query = query.eq('resolved', true)

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }

  async function handleResolve(logId) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('error_logs').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id || null,
    }).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, resolved: true, resolved_at: new Date().toISOString() } : l))
  }

  async function handleUpdateNotes(logId, notes) {
    await supabase.from('error_logs').update({ notes }).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, notes } : l))
  }

  const filtered = logs.filter(l =>
    !search ||
    (l.message && l.message.toLowerCase().includes(search.toLowerCase())) ||
    (l.user_email && l.user_email.toLowerCase().includes(search.toLowerCase())) ||
    (l.url && l.url.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={s.header}>
        <div style={s.headerIcon}>
          <Bug size={24} color="#fff" />
        </div>
        <div>
          <h1 style={s.title}>Error Logs</h1>
          <p style={s.sub}>Platform-wide error tracking and analysis</p>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <StatBadge label="Total" value={stats.total} color="#0f172a" bg="#f1f5f9" />
        <StatBadge label="Errors" value={stats.error} color="#dc2626" bg="#fef2f2" />
        <StatBadge label="Warnings" value={stats.warning} color="#d97706" bg="#fffbeb" />
        <StatBadge label="Resolved" value={stats.resolved} color="#16a34a" bg="#f0fdf4" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={s.searchWrap}>
          <Search size={14} color="#94a3b8" />
          <input
            style={s.searchInput}
            placeholder="Search errors, emails, URLs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(0) }}>
          <option value="all">All Sources</option>
          <option value="boundary">React Crash</option>
          <option value="runtime">Runtime</option>
          <option value="promise">Async</option>
          <option value="network">Network</option>
          <option value="console">Console</option>
          <option value="manual">Manual</option>
        </FilterSelect>
        <FilterSelect value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(0) }}>
          <option value="all">All Severity</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </FilterSelect>
        <FilterSelect value={filterResolved} onChange={e => { setFilterResolved(e.target.value); setPage(0) }}>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </FilterSelect>
        <button style={s.refreshBtn} onClick={loadLogs}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Error List */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading errors...</div>
      ) : filtered.length === 0 ? (
        <div style={s.emptyCard}>
          <Check size={24} color="#16a34a" />
          <span style={{ color: '#16a34a', fontWeight: 600 }}>No errors found</span>
          <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
            {filterResolved === 'unresolved' ? 'All caught up! No unresolved errors.' : 'No errors match your filters.'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(log => {
            const isExpanded = expandedId === log.id
            const sm = SOURCE_META[log.source] || SOURCE_META.manual
            const sc = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.error
            const SourceIcon = sm.icon
            const orgName = log.organization_id ? orgs[log.organization_id]?.name : null

            return (
              <div key={log.id} style={{ ...s.logCard, borderLeftColor: sc.color, ...(log.resolved ? { opacity: 0.6 } : {}) }}>
                {/* Row Header */}
                <div style={s.logHeader} onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <div style={{ ...s.sourceTag, background: sm.bg, color: sm.color }}>
                      <SourceIcon size={11} />
                      <span>{sm.label}</span>
                    </div>
                    <span style={{ ...s.severityDot, background: sc.color }} />
                    <span style={s.logMessage}>{log.message}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {orgName && (
                      <span style={s.orgChip}>{orgName}</span>
                    )}
                    <span style={s.logTime}>
                      {log.created_at ? timeAgo(log.created_at) : '—'}
                    </span>
                    {log.resolved && <Check size={14} color="#16a34a" />}
                    {isExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={s.logDetail}>
                    <div style={s.detailGrid}>
                      <DetailRow label="Error" value={log.message} mono />
                      {log.url && <DetailRow label="URL" value={log.url} />}
                      {log.user_email && <DetailRow label="User" value={log.user_email} />}
                      {log.user_role && <DetailRow label="Role" value={log.user_role} />}
                      {orgName && <DetailRow label="Organization" value={orgName} />}
                      {log.component_name && <DetailRow label="Component" value={log.component_name} mono />}
                      {log.user_agent && <DetailRow label="Browser" value={shortenUA(log.user_agent)} />}
                      {log.screen_size && <DetailRow label="Screen" value={log.screen_size} />}
                      <DetailRow label="Timestamp" value={log.created_at ? new Date(log.created_at).toLocaleString() : '—'} />
                      <DetailRow label="ID" value={log.id} mono small />
                    </div>

                    {/* Stack Trace */}
                    {log.stack && (
                      <div style={s.stackSection}>
                        <div style={s.stackLabel}>Stack Trace</div>
                        <pre style={s.stackPre}>{log.stack}</pre>
                      </div>
                    )}

                    {/* Notes */}
                    <div style={{ marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Notes
                      </label>
                      <textarea
                        style={s.notesInput}
                        value={log.notes || ''}
                        onChange={e => handleUpdateNotes(log.id, e.target.value)}
                        placeholder="Add investigation notes..."
                        rows={2}
                      />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {!log.resolved && (
                        <button style={s.resolveBtn} onClick={() => handleResolve(log.id)}>
                          <Check size={13} /> Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button style={s.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ fontSize: '0.82rem', color: '#64748b', padding: '0.5rem', fontWeight: 600 }}>
            Page {page + 1}
          </span>
          <button style={s.pageBtn} disabled={filtered.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}

function StatBadge({ label, value, color, bg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: bg, borderRadius: 8 }}>
      <span style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: color + 'b0' }}>{label}</span>
    </div>
  )
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select style={s.filterSelect} value={value} onChange={onChange}>
      {children}
    </select>
  )
}

function DetailRow({ label, value, mono, small }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ width: 100, fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        flex: 1, fontSize: small ? '0.72rem' : '0.82rem', color: '#0f172a', wordBreak: 'break-all',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </span>
    </div>
  )
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function shortenUA(ua) {
  if (!ua) return '—'
  // Extract browser name and version
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)
  return match ? match[0] : ua.slice(0, 60) + '...'
}

const s = {
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' },
  headerIcon: {
    width: 52, height: 52, borderRadius: 8,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
  },
  title: { fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.15rem' },
  sub: { color: '#64748b', fontSize: '0.9rem' },
  statsRow: { display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.85rem', background: '#fff', borderRadius: 7,
    border: '1.5px solid #e2e8f0', flex: '1 1 200px',
  },
  searchInput: { flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem', color: '#0f172a' },
  filterSelect: {
    padding: '0.5rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 7,
    fontSize: '0.82rem', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 500,
  },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.5rem 0.85rem', background: '#f1f5f9', border: 'none', borderRadius: 7,
    fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer',
  },
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    padding: '3rem', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
  },
  logCard: {
    background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
    borderLeft: '3px solid #dc2626', overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  logHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.7rem 1rem', cursor: 'pointer', gap: '0.75rem',
  },
  sourceTag: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
    flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em',
  },
  severityDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  logMessage: {
    fontSize: '0.82rem', fontWeight: 500, color: '#0f172a', fontFamily: 'monospace',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  orgChip: {
    padding: '0.12rem 0.45rem', borderRadius: 4, background: '#f1f5f9',
    fontSize: '0.68rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap',
  },
  logTime: { fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 500 },
  logDetail: {
    padding: '0.75rem 1rem 1rem', borderTop: '1px solid #f1f5f9', background: '#fafbfc',
  },
  detailGrid: { display: 'flex', flexDirection: 'column' },
  stackSection: { marginTop: '0.75rem' },
  stackLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' },
  stackPre: {
    padding: '0.75rem', background: '#1e293b', color: '#e2e8f0', borderRadius: 6,
    fontSize: '0.72rem', fontFamily: 'monospace', lineHeight: 1.5,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'auto', maxHeight: 200,
  },
  notesInput: {
    width: '100%', padding: '0.5rem 0.7rem', border: '1.5px solid #e2e8f0', borderRadius: 6,
    fontSize: '0.82rem', color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
    marginTop: '0.3rem',
  },
  resolveBtn: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.4rem 0.85rem', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
  },
  pageBtn: {
    padding: '0.45rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 6,
    fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer',
  },
}
