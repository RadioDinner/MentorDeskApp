import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { uploadAvatar } from '../utils/avatarUpload'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput from '../components/PhoneInput'
import { Plus, X, CheckCircle, Clock, AlertCircle, Archive, RotateCcw, Mail, RefreshCw, CalendarPlus, Calendar, History, CreditCard, LogIn, Link2, ShieldCheck, ShieldAlert, ShieldOff, User } from 'lucide-react'
import { parseStatuses } from '../utils/statuses'
import { useRole } from '../context/RoleContext'
import InvoiceActions from '../components/InvoiceActions'
import MessagingPreferences from '../components/MessagingPreferences'

export default function MenteeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { organizationId } = useRole()
  const [form, setForm] = useState(null)
  const [mentors, setMentors] = useState([])
  const [avatarFile, setAvatarFile] = useState(null)
  const [lockCountry, setLockCountry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [allOfferings, setAllOfferings] = useState([])
  const [assignedOfferings, setAssignedOfferings] = useState([])
  const [invoices, setInvoices] = useState([])
  const [selectedOfferingId, setSelectedOfferingId] = useState('')
  const [assigningOffering, setAssigningOffering] = useState(false)
  const [assignError, setAssignError] = useState(null)
  const [assignSuccess, setAssignSuccess] = useState(null)
  const [confirmAssignId, setConfirmAssignId] = useState(null) // offering id pending confirmation
  const [statusOptions, setStatusOptions] = useState([])
  const [archiving, setArchiving] = useState(false)
  const [emailActionLoading, setEmailActionLoading] = useState(null) // 'welcome' | 'reset'
  const [emailActionMsg, setEmailActionMsg] = useState(null)         // { type: 'success'|'error', text }

  // Meetings
  const [meetings, setMeetings] = useState([])
  const [allMentors, setAllMentors] = useState([])
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [meetingForm, setMeetingForm] = useState({ mentor_id: '', scheduled_at: '', duration_minutes: 60, title: '', notes: '', mentee_offering_id: '' })
  const [savingMeeting, setSavingMeeting] = useState(false)

  // Course progress reset
  const [resettingCourse, setResettingCourse] = useState(null)

  // Arrangement credits
  const [creditBalances, setCreditBalances] = useState({}) // { [mentee_offering_id]: balance }
  const [arrangementOfferings, setArrangementOfferings] = useState([])
  const [grantForm, setGrantForm] = useState({ mentee_offering_id: '', amount: '', description: '' })
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [savingGrant, setSavingGrant] = useState(false)

  const [showEditPanel, setShowEditPanel] = useState(false)

  // Auth / account status
  const [authStatus, setAuthStatus] = useState(undefined)  // undefined=loading, null/obj=loaded, 'no_account'
  const [loginHistory, setLoginHistory] = useState([])
  const [showLoginHistory, setShowLoginHistory] = useState(false)
  const [loginHistoryLoaded, setLoginHistoryLoaded] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkResult, setLinkResult] = useState(null)

  // Activity / audit
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    fetchMentee()
    fetchMentors()
    fetchAllOfferings()
    fetchAssignedOfferings()
    fetchInvoices()
    fetchMeetings()
    fetchCreditBalances()
    fetchAuthStatus()
    fetchAuditLogs()
    supabase.from('settings').select('key, value').eq('organization_id', organizationId).then(({ data }) => {
      if (data) {
        const lock = data.find(s => s.key === 'lock_country')?.value === 'true'
        const country = data.find(s => s.key === 'default_country')?.value
        setLockCountry(lock && !!country)
        setStatusOptions(parseStatuses(data.find(s => s.key === 'mentee_statuses')?.value))
      }
    })
  }, [id])

  async function fetchMentee() {
    const { data, error: err } = await supabase.from('mentees').select('*').eq('id', id).single()
    if (err) setError(err.message)
    else setForm(data)
  }

  async function fetchMentors() {
    const { data } = await supabase.from('mentors').select('id, first_name, last_name').order('last_name')
    if (data) { setMentors(data); setAllMentors(data) }
  }

  async function fetchMeetings() {
    const { data } = await supabase
      .from('meetings')
      .select('id, scheduled_at, duration_minutes, title, notes, status, mentor:mentors(id, first_name, last_name)')
      .eq('mentee_id', id)
      .order('scheduled_at', { ascending: false })
    if (data) setMeetings(data)
  }

  async function fetchCreditBalances() {
    const { data: ledger } = await supabase
      .from('arrangement_credit_ledger')
      .select('mentee_offering_id, amount')
      .eq('mentee_id', id)
    if (!ledger) return
    const balances = {}
    ledger.forEach(row => {
      balances[row.mentee_offering_id] = (balances[row.mentee_offering_id] || 0) + row.amount
    })
    setCreditBalances(balances)
  }

  async function fetchAuditLogs() {
    setAuditLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('id, created_at, action, changed_by_email, changed_fields, table_name')
      .eq('record_id', id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setAuditLogs(data)
    setAuditLoading(false)
  }

  async function fetchAuthStatus() {
    const { data } = await supabase.rpc('get_mentee_auth_status', { p_mentee_id: id })
    if (data && data.length > 0) {
      setAuthStatus(data[0])
    } else {
      setAuthStatus('no_account')
    }
  }

  async function handleShowLoginHistory() {
    if (!showLoginHistory && !loginHistoryLoaded) {
      const { data } = await supabase.rpc('get_mentee_login_history', { p_mentee_id: id })
      setLoginHistory(data || [])
      setLoginHistoryLoaded(true)
    }
    setShowLoginHistory(v => !v)
  }

  async function handleLinkAccount(e) {
    e.preventDefault()
    setLinkLoading(true)
    setLinkResult(null)
    const { data, error } = await supabase.rpc('link_mentee_account', {
      p_email: linkEmail,
      p_mentee_id: id,
    })
    setLinkLoading(false)
    if (error) {
      setLinkResult({ type: 'error', text: error.message })
    } else if (data === 'not_found') {
      setLinkResult({ type: 'error', text: `No account found for "${linkEmail}". They may need to confirm their email first, or you can create the account via "Resend Welcome Email".` })
    } else {
      setLinkResult({ type: 'success', text: 'Account linked! They can now log in with their email.' })
      setLinkEmail('')
      fetchAuthStatus()
    }
  }

  async function fetchAllOfferings() {
    const { data } = await supabase.from('offerings').select('id, name, cost, billing_type, invoice_delay_days').neq('active', false).order('name')
    if (data) setAllOfferings(data)
  }

  async function fetchAssignedOfferings() {
    const { data } = await supabase
      .from('mentee_offerings')
      .select('id, assigned_date, status, offering:offerings(id, name, cost, billing_type, duration_value, duration_unit, offering_type)')
      .eq('mentee_id', id)
      .order('assigned_date', { ascending: false })
    if (data) {
      setAssignedOfferings(data)
      setArrangementOfferings(data.filter(ao => ao.offering?.offering_type === 'arrangement'))
    }
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, amount, due_date, status, description, notes, paid_at, issued_at, offering:offerings(name)')
      .eq('mentee_id', id)
      .order('due_date', { ascending: false })
    if (data) setInvoices(data)
  }

  function handleAssignClick() {
    if (!selectedOfferingId) return
    // If there are already active offerings, ask for confirmation first
    if (assignedOfferings.filter(ao => !ao.status || ao.status === 'active').length > 0) {
      setConfirmAssignId(selectedOfferingId)
    } else {
      doAssignOffering(selectedOfferingId)
    }
  }

  async function doAssignOffering(offeringId) {
    setConfirmAssignId(null)
    setAssignError(null)
    setAssignSuccess(null)
    setAssigningOffering(true)
    const { error: err } = await supabase.from('mentee_offerings').insert({
      mentee_id: id,
      offering_id: offeringId,
    })
    setAssigningOffering(false)
    if (err) {
      setAssignError(err.message)
    } else {
      // Auto-update mentee status if the offering name matches a status option
      const offering = allOfferings.find(o => o.id === offeringId)
      if (offering?.name) {
        const matchingStatus = statusOptions.find(
          s => s.toLowerCase() === offering.name.toLowerCase()
        )
        if (matchingStatus && matchingStatus !== form?.status) {
          await supabase.from('mentees').update({ status: matchingStatus }).eq('id', id)
          setForm(f => f ? { ...f, status: matchingStatus } : f)
        }
      }

      // Auto-create invoice based on company settings and offering overrides
      if (offering?.cost && parseFloat(offering.cost) > 0) {
        try {
          const { data: settingsData } = await supabase
            .from('settings')
            .select('key, value')
            .eq('organization_id', organizationId)
            .in('key', ['payment_terms', 'invoice_delay_days', 'invoice_default_notes'])
          const getSetting = key => settingsData?.find(s => s.key === key)?.value || ''
          const companyDelayDays = parseInt(getSetting('invoice_delay_days')) || 0
          const paymentTerms = getSetting('payment_terms') || 'due_on_receipt'

          // Offering-level override takes priority over company default
          const delayDays = offering.invoice_delay_days != null ? offering.invoice_delay_days : companyDelayDays

          const today = new Date()
          const issueDate = new Date(today)
          issueDate.setDate(issueDate.getDate() + delayDays)

          // Calculate due date from issue date based on payment terms
          const termsDays = { due_on_receipt: 0, net_15: 15, net_30: 30, net_45: 45, net_60: 60 }
          const dueDate = new Date(issueDate)
          dueDate.setDate(dueDate.getDate() + (termsDays[paymentTerms] || 0))

          const billingLabel = offering.billing_type === 'one_time' ? '' : ' (Monthly)'
          const invoiceNotes = getSetting('invoice_default_notes') || null
          await supabase.from('invoices').insert({
            mentee_id: id,
            offering_id: offeringId,
            amount: parseFloat(offering.cost),
            due_date: dueDate.toISOString().split('T')[0],
            description: `${offering.name}${billingLabel}`,
            notes: invoiceNotes,
            organization_id: organizationId,
          })
          fetchInvoices()
        } catch (invoiceErr) {
          console.error('Auto-invoice creation failed:', invoiceErr)
        }
      }

      setSelectedOfferingId('')
      setAssignSuccess(
        `Offering assigned successfully.${offering?.name && statusOptions.some(s => s.toLowerCase() === offering.name.toLowerCase()) && statusOptions.find(s => s.toLowerCase() === offering.name.toLowerCase()) !== form?.status ? ` Status updated to "${statusOptions.find(s => s.toLowerCase() === offering.name.toLowerCase())}".` : ''}`
      )
      setTimeout(() => setAssignSuccess(null), 5000)
      fetchAssignedOfferings()
      fetchMentee()
    }
  }

  async function handleRemoveOffering(moId) {
    await supabase.from('mentee_offerings').delete().eq('id', moId)
    fetchAssignedOfferings()
  }

  async function handleResetCourseProgress(offeringId) {
    if (!confirm('This will reset all lesson progress, quiz answers, and feedback for this course. This cannot be undone. Continue?')) return
    setResettingCourse(offeringId)

    // Find the course for this offering
    const { data: courseData } = await supabase.from('courses').select('id').eq('offering_id', offeringId).single()
    if (courseData) {
      // Get all lesson IDs for this course
      const { data: lessons } = await supabase.from('lessons').select('id').eq('course_id', courseData.id)
      const lessonIds = (lessons || []).map(l => l.id)

      if (lessonIds.length > 0) {
        // Delete lesson progress
        await supabase.from('mentee_lesson_progress').delete().eq('mentee_id', id).in('lesson_id', lessonIds)

        // Delete question responses (via lesson_questions)
        const { data: questions } = await supabase.from('lesson_questions').select('id').in('lesson_id', lessonIds)
        const questionIds = (questions || []).map(q => q.id)
        if (questionIds.length > 0) {
          await supabase.from('mentee_question_responses').delete().eq('mentee_id', id).in('question_id', questionIds)
        }
      }

      // Delete course feedback
      await supabase.from('course_feedback').delete().eq('mentee_id', id).eq('course_id', courseData.id)
    }

    setResettingCourse(null)
    setAssignSuccess('Course progress has been reset.')
    setTimeout(() => setAssignSuccess(null), 4000)
  }

  async function handleScheduleMeeting(e) {
    e.preventDefault()
    setSavingMeeting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('meetings').insert({
      mentee_id: id,
      mentor_id: meetingForm.mentor_id || null,
      scheduled_at: meetingForm.scheduled_at,
      duration_minutes: parseInt(meetingForm.duration_minutes) || 60,
      title: meetingForm.title || null,
      notes: meetingForm.notes || null,
      mentee_offering_id: meetingForm.mentee_offering_id || null,
      created_by: user?.id,
    })
    setSavingMeeting(false)
    if (!error) {
      setShowMeetingForm(false)
      setMeetingForm({ mentor_id: '', scheduled_at: '', duration_minutes: 60, title: '', notes: '', mentee_offering_id: '' })
      fetchMeetings()
      fetchCreditBalances()
    }
  }

  async function handleGrantCredits(e) {
    e.preventDefault()
    if (!grantForm.mentee_offering_id || !grantForm.amount) return
    setSavingGrant(true)
    const { data: { user } } = await supabase.auth.getUser()
    const moRow = arrangementOfferings.find(ao => ao.id === grantForm.mentee_offering_id)
    await supabase.from('arrangement_credit_ledger').insert({
      mentee_id: id,
      mentee_offering_id: grantForm.mentee_offering_id,
      offering_id: moRow?.offering?.id || null,
      transaction_type: 'adjustment',
      amount: parseInt(grantForm.amount),
      description: grantForm.description || 'Manual credit adjustment',
      created_by: user?.id,
    })
    setSavingGrant(false)
    setShowGrantForm(false)
    setGrantForm({ mentee_offering_id: '', amount: '', description: '' })
    fetchCreditBalances()
  }

  async function handleMeetingStatus(meetingId, status) {
    await supabase.from('meetings').update({ status }).eq('id', meetingId)
    fetchMeetings()
  }

  async function handleDeleteMeeting(meetingId) {
    await supabase.from('meetings').delete().eq('id', meetingId)
    fetchMeetings()
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleArchiveToggle() {
    setArchiving(true)
    if (form.archived_at) {
      await supabase.from('mentees').update({ archived_at: null, archived_by: null }).eq('id', id)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('mentees').update({ archived_at: new Date().toISOString(), archived_by: user?.id }).eq('id', id)
    }
    await fetchMentee()
    setArchiving(false)
  }

  async function handleResendWelcome() {
    if (!form?.email) return
    setEmailActionLoading('welcome')
    setEmailActionMsg(null)
    // supabase.auth.resend({ type: 'signup' }) only works while the email is
    // unconfirmed. For already-confirmed (or expired) users it silently fails.
    // resetPasswordForEmail works in all cases and gives the mentee a link to
    // set/reset their password — which is exactly what they need to log in.
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setEmailActionLoading(null)
    setEmailActionMsg(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: `Welcome email sent to ${form.email}.` }
    )
  }

  async function handleSendPasswordReset() {
    if (!form?.email) return
    setEmailActionLoading('reset')
    setEmailActionMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setEmailActionLoading(null)
    setEmailActionMsg(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: `Password reset email sent to ${form.email}.` }
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase.from('mentees').update({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      status: form.status,
      mentor_id: form.mentor_id || null,
      signup_date: form.signup_date,
      address_street1: form.address_street1,
      address_street2: form.address_street2,
      address_city: form.address_city,
      address_state: form.address_state,
      address_zip: form.address_zip,
      address_country: form.address_country,
      billing_street: form.billing_street,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_zip: form.billing_zip,
      billing_country: form.billing_country,
      messaging_methods: form.messaging_methods,
      preferred_messaging: form.preferred_messaging,
      admin_notes: form.admin_notes || null,
    }).eq('id', id)

    if (updateError) { setError(updateError.message); setSaving(false); return }

    if (avatarFile) {
      const result = await uploadAvatar(avatarFile, 'mentees', id)
      if (result.error) {
        setError(`Saved but photo upload failed: ${result.error}`)
        setSaving(false)
        return
      }
      const { error: urlError } = await supabase.from('mentees').update({ avatar_url: result.publicUrl }).eq('id', id)
      if (urlError) {
        setError(`Saved but failed to link photo: ${urlError.message}`)
        setSaving(false)
        return
      }
      setForm(f => f ? { ...f, avatar_url: result.publicUrl } : f)
      setAvatarFile(null)
    }

    setSaving(false)
    navigate('/admin/mentees')
  }

  if (!form) return <div style={st.loading}>{error || 'Loading…'}</div>

  const initials = `${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}`
  const assignedMentor = mentors.find(m => m.id === form.mentor_id)

  return (
    <div style={st.container}>
      {form.archived_at && (
        <div style={st.archiveBanner}>
          <Archive size={15} />
          <span>This mentee is archived (graduated). They are hidden from the active list.</span>
          <button style={st.restoreBtn} onClick={handleArchiveToggle} disabled={archiving}>
            <RotateCcw size={13} /> {archiving ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      )}

      <div style={st.headerCard}>
        <div style={st.headerLeft}>
          <button style={st.back} onClick={() => navigate('/admin/mentees')}>← Mentees</button>
          <AvatarUpload
            url={form.avatar_url}
            initials={initials}
            gradient="linear-gradient(135deg, #3b82f6, #6366f1)"
            onChange={setAvatarFile}
            size={56}
            hideHint
          />
          <div style={{ minWidth: 0 }}>
            <h1 style={st.title}>{form.first_name} {form.last_name}</h1>
            <div style={st.headerMeta}>
              <span>{form.status || 'No status'}</span>
              {assignedMentor && <><span style={st.headerMetaDot}>·</span><span>{assignedMentor.first_name} {assignedMentor.last_name}</span></>}
              {form.email && <><span style={st.headerMetaDot}>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.email}</span></>}
            </div>
          </div>
        </div>
        <div style={st.headerActions}>
          {authStatus === 'no_account' && (
            <span style={{ ...st.authPill, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.72rem' }}>No Account</span>
          )}
          {authStatus && authStatus !== 'no_account' && (
            <span style={{ ...st.authPill, ...(authStatus.email_confirmed_at ? { backgroundColor: '#f0fdf4', color: '#16a34a' } : { backgroundColor: '#fffbeb', color: '#d97706' }), fontSize: '0.72rem' }}>
              {authStatus.email_confirmed_at ? 'Account Active' : 'Unconfirmed'}
            </span>
          )}
          <button
            type="button"
            style={{ ...st.editProfileBtn, ...(showEditPanel ? st.editProfileBtnActive : {}) }}
            onClick={() => setShowEditPanel(v => !v)}
          >
            <User size={14} />
            {showEditPanel ? 'Hide Profile' : 'Edit Profile'}
          </button>
          {!form.archived_at && (
            <button style={st.archiveBtn} onClick={handleArchiveToggle} disabled={archiving}>
              <Archive size={14} /> {archiving ? 'Archiving…' : 'Archive'}
            </button>
          )}
        </div>
      </div>

      {error && <p style={st.error}>{error}</p>}

      {showEditPanel && (
      <div style={st.editPanel}>
      {/* ── Portal Access ── */}
      <div style={st.section}>
        <h2 style={st.sectionTitle}>Portal Access</h2>
        <div style={st.sectionBody}>

          {/* Account status row */}
          <div style={st.authStatusRow}>
            <div style={st.authStatusLeft}>
              {authStatus === undefined && (
                <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Checking account…</span>
              )}
              {authStatus === 'no_account' && (
                <>
                  <ShieldOff size={15} color="#dc2626" />
                  <span style={{ ...st.authPill, backgroundColor: '#fef2f2', color: '#dc2626' }}>No Portal Account</span>
                  <span style={st.authHint}>This mentee has no linked login account yet.</span>
                </>
              )}
              {authStatus && authStatus !== 'no_account' && !authStatus.email_confirmed_at && (
                <>
                  <ShieldAlert size={15} color="#d97706" />
                  <span style={{ ...st.authPill, backgroundColor: '#fffbeb', color: '#d97706' }}>Email Unconfirmed</span>
                  <span style={st.authHint}>They haven't clicked the confirmation link yet.</span>
                </>
              )}
              {authStatus && authStatus !== 'no_account' && authStatus.email_confirmed_at && (
                <>
                  <ShieldCheck size={15} color="#16a34a" />
                  <span style={{ ...st.authPill, backgroundColor: '#f0fdf4', color: '#16a34a' }}>Account Active</span>
                </>
              )}
            </div>
            {authStatus && authStatus !== 'no_account' && (
              <div style={st.authStatusRight}>
                <LogIn size={13} color="#9ca3af" />
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  Last login:{' '}
                  <strong>
                    {authStatus.last_sign_in_at
                      ? new Date(authStatus.last_sign_in_at).toLocaleString()
                      : 'Never'}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Login history */}
          {authStatus && authStatus !== 'no_account' && (
            <div>
              <button style={st.historyToggleBtn} onClick={handleShowLoginHistory}>
                <History size={13} />
                {showLoginHistory ? 'Hide Login History' : 'View Login History'}
              </button>
              {showLoginHistory && (
                <div style={st.loginHistoryList}>
                  {loginHistory.length === 0 ? (
                    <p style={st.emptyText}>No login events recorded yet. New sign-ins will appear here.</p>
                  ) : (
                    loginHistory.map((ev, i) => (
                      <div key={ev.id} style={st.loginEventRow}>
                        <LogIn size={12} color="#a5b4fc" style={{ flexShrink: 0 }} />
                        <span style={st.loginEventTime}>{new Date(ev.signed_in_at).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Link existing account (when no account is linked) */}
          {authStatus === 'no_account' && (
            <div style={st.linkAccountBox}>
              <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#374151', fontWeight: 600 }}>
                Link an Existing Account
              </p>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
                If this mentee already has a login (e.g. signed up on their own), enter their email to connect it to this profile.
              </p>
              {linkResult && (
                <div style={linkResult.type === 'success' ? st.successMsg : st.error}>
                  {linkResult.text}
                </div>
              )}
              <form onSubmit={handleLinkAccount} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Account Email</label>
                  <input
                    style={{ ...st.input, width: 260 }}
                    type="email"
                    placeholder="their@email.com"
                    value={linkEmail}
                    onChange={e => setLinkEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" style={st.emailBtn} disabled={linkLoading}>
                  <Link2 size={13} />
                  {linkLoading ? 'Linking…' : 'Link Account'}
                </button>
              </form>
            </div>
          )}

          {/* Email action messages + buttons */}
          {form.email && (
            <>
              {emailActionMsg && (
                <div style={emailActionMsg.type === 'success' ? st.successMsg : st.error}>
                  {emailActionMsg.text}
                </div>
              )}
              <p style={st.portalNote}>
                Send emails to <strong>{form.email}</strong> to help them access their mentee portal.
              </p>
              <div style={st.emailBtnRow}>
                <button
                  type="button"
                  style={st.emailBtn}
                  onClick={handleResendWelcome}
                  disabled={!!emailActionLoading}
                >
                  <Mail size={14} strokeWidth={2} />
                  {emailActionLoading === 'welcome' ? 'Sending…' : 'Resend Welcome Email'}
                </button>
                <button
                  type="button"
                  style={st.emailBtnAlt}
                  onClick={handleSendPasswordReset}
                  disabled={!!emailActionLoading}
                >
                  <RefreshCw size={14} strokeWidth={2} />
                  {emailActionLoading === 'reset' ? 'Sending…' : 'Send Password Reset'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      <form onSubmit={handleSave} style={st.form}>
        <Section title="Personal Info">
          <div style={st.row}>
            <Field label="First Name" name="first_name" value={form.first_name || ''} onChange={handleChange} required />
            <Field label="Last Name" name="last_name" value={form.last_name || ''} onChange={handleChange} required />
          </div>
          <div style={st.row}>
            <Field label="Email" name="email" type="email" value={form.email || ''} onChange={handleChange} />
            <div style={st.fieldGroup}>
              <label style={st.label}>Phone *</label>
              <PhoneInput name="phone" value={form.phone || ''} onChange={handleChange} required />
            </div>
          </div>
          <div style={st.row}>
            <div style={st.fieldGroup}>
              <label style={st.label}>Status</label>
              <select name="status" value={form.status || ''} onChange={handleChange} style={st.input}>
                {statusOptions.map(st_ => <option key={st_} value={st_}>{st_}</option>)}
              </select>
            </div>
            <div style={st.fieldGroup}>
              <label style={st.label}>Assigned Mentor</label>
              <select name="mentor_id" value={form.mentor_id || ''} onChange={handleChange} style={st.input}>
                <option value="">— Unassigned —</option>
                {mentors.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </select>
            </div>
            <Field label="Sign-up Date" name="signup_date" type="date" value={form.signup_date || ''} onChange={handleChange} />
          </div>
        </Section>

        <Section title="Residential Address">
          <Field label="Street Address" name="address_street1" value={form.address_street1 || ''} onChange={handleChange} />
          <Field label="Address Line 2" name="address_street2" value={form.address_street2 || ''} onChange={handleChange} />
          <div style={st.row}>
            <Field label="City" name="address_city" value={form.address_city || ''} onChange={handleChange} />
            <div style={st.fieldGroup}>
              <label style={st.label}>State</label>
              <select name="address_state" value={form.address_state || ''} onChange={handleChange} style={st.input}>
                <option value="">—</option>
                {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <Field label="ZIP" name="address_zip" value={form.address_zip || ''} onChange={handleChange} />
          </div>
          {lockCountry ? (
            <div style={st.fieldGroup}>
              <label style={st.label}>Country</label>
              <div style={st.lockedField}><span>{form.address_country}</span><span style={st.lockedBadge}>Locked</span></div>
            </div>
          ) : (
            <div style={st.fieldGroup}>
              <label style={st.label}>Country</label>
              <select name="address_country" value={form.address_country || ''} onChange={handleChange} style={st.input}>
                <option value="">— Select —</option>
                {COUNTRIES.map((c, i) => c.disabled
                  ? <option key={i} disabled>{c.label}</option>
                  : <option key={c.value} value={c.value}>{c.label}</option>
                )}
              </select>
            </div>
          )}
        </Section>

        <Section title="Billing Address">
          <Field label="Street" name="billing_street" value={form.billing_street || ''} onChange={handleChange} />
          <div style={st.row}>
            <Field label="City" name="billing_city" value={form.billing_city || ''} onChange={handleChange} />
            <div style={st.fieldGroup}>
              <label style={st.label}>State</label>
              <select name="billing_state" value={form.billing_state || ''} onChange={handleChange} style={st.input}>
                <option value="">—</option>
                {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <Field label="ZIP" name="billing_zip" value={form.billing_zip || ''} onChange={handleChange} />
          </div>
          <div style={st.fieldGroup}>
            <label style={st.label}>Country</label>
            <select name="billing_country" value={form.billing_country || ''} onChange={handleChange} style={st.input}>
              <option value="">— Select —</option>
              {COUNTRIES.map((c, i) => c.disabled
                ? <option key={i} disabled>{c.label}</option>
                : <option key={c.value} value={c.value}>{c.label}</option>
              )}
            </select>
          </div>
        </Section>

        <Section title="Communication Methods">
          <MessagingPreferences
            methods={form.messaging_methods || []}
            preferred={form.preferred_messaging || ''}
            onChange={({ methods, preferred }) => setForm(f => ({ ...f, messaging_methods: methods, preferred_messaging: preferred }))}
          />
        </Section>

        <Section title="Admin Notes">
          <textarea
            style={st.notesTextarea}
            name="admin_notes"
            value={form.admin_notes || ''}
            onChange={handleChange}
            rows={4}
            placeholder="Private notes about this mentee (visible only to admin, mentors, and staff)…"
          />
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
            These notes are private and will never be visible to the mentee.
          </p>
        </Section>

        <div style={st.formActions}>
          <button type="button" style={st.cancelBtn} onClick={() => navigate('/admin/mentees')}>Cancel</button>
          <button type="submit" style={st.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
      </div>
      )}

      <div style={st.dashGrid}>
      {/* ── Assigned Offerings ── */}
      <div style={st.section}>
        <div style={st.sectionTitleRow}>
          <h2 style={st.sectionTitle}>Assigned Offerings</h2>
          {arrangementOfferings.length > 0 && (
            <button style={st.grantBtn} onClick={() => setShowGrantForm(v => !v)}>
              <CreditCard size={12} /> Adjust Credits
            </button>
          )}
        </div>
        <div style={st.sectionBody}>
          {/* Manual credit grant form */}
          {showGrantForm && (
            <form onSubmit={handleGrantCredits} style={st.meetingForm}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Manual Credit Adjustment</p>
              <div style={st.row}>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Arrangement</label>
                  <select style={st.input} value={grantForm.mentee_offering_id} required
                    onChange={e => setGrantForm(f => ({ ...f, mentee_offering_id: e.target.value }))}>
                    <option value="">— Select —</option>
                    {arrangementOfferings.map(ao => (
                      <option key={ao.id} value={ao.id}>{ao.offering?.name}</option>
                    ))}
                  </select>
                </div>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Credits (+ add / − remove)</label>
                  <input style={st.input} type="number" placeholder="e.g. 2 or -1" required
                    value={grantForm.amount} onChange={e => setGrantForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div style={st.fieldGroup}>
                <label style={st.label}>Reason (optional)</label>
                <input style={st.input} type="text" placeholder="e.g. Promotional credit"
                  value={grantForm.description} onChange={e => setGrantForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" style={st.cancelBtn} onClick={() => setShowGrantForm(false)}>Cancel</button>
                <button type="submit" style={st.saveBtn} disabled={savingGrant}>
                  {savingGrant ? 'Saving…' : 'Apply'}
                </button>
              </div>
            </form>
          )}

          {assignedOfferings.length === 0 ? (
            <p style={st.emptyText}>No offerings assigned yet.</p>
          ) : (
            <div style={st.offeringList}>
              {assignedOfferings.map(ao => {
                const isArrangement = ao.offering?.offering_type === 'arrangement'
                const balance = isArrangement ? (creditBalances[ao.id] ?? 0) : null
                return (
                  <div key={ao.id} style={st.offeringRow}>
                    <div style={st.offeringInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={st.offeringName}>{ao.offering?.name}</span>
                        {isArrangement && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 99, background: '#f0fdfa', color: '#0d9488', border: '1px solid #a7f3d0' }}>
                            Arrangement
                          </span>
                        )}
                      </div>
                      <div style={st.offeringMeta}>
                        {ao.offering?.cost && <span>${Number(ao.offering.cost).toFixed(2)}</span>}
                        {ao.offering?.billing_type && <span style={st.metaPill}>{ao.offering.billing_type}</span>}
                        <span style={st.metaDate}>Assigned {ao.assigned_date}</span>
                        {isArrangement && (
                          <span style={{ ...st.metaPill, background: balance > 0 ? '#f0fdf4' : '#fef2f2', color: balance > 0 ? '#16a34a' : '#dc2626', borderColor: balance > 0 ? '#bbf7d0' : '#fecaca' }}>
                            <CreditCard size={10} /> {balance} credit{balance !== 1 ? 's' : ''} remaining
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      {ao.offering?.offering_type === 'course' && (
                        <button style={{ ...st.removeBtn, borderColor: '#fde68a', color: '#d97706' }} onClick={() => handleResetCourseProgress(ao.offering.id)} disabled={resettingCourse === ao.offering.id}>
                          <RotateCcw size={12} /> {resettingCourse === ao.offering.id ? 'Resetting…' : 'Reset Progress'}
                        </button>
                      )}
                      <button style={st.removeBtn} onClick={() => handleRemoveOffering(ao.id)}>
                        <X size={13} /> Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Add offering */}
          {assignError && (
            <div style={{ padding: '0.6rem 0.85rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.82rem' }}>
              {assignError}
            </div>
          )}
          {assignSuccess && (
            <div style={{ padding: '0.6rem 0.85rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: '0.82rem' }}>
              {assignSuccess}
            </div>
          )}
          <div style={st.addOfferingRow}>
            <select
              style={{ ...st.input, flex: 1 }}
              value={selectedOfferingId}
              onChange={e => setSelectedOfferingId(e.target.value)}
            >
              <option value="">— Add an offering —</option>
              {allOfferings
                .filter(o => !assignedOfferings.some(ao => ao.offering?.id === o.id && ao.status === 'active'))
                .map(o => (
                  <option key={o.id} value={o.id}>{o.name} (${Number(o.cost).toFixed(2)})</option>
                ))
              }
            </select>
            <button
              style={st.assignBtn}
              onClick={handleAssignClick}
              disabled={!selectedOfferingId || assigningOffering}
            >
              <Plus size={14} /> {assigningOffering ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Billing History ── */}
      <div style={st.section}>
        <h2 style={st.sectionTitle2}>Billing History</h2>
        <div style={st.sectionBody}>
          {invoices.length === 0 ? (
            <p style={st.emptyText}>No invoices on record.</p>
          ) : (
            <table style={st.table}>
              <thead>
                <tr>
                  {['Invoice #', 'Date Due', 'Description', 'Amount', 'Status', 'Actions'].map(h => (
                    <th key={h} style={st.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const ss = INV_STATUS_STYLES[inv.status] || INV_STATUS_STYLES.pending
                  return (
                    <tr key={inv.id} style={st.tr}>
                      <td style={st.td}><span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#6366f1', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate(`/admin/invoices/${inv.id}`)}>{inv.invoice_number || '—'}</span></td>
                      <td style={st.td}>{inv.due_date}</td>
                      <td style={st.td}>{inv.offering?.name || inv.description || '—'}</td>
                      <td style={st.td}>${Number(inv.amount).toFixed(2)}</td>
                      <td style={st.td}>
                        <span style={{ ...st.invBadge, backgroundColor: ss.bg, color: ss.color }}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td style={st.td}>
                        <InvoiceActions invoice={inv} onUpdate={fetchInvoices} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>{/* end dashGrid */}

      {/* ── Meetings ── */}
      <div style={st.section}>
        <div style={st.sectionTitleRow}>
          <h2 style={st.sectionTitle2}>Meetings</h2>
          <button style={st.scheduleMeetingBtn} onClick={() => setShowMeetingForm(v => !v)}>
            <CalendarPlus size={13} /> Schedule Meeting
          </button>
        </div>
        <div style={st.sectionBody}>
          {showMeetingForm && (
            <form onSubmit={handleScheduleMeeting} style={st.meetingForm}>
              <div style={st.row}>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Date & Time *</label>
                  <input
                    style={st.input}
                    type="datetime-local"
                    value={meetingForm.scheduled_at}
                    onChange={e => setMeetingForm(f => ({ ...f, scheduled_at: e.target.value }))}
                    required
                  />
                </div>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Duration (minutes)</label>
                  <input
                    style={st.input}
                    type="number"
                    min="15"
                    step="15"
                    value={meetingForm.duration_minutes}
                    onChange={e => setMeetingForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  />
                </div>
              </div>
              <div style={st.row}>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Mentor</label>
                  <select
                    style={st.input}
                    value={meetingForm.mentor_id}
                    onChange={e => setMeetingForm(f => ({ ...f, mentor_id: e.target.value }))}
                  >
                    <option value="">— Select mentor —</option>
                    {allMentors.map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                    ))}
                  </select>
                </div>
                <div style={st.fieldGroup}>
                  <label style={st.label}>Title (optional)</label>
                  <input
                    style={st.input}
                    type="text"
                    placeholder="e.g. Weekly check-in"
                    value={meetingForm.title}
                    onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>
              </div>
              {arrangementOfferings.length > 0 && (
                <div style={st.fieldGroup}>
                  <label style={st.label}>Deduct from arrangement (optional)</label>
                  <select
                    style={st.input}
                    value={meetingForm.mentee_offering_id}
                    onChange={e => setMeetingForm(f => ({ ...f, mentee_offering_id: e.target.value }))}
                  >
                    <option value="">— Do not deduct credit —</option>
                    {arrangementOfferings.map(ao => {
                      const bal = creditBalances[ao.id] ?? 0
                      return (
                        <option key={ao.id} value={ao.id}>
                          {ao.offering?.name} — {bal} credit{bal !== 1 ? 's' : ''} remaining
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}
              <div style={st.fieldGroup}>
                <label style={st.label}>Notes (optional)</label>
                <textarea
                  style={{ ...st.input, resize: 'vertical' }}
                  rows={2}
                  value={meetingForm.notes}
                  onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" style={st.cancelBtn} onClick={() => setShowMeetingForm(false)}>Cancel</button>
                <button type="submit" style={st.saveBtn} disabled={savingMeeting}>
                  {savingMeeting ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </form>
          )}

          {meetings.length === 0 && !showMeetingForm ? (
            <p style={st.emptyText}>No meetings scheduled yet.</p>
          ) : (
            <div>
              {/* Upcoming */}
              {meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date()).length > 0 && (
                <div style={st.meetingGroup}>
                  <div style={st.meetingGroupLabel}>Upcoming</div>
                  {meetings
                    .filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date())
                    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
                    .map(m => <MeetingRow key={m.id} meeting={m} onStatus={handleMeetingStatus} onDelete={handleDeleteMeeting} upcoming />)
                  }
                </div>
              )}
              {/* Past */}
              {meetings.filter(m => m.status !== 'scheduled' || new Date(m.scheduled_at) < new Date()).length > 0 && (
                <div style={st.meetingGroup}>
                  <div style={st.meetingGroupLabel}>Past</div>
                  {meetings
                    .filter(m => m.status !== 'scheduled' || new Date(m.scheduled_at) < new Date())
                    .map(m => <MeetingRow key={m.id} meeting={m} onStatus={handleMeetingStatus} onDelete={handleDeleteMeeting} />)
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity History ── */}
      <div style={st.section}>
        <h2 style={st.sectionTitle2}>Activity History</h2>
        <div style={st.sectionBody}>
          {auditLoading ? (
            <p style={st.emptyText}>Loading…</p>
          ) : auditLogs.length === 0 ? (
            <p style={st.emptyText}>No activity recorded yet.</p>
          ) : (
            <div style={st.activityList}>
              {auditLogs.map(log => (
                <ActivityEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm second offering ── */}
      {confirmAssignId && (() => {
        const offering = allOfferings.find(o => o.id === confirmAssignId)
        const activeCount = assignedOfferings.filter(ao => !ao.status || ao.status === 'active').length
        return (
          <div style={st.overlay}>
            <div style={st.dialog}>
              <h3 style={st.dialogTitle}>Assign Additional Offering?</h3>
              <p style={st.dialogText}>
                This mentee already has <strong>{activeCount} active offering{activeCount !== 1 ? 's' : ''}</strong>.
                Are you sure you want to also assign <strong>{offering?.name}</strong>?
              </p>
              <div style={st.dialogActions}>
                <button style={st.cancelBtn} onClick={() => setConfirmAssignId(null)}>Cancel</button>
                <button style={st.assignBtn} onClick={() => doAssignOffering(confirmAssignId)}>
                  Yes, Assign
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function MeetingRow({ meeting, onStatus, onDelete, upcoming }) {
  const statusStyles = {
    scheduled:  { bg: '#eff6ff', color: '#2563eb' },
    completed:  { bg: '#f0fdf4', color: '#16a34a' },
    cancelled:  { bg: '#f1f5f9', color: '#64748b' },
  }
  const ss = statusStyles[meeting.status] || statusStyles.scheduled
  const dt = new Date(meeting.scheduled_at)
  const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div style={st.meetingRow}>
      <div style={st.meetingLeft}>
        <Calendar size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={st.meetingDateTime}>{dateStr} at {timeStr} &middot; {meeting.duration_minutes} min</div>
          {meeting.title && <div style={st.meetingTitle}>{meeting.title}</div>}
          {meeting.mentor && (
            <div style={st.meetingMentor}>{meeting.mentor.first_name} {meeting.mentor.last_name}</div>
          )}
          {meeting.notes && <div style={st.meetingNotes}>{meeting.notes}</div>}
        </div>
      </div>
      <div style={st.meetingRight}>
        <span style={{ ...st.meetingBadge, backgroundColor: ss.bg, color: ss.color }}>
          {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
        </span>
        {upcoming && meeting.status === 'scheduled' && (
          <button style={st.meetingCompleteBtn} onClick={() => onStatus(meeting.id, 'completed')}>
            <CheckCircle size={12} /> Complete
          </button>
        )}
        {meeting.status === 'scheduled' && (
          <button style={st.meetingCancelBtn} onClick={() => onStatus(meeting.id, 'cancelled')}>
            Cancel
          </button>
        )}
        <button style={st.meetingDeleteBtn} onClick={() => onDelete(meeting.id)}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

function ActivityEntry({ log }) {
  const ACTION_LABELS = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' }
  const ACTION_COLORS = { INSERT: '#16a34a', UPDATE: '#d97706', DELETE: '#dc2626' }
  const changedFields = log.changed_fields ? Object.entries(log.changed_fields) : []
  const dt = new Date(log.created_at)
  const dateStr = dt.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return (
    <div style={st.activityRow}>
      <div style={st.activityDot} />
      <div style={st.activityContent}>
        <div style={st.activityHeader}>
          <span style={{ ...st.activityAction, color: ACTION_COLORS[log.action] || '#374151' }}>
            {ACTION_LABELS[log.action] || log.action}
          </span>
          {log.changed_by_email && (
            <span style={st.activityBy}>by {log.changed_by_email}</span>
          )}
          <span style={st.activityTime}>{dateStr}</span>
        </div>
        {changedFields.length > 0 && (
          <div style={st.activityFields}>
            {changedFields.map(([field, diff]) => {
              const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const fromVal = formatActivityVal(diff?.from)
              const toVal   = formatActivityVal(diff?.to)
              return (
                <div key={field} style={st.activityField}>
                  <span style={st.activityFieldName}>{label}:</span>
                  <span style={st.activityFrom}>{fromVal}</span>
                  <span style={st.activityArrow}>→</span>
                  <span style={st.activityTo}>{toVal}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatActivityVal(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v).replace(/^"|"$/g, '')
  if (!s) return 'empty'
  if (s.length > 80) return s.slice(0, 80) + '…'
  return s
}

function Section({ title, children }) {
  return (
    <div style={st.section}>
      <h2 style={st.sectionTitle}>{title}</h2>
      <div style={st.sectionBody}>{children}</div>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', required }) {
  return (
    <div style={st.fieldGroup}>
      <label style={st.label}>{label}</label>
      <input style={st.input} type={type} name={name} value={value} onChange={onChange} required={required} />
    </div>
  )
}

const INV_STATUS_STYLES = {
  pending:   { bg: '#fff7ed', color: '#ea580c' },
  overdue:   { bg: '#fef2f2', color: '#dc2626' },
  paid:      { bg: '#f0fdf4', color: '#16a34a' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
}

const st = {
  container: { maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: '1rem' },
  headerCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', backgroundColor: '#fff', borderRadius: 8, padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', flexWrap: 'wrap' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0, flexWrap: 'wrap' },
  headerMeta: { display: 'flex', gap: '0.35rem', color: '#9ca3af', fontSize: '0.82rem', flexWrap: 'wrap', marginTop: '0.2rem', alignItems: 'center' },
  headerMetaDot: { color: '#d1d5db' },
  editProfileBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  editProfileBtnActive: { backgroundColor: '#eef2ff', borderColor: '#6366f1', color: '#6366f1' },
  editPanel: { display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f8f9ff', borderRadius: 8, border: '1.5px solid #e0e7ff', padding: '1.25rem' },
  dashGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' },
  loading: { padding: '3rem', textAlign: 'center', color: '#9ca3af' },
  archiveBanner: { display: 'flex', alignItems: 'center', gap: '0.65rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', color: '#92400e', fontSize: '0.875rem', flexWrap: 'wrap' },
  restoreBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto', padding: '0.35rem 0.85rem', background: 'none', border: '1px solid #92400e', borderRadius: 7, color: '#92400e', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  archiveBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', background: 'none', border: '1.5px solid #d1fae5', borderRadius: 9, color: '#059669', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  back: { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.875rem', fontWeight: 600, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.1rem' },
  subtitle: { color: '#9ca3af', fontSize: '0.875rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  section: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid #f3f4f6' },
  sectionTitle: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  lockedField: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 9, backgroundColor: '#f9fafb', color: '#6b7280', fontSize: '0.875rem' },
  lockedBadge: { fontSize: '0.7rem', backgroundColor: '#e5e7eb', color: '#9ca3af', borderRadius: 4, padding: '0.15rem 0.5rem', fontWeight: 600 },
  checkboxRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' },
  notesTextarea: { width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  cancelBtn: { padding: '0.6rem 1.2rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: '0.875rem' },
  error: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  sectionTitleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle2: { margin: 0, padding: '0.75rem 1.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  emptyText: { color: '#9ca3af', fontSize: '0.875rem', margin: 0 },
  offeringList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' },
  offeringRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 9, border: '1px solid #f3f4f6' },
  offeringInfo: { flex: 1 },
  offeringName: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  offeringMeta: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.15rem', flexWrap: 'wrap' },
  metaPill: { fontSize: '0.7rem', padding: '0.1rem 0.45rem', backgroundColor: '#e5e7eb', borderRadius: 99, color: '#6b7280', fontWeight: 600 },
  metaDate: { fontSize: '0.75rem', color: '#9ca3af' },
  removeBtn: { display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.65rem', background: 'none', border: '1px solid #fecaca', borderRadius: 7, color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 },
  addOfferingRow: { display: 'flex', gap: '0.65rem', alignItems: 'center' },
  assignBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600, flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #f3f4f6' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.65rem 0.75rem', fontSize: '0.875rem', color: '#374151' },
  invBadge: { padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 },
  portalNote: { margin: 0, color: '#6b7280', fontSize: '0.875rem' },
  emailBtnRow: { display: 'flex', gap: '0.65rem', flexWrap: 'wrap' },
  emailBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  emailBtnAlt: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'none', border: '1.5px solid #6366f1', color: '#6366f1', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  successMsg: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '0.65rem 1rem', color: '#15803d', fontSize: '0.875rem' },

  // Auth / account status
  authStatusRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' },
  authStatusLeft: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  authStatusRight: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  authPill: { padding: '0.2rem 0.65rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 },
  authHint: { fontSize: '0.78rem', color: '#9ca3af' },
  historyToggleBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '0.35rem 0.8rem', color: '#6366f1', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  loginHistoryList: { marginTop: '0.5rem', border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fafafa' },
  loginEventRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.85rem', borderBottom: '1px solid #f3f4f6' },
  loginEventTime: { fontSize: '0.8rem', color: '#374151' },
  linkAccountBox: { padding: '1rem', backgroundColor: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: 8 },

  // Meetings
  grantBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.75rem', background: 'none', border: '1.5px solid #a7f3d0', borderRadius: 8, color: '#0d9488', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', margin: '0.75rem 1.25rem 0 0' },
  scheduleMeetingBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.85rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', margin: '0.75rem 1.25rem 0 0' },
  meetingForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem' },
  meetingGroup: { marginBottom: '0.75rem' },
  meetingGroupLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.4rem' },
  meetingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: 9, border: '1px solid #f3f4f6', marginBottom: '0.4rem', flexWrap: 'wrap' },
  meetingLeft: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flex: 1 },
  meetingRight: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' },
  meetingDateTime: { fontWeight: 600, color: '#111827', fontSize: '0.82rem' },
  meetingTitle: { color: '#6366f1', fontSize: '0.78rem', fontWeight: 500, marginTop: '0.1rem' },
  meetingMentor: { color: '#6b7280', fontSize: '0.75rem', marginTop: '0.1rem' },
  meetingNotes: { color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.15rem', fontStyle: 'italic' },
  meetingBadge: { padding: '0.15rem 0.55rem', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 },
  meetingCompleteBtn: { display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.6rem', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  meetingCancelBtn: { padding: '0.25rem 0.6rem', backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  meetingDeleteBtn: { display: 'flex', alignItems: 'center', padding: '0.25rem', backgroundColor: 'transparent', color: '#fca5a5', border: 'none', borderRadius: 5, cursor: 'pointer' },

  // Confirm dialog
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  dialog: { backgroundColor: '#fff', borderRadius: 12, padding: '2rem', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  dialogTitle: { fontSize: '1.05rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' },
  dialogText: { color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem', fontSize: '0.9rem' },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },

  // Activity
  activityList: { display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: '1.25rem' },
  activityRow: { display: 'flex', gap: '0.75rem', position: 'relative', paddingBottom: '0.9rem' },
  activityDot: { position: 'absolute', left: -21, top: 4, width: 8, height: 8, borderRadius: '50%', backgroundColor: '#c7d2fe', border: '2px solid #e0e7ff', flexShrink: 0 },
  activityContent: { flex: 1, paddingBottom: '0.1rem', borderBottom: '1px solid #f9fafb' },
  activityHeader: { display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.25rem' },
  activityAction: { fontWeight: 700, fontSize: '0.78rem' },
  activityBy: { color: '#6b7280', fontSize: '0.75rem' },
  activityTime: { color: '#9ca3af', fontSize: '0.72rem', marginLeft: 'auto' },
  activityFields: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  activityField: { display: 'flex', alignItems: 'baseline', gap: '0.3rem', fontSize: '0.75rem', flexWrap: 'wrap' },
  activityFieldName: { fontWeight: 600, color: '#374151', flexShrink: 0 },
  activityFrom: { color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 3, padding: '0 0.25rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  activityArrow: { color: '#9ca3af', fontSize: '0.68rem', flexShrink: 0 },
  activityTo: { color: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 3, padding: '0 0.25rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
