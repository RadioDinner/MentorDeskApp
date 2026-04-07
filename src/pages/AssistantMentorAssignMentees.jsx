import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AssistantMentorAssignMentees() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(null)
  const [assignedMentee, setAssignedMentee] = useState(null)
  const [allMentees, setAllMentees] = useState([])
  const [menteeAssignId, setMenteeAssignId] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchPartner()
    fetchMentees()
  }, [id])

  async function fetchPartner() {
    const { data } = await supabase.from('assistant_mentors').select('id, first_name, last_name, mentee_id').eq('id', id).single()
    if (data) {
      setPartner(data)
      if (data.mentee_id) {
        const { data: mentee } = await supabase.from('mentees').select('id, first_name, last_name, email').eq('id', data.mentee_id).single()
        if (mentee) setAssignedMentee(mentee)
      }
    }
  }

  async function fetchMentees() {
    const { data } = await supabase.from('mentees').select('id, first_name, last_name, email').order('last_name')
    if (data) setAllMentees(data)
  }

  async function handleAssign() {
    if (!menteeAssignId) return
    setError(null)
    const { error } = await supabase.from('assistant_mentors').update({ mentee_id: menteeAssignId }).eq('id', id)
    if (error) { setError(error.message); return }
    const mentee = allMentees.find(m => m.id === menteeAssignId)
    setAssignedMentee(mentee)
    setMenteeAssignId('')
    setSuccess('Mentee assigned.')
  }

  async function handleRemove() {
    setError(null)
    const { error } = await supabase.from('assistant_mentors').update({ mentee_id: null }).eq('id', id)
    if (error) { setError(error.message); return }
    setAssignedMentee(null)
    setSuccess('Mentee removed.')
  }

  if (!partner) return <div style={st.loading}>Loading...</div>

  return (
    <div style={st.container}>
      <div style={st.header}>
        <button style={st.back} onClick={() => navigate('/admin/assistant-mentors')}>← Assistant Mentors</button>
        <div>
          <h1 style={st.title}>Assign Mentee</h1>
          <p style={st.subtitle}>{partner.first_name} {partner.last_name}</p>
        </div>
      </div>

      {success && <p style={st.success}>{success}</p>}
      {error && <p style={st.error}>{error}</p>}

      <div style={st.card}>
        <h2 style={st.cardTitle}>Assigned Mentee</h2>
        <div style={st.cardBody}>
          {assignedMentee ? (
            <div style={st.row}>
              <div style={st.info}>
                <span style={st.name}>{assignedMentee.first_name} {assignedMentee.last_name}</span>
                {assignedMentee.email && <span style={st.email}>{assignedMentee.email}</span>}
              </div>
              <button style={st.removeBtn} onClick={handleRemove}>Remove</button>
            </div>
          ) : (
            <p style={st.empty}>No mentee assigned.</p>
          )}

          {!assignedMentee && (
            <div style={st.assignRow}>
              <select style={{ ...st.input, flex: 1 }} value={menteeAssignId} onChange={e => setMenteeAssignId(e.target.value)}>
                <option value="">Select a mentee to assign...</option>
                {allMentees.map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
              <button style={st.assignBtn} onClick={handleAssign} disabled={!menteeAssignId}>Assign</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const st = {
  container: { padding: '2rem', maxWidth: 700 },
  loading: { padding: '3rem', textAlign: 'center', color: '#718096' },
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  back: { background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, padding: 0 },
  title: { margin: '0 0 0.15rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' },
  subtitle: { margin: 0, color: '#9ca3af', fontSize: '0.875rem' },
  success: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.65rem 1rem', color: '#15803d', fontSize: '0.875rem', marginBottom: '0.5rem' },
  error: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 1rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.5rem' },
  card: { backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #f3f4f6' },
  cardTitle: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  cardBody: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: 7, border: '1px solid #e5e7eb' },
  info: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  name: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  email: { color: '#9ca3af', fontSize: '0.82rem' },
  removeBtn: { padding: '0.3rem 0.7rem', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' },
  assignRow: { display: 'flex', gap: '0.65rem', alignItems: 'center', marginTop: '0.5rem' },
  input: { padding: '0.55rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', backgroundColor: '#fff' },
  assignBtn: { padding: '0.55rem 1rem', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' },
  empty: { color: '#9ca3af', fontSize: '0.875rem', margin: 0 },
}
