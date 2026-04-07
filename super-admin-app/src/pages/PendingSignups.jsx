import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { getSuperAdminToken } from '../superAdminClient'
import { PLAN_LIMITS } from '../constants/planLimits'
import { CheckCircle, XCircle, Clock, Building2, Mail, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

export default function PendingSignups() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)
  const [noteInput, setNoteInput] = useState({})
  const [message, setMessage] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // Per-request editable overrides
  const [overrides, setOverrides] = useState({})

  useEffect(() => { loadRequests() }, [filter])

  async function loadRequests() {
    setLoading(true)
    let query = supabase
      .from('pending_org_signups')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  function planDefaults(plan) {
    const pd = PLAN_LIMITS[plan] || PLAN_LIMITS.free
    return {
      plan,
      license_mentors: pd.limits.mentors === Infinity ? -1 : pd.limits.mentors,
      license_mentees: pd.limits.mentees === Infinity ? -1 : pd.limits.mentees,
      license_staff: pd.limits.staff === Infinity ? -1 : pd.limits.staff,
      license_assistant_mentors: pd.limits.assistant_mentors === Infinity ? -1 : pd.limits.assistant_mentors,
      license_offerings: pd.limits.offerings === Infinity ? -1 : pd.limits.offerings,
    }
  }

  function getOverrides(reqId, req) {
    if (overrides[reqId]) return overrides[reqId]
    return planDefaults(req.plan || 'free')
  }

  function setOverride(reqId, key, value) {
    const current = getOverrides(reqId, requests.find(r => r.id === reqId))
    const updated = { ...current, [key]: value }
    // When plan changes, reset limits to the new plan's defaults
    if (key === 'plan') {
      const newDefaults = planDefaults(value)
      Object.assign(updated, newDefaults)
    }
    setOverrides(prev => ({ ...prev, [reqId]: updated }))
  }

  function toggleExpand(reqId, req) {
    if (expandedId === reqId) {
      setExpandedId(null)
    } else {
      setExpandedId(reqId)
      if (!overrides[reqId]) {
        setOverrides(prev => ({
          ...prev,
          [reqId]: planDefaults(req.plan || 'free'),
        }))
      }
    }
  }

  async function handleAction(requestId, action) {
    setActionLoading(requestId)
    setMessage(null)

    const token = getSuperAdminToken()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const reqOverrides = overrides[requestId] || {}

    const bodyPayload = {
      request_id: requestId,
      action,
      reviewer_note: noteInput[requestId] || '',
    }

    // Include plan override and license limits on approve
    if (action === 'approve') {
      if (reqOverrides.plan) {
        bodyPayload.plan_override = reqOverrides.plan
      }
      const ll = {
        mentors: parseInt(reqOverrides.license_mentors) || -1,
        mentees: parseInt(reqOverrides.license_mentees) || -1,
        staff: parseInt(reqOverrides.license_staff) || -1,
        assistant_mentors: parseInt(reqOverrides.license_assistant_mentors) || -1,
        offerings: parseInt(reqOverrides.license_offerings) || -1,
      }
      bodyPayload.license_limits = ll
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/approve-org-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(bodyPayload),
    })

    const data = await res.json()
    setActionLoading(null)

    if (!res.ok || data.error) {
      setMessage({ type: 'error', text: data.error || 'Action failed' })
      return
    }

    if (action === 'approve') {
      setMessage({
        type: 'success',
        text: `Organization "${data.organization?.name}" created. A password reset email has been sent to ${data.admin_email}.`,
      })
    } else {
      setMessage({ type: 'success', text: 'Request rejected. A notification email has been sent.' })
    }

    setExpandedId(null)
    loadRequests()
  }

  const statusColors = {
    pending: { bg: '#fef3c7', color: '#d97706' },
    approved: { bg: '#dcfce7', color: '#16a34a' },
    rejected: { bg: '#fef2f2', color: '#dc2626' },
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Organization Signups</h1>
          <p style={s.sub}>Review and approve new organization requests</p>
        </div>
        <button style={s.refreshBtn} onClick={loadRequests}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {message && (
        <div style={{
          ...s.messageBox,
          background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: message.type === 'error' ? '#dc2626' : '#16a34a',
        }}>
          {message.text}
        </div>
      )}

      <div style={s.filters}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button
            key={f}
            style={{ ...s.filterBtn, ...(filter === f ? s.filterActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f === 'pending' && <Clock size={13} />}
            {f === 'approved' && <CheckCircle size={13} />}
            {f === 'rejected' && <XCircle size={13} />}
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={s.emptyCard}>
          <Building2 size={24} color="#cbd5e1" />
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {filter === 'pending' ? 'No pending signup requests' : 'No requests found'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {requests.map(req => {
            const sc = statusColors[req.status] || statusColors.pending
            const isExpanded = expandedId === req.id
            const ov = getOverrides(req.id, req)

            return (
              <div key={req.id} style={s.card}>
                <div style={s.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <Building2 size={18} color="#6366f1" />
                    <div>
                      <div style={s.orgName}>{req.org_name}</div>
                      <div style={s.orgSlug}>app.mentordesk.app/{req.org_slug}</div>
                    </div>
                  </div>
                  <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>
                    {req.status}
                  </span>
                </div>

                <div style={s.cardDetails}>
                  <div style={s.detailRow}>
                    <Mail size={13} color="#94a3b8" />
                    <span>{req.admin_email}</span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                      {req.admin_first_name} {req.admin_last_name}
                    </span>
                  </div>
                  <div style={s.detailRow}>
                    <span style={s.planBadge}>{req.plan}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      {new Date(req.created_at).toLocaleDateString()} at {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {req.reviewer_note && (
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.5rem', fontStyle: 'italic' }}>
                      Note: {req.reviewer_note}
                    </div>
                  )}
                </div>

                {req.status === 'pending' && (
                  <div style={s.cardActions}>
                    {/* Note input for both approve and reject */}
                    <input
                      style={s.noteInput}
                      type="text"
                      placeholder="Optional note (included in rejection email)..."
                      value={noteInput[req.id] || ''}
                      onChange={e => setNoteInput(prev => ({ ...prev, [req.id]: e.target.value }))}
                    />

                    {/* Expand/collapse review panel */}
                    <button
                      style={s.reviewToggle}
                      onClick={() => toggleExpand(req.id, req)}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? 'Hide review options' : 'Review plan & limits before approving'}
                    </button>

                    {/* Expanded review panel */}
                    {isExpanded && (
                      <div style={s.reviewPanel}>
                        <div style={s.reviewRow}>
                          <div style={s.reviewField}>
                            <label style={s.reviewLabel}>Plan</label>
                            <select
                              style={s.reviewSelect}
                              value={ov.plan}
                              onChange={e => setOverride(req.id, 'plan', e.target.value)}
                            >
                              <option value="free">Free</option>
                              <option value="starter">Starter</option>
                              <option value="pro">Pro</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                            {ov.plan !== req.plan && (
                              <span style={s.changed}>Changed from {req.plan}</span>
                            )}
                          </div>
                        </div>

                        {/* Features included in this plan */}
                        <div style={{ marginTop: '0.75rem' }}>
                          <label style={{ ...s.reviewLabel, marginBottom: '0.5rem', display: 'block' }}>
                            Modules included
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {Object.entries((PLAN_LIMITS[ov.plan] || PLAN_LIMITS.free).features).map(([key, enabled]) => (
                              <span key={key} style={{
                                padding: '0.2rem 0.55rem', borderRadius: 5, fontSize: '0.72rem', fontWeight: 600,
                                background: enabled ? '#dcfce7' : '#f1f5f9',
                                color: enabled ? '#16a34a' : '#94a3b8',
                                textTransform: 'capitalize',
                              }}>
                                {enabled ? '\u2713' : '\u2717'} {key}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginTop: '0.75rem' }}>
                          <label style={{ ...s.reviewLabel, marginBottom: '0.5rem', display: 'block' }}>
                            License Limits <span style={{ fontWeight: 400, color: '#94a3b8' }}>(-1 = unlimited)</span>
                          </label>
                          <div style={s.limitsGrid}>
                            {[
                              { key: 'license_mentors', label: 'Mentors' },
                              { key: 'license_mentees', label: 'Mentees' },
                              { key: 'license_staff', label: 'Staff' },
                              { key: 'license_assistant_mentors', label: 'Asst. Mentors' },
                              { key: 'license_offerings', label: 'Offerings' },
                            ].map(f => (
                              <div key={f.key}>
                                <label style={s.limitLabel}>{f.label}</label>
                                <input
                                  style={s.limitInput}
                                  type="number"
                                  min="-1"
                                  value={ov[f.key]}
                                  onChange={e => setOverride(req.id, f.key, e.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        style={s.approveBtn}
                        onClick={() => handleAction(req.id, 'approve')}
                        disabled={actionLoading === req.id}
                      >
                        <CheckCircle size={14} />
                        {actionLoading === req.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        style={s.rejectBtn}
                        onClick={() => handleAction(req.id, 'reject')}
                        disabled={actionLoading === req.id}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#64748b', fontSize: '0.9rem' },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.55rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: 8,
    fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer',
  },
  messageBox: {
    padding: '0.8rem 1rem', borderRadius: 8, fontSize: '0.85rem',
    fontWeight: 500, marginBottom: '1.25rem',
  },
  filters: {
    display: 'flex', gap: '0.4rem', marginBottom: '1.25rem',
  },
  filterBtn: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.45rem 0.85rem', background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer',
  },
  filterActive: {
    background: '#eef2ff', borderColor: '#c7d2fe', color: '#6366f1',
  },
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '3rem', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
  },
  card: {
    background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9',
  },
  orgName: { fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' },
  orgSlug: { fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' },
  badge: {
    padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.72rem',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  planBadge: {
    padding: '0.15rem 0.5rem', borderRadius: 4, background: '#f1f5f9',
    fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'capitalize',
  },
  cardDetails: {
    padding: '0.85rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: '0.35rem',
  },
  detailRow: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '0.85rem', color: '#374151',
  },
  cardActions: {
    padding: '0.85rem 1.25rem', borderTop: '1px solid #f1f5f9',
    background: '#fafbfc',
    display: 'flex', flexDirection: 'column', gap: '0.6rem',
  },
  noteInput: {
    padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 6,
    fontSize: '0.85rem', color: '#0f172a', outline: 'none', width: '100%',
  },
  reviewToggle: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.4rem 0', background: 'none', border: 'none',
    fontSize: '0.82rem', fontWeight: 600, color: '#6366f1', cursor: 'pointer',
  },
  reviewPanel: {
    background: '#fff', borderRadius: 8, border: '1.5px solid #e2e8f0',
    padding: '1rem 1.25rem',
  },
  reviewRow: {
    display: 'flex', gap: '1rem', flexWrap: 'wrap',
  },
  reviewField: {
    display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 200px',
  },
  reviewLabel: {
    fontSize: '0.82rem', fontWeight: 600, color: '#374151',
  },
  reviewSelect: {
    padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 6,
    fontSize: '0.85rem', color: '#0f172a', outline: 'none', background: '#fff',
  },
  changed: {
    fontSize: '0.72rem', color: '#d97706', fontWeight: 600, marginTop: '0.15rem',
  },
  limitsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: '0.75rem',
  },
  limitLabel: {
    fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem', display: 'block',
  },
  limitInput: {
    padding: '0.45rem 0.65rem', border: '1.5px solid #e2e8f0', borderRadius: 6,
    fontSize: '0.85rem', color: '#0f172a', outline: 'none', width: '100%',
  },
  approveBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.5rem 1rem', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  },
  rejectBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.5rem 1rem', background: '#fff', color: '#dc2626',
    border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  },
}
