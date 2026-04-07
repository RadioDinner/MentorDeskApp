import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { User, Mail, Phone, Save, CheckCircle, AlertCircle } from 'lucide-react'
import PhoneInput from '../components/PhoneInput'

export default function EditProfile() {
  const { session, organizationId, activeRole, roleMap } = useRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staffRecord, setStaffRecord] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [emailNote, setEmailNote] = useState(null)

  useEffect(() => {
    loadProfile()
  }, [session, organizationId])

  async function loadProfile() {
    if (!session?.user) return
    setLoading(true)

    // Try to find a staff record for this user
    // First check if admin role has an entity_id pointing to a staff record
    const adminEntityId = roleMap?.admin || roleMap?.staff
    let staff = null

    if (adminEntityId) {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('id', adminEntityId)
        .maybeSingle()
      staff = data
    }

    // Fallback: match by email
    if (!staff) {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('email', session.user.email)
        .maybeSingle()
      staff = data
    }

    setStaffRecord(staff)
    setForm({
      first_name: staff?.first_name || '',
      last_name: staff?.last_name || '',
      email: session.user.email || '',
      phone: staff?.phone || '',
    })
    setLoading(false)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    setEmailNote(null)

    try {
      // Update email via Supabase auth if changed
      const emailChanged = form.email !== session.user.email
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: form.email })
        if (emailError) {
          setError(`Email update failed: ${emailError.message}`)
          setSaving(false)
          return
        }
        setEmailNote('A confirmation link has been sent to your new email address. Please check your inbox to complete the email change.')
      }

      // Update or create staff record
      if (staffRecord) {
        const { error: staffError } = await supabase
          .from('staff')
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
          })
          .eq('id', staffRecord.id)
        if (staffError) {
          setError(`Profile update failed: ${staffError.message}`)
          setSaving(false)
          return
        }
      } else if (organizationId) {
        // No staff record exists — create one so admin has an editable profile
        const { data: newStaff, error: insertError } = await supabase
          .from('staff')
          .insert({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            role_title: 'Administrator',
            organization_id: organizationId,
          })
          .select()
          .single()
        if (insertError) {
          setError(`Profile creation failed: ${insertError.message}`)
          setSaving(false)
          return
        }
        setStaffRecord(newStaff)
      }

      setSuccess('Profile updated successfully.')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
        Loading profile…
      </div>
    )
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Edit Profile</h1>
          <p style={s.pageSubtitle}>Update your personal information and email address</p>
        </div>
      </div>

      {success && (
        <div style={s.successBox}>
          <CheckCircle size={15} strokeWidth={2} />
          <span>{success}</span>
        </div>
      )}

      {emailNote && (
        <div style={s.infoBox}>
          <Mail size={15} strokeWidth={2} />
          <span>{emailNote}</span>
        </div>
      )}

      {error && (
        <div style={s.errorBox}>
          <AlertCircle size={15} strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardHeader}>
          <User size={18} strokeWidth={2} color="#6366f1" />
          <h2 style={s.cardTitle}>Personal Information</h2>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.row}>
            <div style={s.fieldGroup}>
              <label style={s.label}>First Name</label>
              <input
                style={s.input}
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="Enter first name"
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Last Name</label>
              <input
                style={s.input}
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="Enter last name"
              />
            </div>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>
              <Mail size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Email Address
            </label>
            <input
              style={s.input}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
            {form.email !== session.user.email && (
              <p style={s.fieldHint}>
                Changing your email will send a confirmation link to the new address.
              </p>
            )}
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>
              <Phone size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Phone
            </label>
            <PhoneInput name="phone" value={form.phone} onChange={handleChange} />
          </div>

          <div style={s.formActions}>
            <button type="submit" style={s.saveBtn} disabled={saving}>
              <Save size={15} strokeWidth={2} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const s = {
  pageHeader: { marginBottom: '1.75rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem' },
  card: { backgroundColor: '#fff', borderRadius: 7, boxShadow: 'var(--shadow-md)', overflow: 'hidden', border: '1px solid #f3f4f6', maxWidth: 600 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6' },
  cardTitle: { fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' },
  input: { padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  fieldHint: { fontSize: '0.78rem', color: '#d97706', margin: '0.2rem 0 0' },
  formActions: { display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' },
  successBox: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  infoBox: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', color: '#92400e', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
}
