import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function MentorAssignMentees() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [mentor, setMentor] = useState(null)
  const [assignedMentees, setAssignedMentees] = useState([])
  const [unassignedMentees, setUnassignedMentees] = useState([])
  const [selectedMenteeId, setSelectedMenteeId] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchMentor()
    fetchMentees()
  }, [id])

  async function fetchMentor() {
    const { data } = await supabase.from('mentors').select('id, first_name, last_name').eq('id', id).single()
    if (data) setMentor(data)
  }

  async function fetchMentees() {
    const { data } = await supabase.from('mentees').select('id, first_name, last_name, email, status, mentor_id').order('last_name')
    if (data) {
      setAssignedMentees(data.filter(m => m.mentor_id === id))
      setUnassignedMentees(data.filter(m => !m.mentor_id))
    }
  }

  async function assignMentee() {
    if (!selectedMenteeId) return
    setError(null)
    const { error } = await supabase.from('mentees').update({ mentor_id: id }).eq('id', selectedMenteeId)
    if (error) { setError(error.message); return }
    setSelectedMenteeId('')
    setSuccess('Mentee assigned.')
    fetchMentees()
  }

  async function removeMentee(menteeId) {
    setError(null)
    const { error } = await supabase.from('mentees').update({ mentor_id: null }).eq('id', menteeId)
    if (error) { setError(error.message); return }
    setSuccess('Mentee removed.')
    fetchMentees()
  }

  if (!mentor) return <div style={st.loading}>Loading...</div>

  return (
    <div style={st.container}>
      <div style={st.header}>
        <button style={st.back} onClick={() => navigate('/admin/mentors')}>← Mentors</button>
        <div>
          <h1 style={st.title}>Assign Mentees</h1>
          <p style={st.subtitle}>{mentor.first_name} {mentor.last_name} — {assignedMentees.length} mentee{assignedMentees.length !== 1 ? 's' : ''} assigned</p>
        </div>
      </div>

      {success && <p style={st.success}>{success}</p>}
      {error && <p style={st.error}>{error}</p>}

      <div style={st.card}>
        <h2 style={st.cardTitle}>Assigned Mentees</h2>
        <div style={st.cardBody}>
          {assignedMentees.length === 0 ? (
            <p style={st.empty}>No mentees assigned yet.</p>
          ) : (
            <div style={st.list}>
              {assignedMentees.map(m => (
                <div key={m.id} style={st.row}>
                  <div style={st.info}>
                    <span style={st.name}>{m.first_name} {m.last_name}</span>
                    {m.email && <span style={st.email}>{m.email}</span>}
                    {m.status && <span style={st.badge}>{m.status}</span>}
                  </div>
                  <button style={st.removeBtn} onClick={() => removeMentee(m.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div style={st.assignRow}>
            <select style={{ ...st.input, flex: 1 }} value={selectedMenteeId} onChange={e => setSelectedMenteeId(e.target.value)}>
              <option value="">Select a mentee to assign...</option>
              {unassignedMentees.map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}{m.status ? ` — ${m.status}` : ''}</option>
              ))}
            </select>
            <button style={st.assignBtn} onClick={assignMentee} disabled={!selectedMenteeId}>Assign</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const st = {
  container: { padding: '2rem', maxWidth: 700 },
  loading: { padding: '3rem', textAlign: 'center', color: '#718096' },
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  back: { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, padding: 0 },
  title: { margin: '0 0 0.15rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, color: '#9ca3af', fontSize: '0.875rem' },
  success: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.65rem 1rem', color: '#15803d', fontSize: '0.875rem', marginBottom: '0.5rem' },
  error: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.5rem' },
  card: { backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #f3f4f6' },
  cardTitle: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  cardBody: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: 7, border: '1px solid #e5e7eb' },
  info: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  name: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  email: { color: '#9ca3af', fontSize: '0.82rem' },
  badge: { fontSize: '0.72rem', backgroundColor: '#eef2ff', color: '#6366f1', borderRadius: 4, padding: '0.1rem 0.5rem', fontWeight: 600 },
  removeBtn: { padding: '0.3rem 0.7rem', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' },
  assignRow: { display: 'flex', gap: '0.65rem', alignItems: 'center', marginTop: '0.5rem' },
  input: { padding: '0.55rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', backgroundColor: '#fff' },
  assignBtn: { padding: '0.55rem 1rem', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' },
  empty: { color: '#9ca3af', fontSize: '0.875rem', margin: 0 },
}
