import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { CheckCircle, XCircle, Clock, UserPlus, Mail } from 'lucide-react'

const STATUS_STYLES = {
  pending:  { bg: '#fff7ed', color: '#ea580c' },
  approved: { bg: '#f0fdf4', color: '#16a34a' },
  rejected: { bg: '#fef2f2', color: '#dc2626' },
}

export default function SignupRequests() {
  const { organizationId } = useRole()
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => { fetchRequests() }, [filter])

  async function fetchRequests() {
    setLoading(true)
    let q = supabase
      .from('signup_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (filter !== 'all') q = q.eq('status', filter)

    const { data } = await q
    if (data) setRequests(data)
    setLoading(false)
  }

  async function handleApprove(req) {
    setProcessing(req.id)
    setError(null)

    // Invoke invite-user to create the account
    const { error: invErr } = await supabase.functions.invoke('invite-user', {
      body: {
        email: req.email,
        role: 'mentee',
        organization_id: organizationId,
        first_name: req.first_name,
        last_name: req.last_name,
      },
    })

    if (invErr) {
      setError(`Failed to create account for ${req.email}: ${invErr.message}`)
      setProcessing(null)
      return
    }

    // Also create the mentee record
    await supabase.from('mentees').insert({
      first_name: req.first_name,
      last_name: req.last_name,
      email: req.email,
      phone: req.phone || null,
      organization_id: organizationId,
      status: 'Lead',
    })

    // Mark request as approved
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('signup_requests').update({
      status: 'approved',
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id)

    setSuccess(`Account created for ${req.first_name} ${req.last_name}. They'll receive an email to set their password.`)
    setProcessing(null)
    fetchRequests()
  }

  async function handleReject(req) {
    setProcessing(req.id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('signup_requests').update({
      status: 'rejected',
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id)
    setProcessing(null)
    fetchRequests()
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  const FILTERS = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Signup Requests</h1>
          <p style={s.sub}>Review and approve account requests from prospective mentees</p>
        </div>
      </div>

      {success && <div style={s.successBox}>{success}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.tabs}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && (
              <span style={s.badge}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={s.empty}>
          <UserPlus size={36} color="#d1d5db" strokeWidth={1.5} />
          <p>No {filter === 'all' ? '' : filter} requests.</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Name', 'Email', 'Phone', 'Message', 'Submitted', 'Status', 'Actions'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const ss = STATUS_STYLES[req.status] || STATUS_STYLES.pending
                return (
                  <tr key={req.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.name}>{req.first_name} {req.last_name}</span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Mail size={12} color="#9ca3af" />
                        <span style={s.email}>{req.email}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={s.phone}>{req.phone || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.message}>{req.message || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.date}>{new Date(req.created_at).toLocaleDateString()}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.statusBadge, backgroundColor: ss.bg, color: ss.color }}>
                        {req.status === 'pending' && <Clock size={11} />}
                        {req.status === 'approved' && <CheckCircle size={11} />}
                        {req.status === 'rejected' && <XCircle size={11} />}
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </td>
                    <td style={s.td}>
                      {req.status === 'pending' && (
                        <div style={s.actions}>
                          <button
                            style={s.approveBtn}
                            onClick={() => handleApprove(req)}
                            disabled={processing === req.id}
                          >
                            {processing === req.id ? '…' : 'Approve'}
                          </button>
                          <button
                            style={s.rejectBtn}
                            onClick={() => handleReject(req)}
                            disabled={processing === req.id}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {req.status !== 'pending' && req.reviewed_at && (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {new Date(req.reviewed_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  tabs: { display: 'flex', gap: '0.25rem', marginBottom: '1rem' },
  tab: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  tabActive: { borderColor: '#6366f1', color: '#6366f1', background: '#eef2ff' },
  badge: { padding: '0.1rem 0.45rem', borderRadius: 49, background: '#fef2f2', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700 },
  tableWrap: { backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.85rem 1rem', verticalAlign: 'middle' },
  name: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  email: { color: '#6b7280', fontSize: '0.82rem' },
  phone: { color: '#6b7280', fontSize: '0.82rem' },
  message: { color: '#6b7280', fontSize: '0.82rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
  date: { color: '#9ca3af', fontSize: '0.82rem' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: 49, fontSize: '0.75rem', fontWeight: 600 },
  actions: { display: 'flex', gap: '0.4rem' },
  approveBtn: { padding: '0.3rem 0.7rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  rejectBtn: { padding: '0.3rem 0.7rem', background: 'none', border: '1px solid #fecaca', borderRadius: 4, color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
}
