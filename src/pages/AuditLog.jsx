import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Search, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

const TABLE_LABELS = {
  mentees: 'Mentee',
  mentors: 'Mentor',
  assistant_mentors: 'Assistant Mentor',
  offerings: 'Offering',
  courses: 'Course',
  lessons: 'Lesson',
  mentee_offerings: 'Mentee Offering',
  mentee_lesson_progress: 'Lesson Progress',
  meetings: 'Meeting',
}

const ACTION_STYLES = {
  INSERT: { bg: '#f0fdf4', color: '#16a34a', label: 'Created' },
  UPDATE: { bg: '#fffbeb', color: '#d97706', label: 'Updated' },
  DELETE: { bg: '#fef2f2', color: '#dc2626', label: 'Deleted' },
}

const PAGE_SIZE = 50

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)

  // Filters
  const [filterTable, setFilterTable] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterEmailInput, setFilterEmailInput] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterTable) q = q.eq('table_name', filterTable)
    if (filterAction) q = q.eq('action', filterAction)
    if (filterEmail) q = q.ilike('changed_by_email', `%${filterEmail}%`)

    const { data, count, error } = await q
    if (!error) { setLogs(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [page, filterTable, filterAction, filterEmail])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  function applyEmailFilter() {
    setPage(0)
    setFilterEmail(filterEmailInput)
  }

  function handleTableFilter(val) { setPage(0); setFilterTable(val) }
  function handleActionFilter(val) { setPage(0); setFilterAction(val) }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Audit Log</h1>
          <p style={s.subtitle}>{total.toLocaleString()} total events recorded</p>
        </div>
        <button style={s.refreshBtn} onClick={() => fetchLogs()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <select style={s.filterSelect} value={filterTable} onChange={e => handleTableFilter(e.target.value)}>
          <option value="">All tables</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select style={s.filterSelect} value={filterAction} onChange={e => handleActionFilter(e.target.value)}>
          <option value="">All actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <div style={s.searchWrap}>
          <Search size={14} style={s.searchIcon} />
          <input
            style={s.searchInput}
            placeholder="Filter by user email…"
            value={filterEmailInput}
            onChange={e => setFilterEmailInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyEmailFilter()}
          />
        </div>
        <button style={s.searchBtn} onClick={applyEmailFilter}>Search</button>
        {(filterTable || filterAction || filterEmail) && (
          <button style={s.clearBtn} onClick={() => {
            setFilterTable(''); setFilterAction(''); setFilterEmail(''); setFilterEmailInput(''); setPage(0)
          }}>
            Clear
          </button>
        )}
      </div>

      {/* Log table */}
      <div style={s.card}>
        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={s.empty}>No audit log entries found.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {['Timestamp', 'User', 'Table', 'Action', 'Changes'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const as = ACTION_STYLES[log.action] || ACTION_STYLES.UPDATE
                const isExpanded = expandedId === log.id
                const changedFields = log.changed_fields ? Object.entries(log.changed_fields) : []
                const tableLabel = TABLE_LABELS[log.table_name] || log.table_name

                return (
                  <>
                    <tr key={log.id} style={s.tr}>
                      <td style={s.td}>
                        <div style={s.timestamp}>{formatTs(log.created_at)}</div>
                      </td>
                      <td style={s.td}>
                        <div style={s.userEmail}>{log.changed_by_email || <span style={s.system}>system</span>}</div>
                      </td>
                      <td style={s.td}>
                        <span style={s.tableTag}>{tableLabel}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.actionBadge, backgroundColor: as.bg, color: as.color }}>
                          {as.label}
                        </span>
                      </td>
                      <td style={s.td}>
                        {log.action === 'UPDATE' && changedFields.length > 0 ? (
                          <div>
                            <div style={s.diffPreview}>
                              {changedFields.slice(0, 2).map(([field, diff]) => (
                                <FieldDiff key={field} field={field} diff={diff} />
                              ))}
                              {changedFields.length > 2 && (
                                <button style={s.expandBtn} onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  {isExpanded ? 'Less' : `+${changedFields.length - 2} more`}
                                </button>
                              )}
                            </div>
                            {isExpanded && changedFields.length > 2 && (
                              <div style={s.diffExtra}>
                                {changedFields.slice(2).map(([field, diff]) => (
                                  <FieldDiff key={field} field={field} diff={diff} />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : log.action === 'INSERT' ? (
                          <span style={s.insertNote}>New record created</span>
                        ) : log.action === 'DELETE' ? (
                          <span style={s.deleteNote}>Record deleted</span>
                        ) : (
                          <span style={s.noChange}>—</span>
                        )}
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={s.pagination}>
          <button style={s.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={s.pageInfo}>Page {page + 1} of {totalPages}</span>
          <button style={s.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

function FieldDiff({ field, diff }) {
  const fromVal = formatVal(diff?.from)
  const toVal   = formatVal(diff?.to)
  return (
    <div style={s.fieldDiff}>
      <span style={s.fieldName}>{formatFieldName(field)}</span>
      <span style={s.fromVal}>{fromVal}</span>
      <span style={s.arrow}>→</span>
      <span style={s.toVal}>{toVal}</span>
    </div>
  )
}

function formatVal(v) {
  if (v === null || v === undefined) return <em style={{ color: '#9ca3af' }}>null</em>
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v).replace(/^"|"$/g, '')
  if (!s) return <em style={{ color: '#9ca3af' }}>empty</em>
  if (s.length > 60) return s.slice(0, 60) + '…'
  return s
}

function formatFieldName(f) {
  return f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatTs(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const s = {
  container: { maxWidth: 1100 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  subtitle: { color: '#9ca3af', fontSize: '0.875rem', margin: 0 },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 4, color: '#6b7280', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  filterBar: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' },
  filterSelect: { padding: '0.5rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.82rem', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1.5px solid #e5e7eb', borderRadius: 4, padding: '0.45rem 0.75rem', backgroundColor: '#fff', flex: '1 1 200px' },
  searchIcon: { color: '#9ca3af', flexShrink: 0 },
  searchInput: { border: 'none', outline: 'none', fontSize: '0.82rem', color: '#111827', width: '100%', backgroundColor: 'transparent' },
  searchBtn: { padding: '0.5rem 1rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  clearBtn: { padding: '0.5rem 0.85rem', background: 'none', border: '1.5px solid #fca5a5', borderRadius: 4, color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  card: { backgroundColor: '#fff', borderRadius: 8, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  loading: { padding: '3rem', textAlign: 'center', color: '#9ca3af' },
  empty: { padding: '3rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#374151', verticalAlign: 'top' },
  timestamp: { color: '#6b7280', fontSize: '0.78rem', whiteSpace: 'nowrap' },
  userEmail: { color: '#374151', fontSize: '0.8rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  system: { color: '#9ca3af', fontStyle: 'italic' },
  tableTag: { display: 'inline-block', padding: '0.15rem 0.55rem', backgroundColor: '#eef2ff', color: '#4f46e5', borderRadius: 49, fontSize: '0.72rem', fontWeight: 600 },
  actionBadge: { display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: 49, fontSize: '0.72rem', fontWeight: 700 },
  diffPreview: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  diffExtra: { display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem' },
  fieldDiff: { display: 'flex', alignItems: 'baseline', gap: '0.3rem', fontSize: '0.78rem', flexWrap: 'wrap' },
  fieldName: { fontWeight: 600, color: '#374151', flexShrink: 0 },
  fromVal: { color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 3, padding: '0 0.3rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  arrow: { color: '#9ca3af', fontSize: '0.7rem' },
  toVal: { color: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 3, padding: '0 0.3rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  expandBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '0.1rem 0', marginTop: '0.15rem' },
  insertNote: { color: '#16a34a', fontSize: '0.78rem', fontStyle: 'italic' },
  deleteNote: { color: '#dc2626', fontSize: '0.78rem', fontStyle: 'italic' },
  noChange: { color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' },
  pageBtn: { padding: '0.5rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 4, background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  pageInfo: { color: '#6b7280', fontSize: '0.82rem' },
}
