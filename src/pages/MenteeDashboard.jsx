import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { BookOpen, User, CreditCard, LogOut, CheckCircle, Clock, AlertCircle, Shield, Clipboard, Lock, Calendar, CalendarPlus, CalendarCheck, Play, MessageSquare, Star, X } from 'lucide-react'
import LessonViewer from '../components/LessonViewer'
import BugReportButton from '../components/BugReportButton'
import AvatarUpload from '../components/AvatarUpload'
import { uploadAvatar } from '../utils/avatarUpload'
import MenteeTutorial from '../components/MenteeTutorial'
import { useRole } from '../context/RoleContext'
import RoleSwitcher from '../components/RoleSwitcher'
import { US_STATES } from '../constants/usStates'
import { COUNTRIES } from '../constants/countries'

const STATUS_STYLES = {
  pending:   { bg: '#fff7ed', color: '#ea580c' },
  overdue:   { bg: '#fef2f2', color: '#dc2626' },
  paid:      { bg: '#f0fdf4', color: '#16a34a' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
}

function detectBrand(num) {
  const n = (num || '').replace(/\s/g, '')
  if (/^4/.test(n)) return 'Visa'
  if (/^5[1-5]/.test(n)) return 'Mastercard'
  if (/^3[47]/.test(n)) return 'Amex'
  if (/^6(?:011|5)/.test(n)) return 'Discover'
  return ''
}

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

function MeetingItem({ meeting, past }) {
  const dt = new Date(meeting.scheduled_at)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const mentor = meeting.mentor
  const isCompleted = meeting.status === 'completed'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ width: 36, height: 36, borderRadius: 7, backgroundColor: past || isCompleted ? '#f9fafb' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isCompleted
          ? <CalendarCheck size={16} color="#9ca3af" />
          : past
            ? <Calendar size={16} color="#9ca3af" />
            : <CalendarPlus size={16} color="#0d9488" />
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{meeting.title || 'Meeting'}</div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
          {dateStr} at {timeStr} · {meeting.duration_minutes} min
          {mentor ? ` · with ${mentor.first_name} ${mentor.last_name}` : ''}
        </div>
      </div>
      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, backgroundColor: isCompleted ? '#f0fdf4' : '#f0fdfa', color: isCompleted ? '#16a34a' : '#0d9488' }}>
        {isCompleted ? 'Completed' : 'Scheduled'}
      </span>
    </div>
  )
}

export default function MenteeDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [menteeId, setMenteeId] = useState(null)
  const [mentee, setMentee] = useState(null)
  const [assignedOfferings, setAssignedOfferings] = useState([])
  const [invoices, setInvoices] = useState([])
  const [lessonProgress, setLessonProgress] = useState([])
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyName, setCompanyName] = useState('MentorDesk')
  const [menteeCanEditStatus, setMenteeCanEditStatus] = useState(false)
  const [statusOptions, setStatusOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileForm, setProfileForm] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [pmForm, setPmForm] = useState({
    card_holder: '', card_number: '', card_expiry: '', card_cvv: '',
    billing_street: '', billing_city: '', billing_state: '', billing_zip: '', billing_country: '',
  })
  const [pmSaving, setPmSaving] = useState(false)
  const [pmSuccess, setPmSuccess] = useState(null)
  const [pmError, setPmError] = useState(null)
  const [editingPm, setEditingPm] = useState(false)
  const [myWhiteboards, setMyWhiteboards] = useState([])
  const [issuedWhiteboards, setIssuedWhiteboards] = useState({}) // Map of lessonId -> mentee_whiteboard[]
  const [wbSaving, setWbSaving] = useState(null) // id of wb being saved
  const [wbNotes, setWbNotes] = useState({}) // { [id]: notes string }
  const [enrolledCourses, setEnrolledCourses] = useState([]) // courses for assigned offerings
  const [allCourseLessons, setAllCourseLessons] = useState({}) // { [courseId]: lesson[] }
  const [meetings, setMeetings] = useState([])
  const [creditBalances, setCreditBalances] = useState({}) // { [mentee_offering_id]: balance }
  const [openLessonId, setOpenLessonId] = useState(null) // lesson id being viewed
  const [lessonQuestions, setLessonQuestions] = useState({}) // { [lessonId]: question[] }
  const [myResponses, setMyResponses] = useState({}) // { [questionId]: response }
  const [feedbackModal, setFeedbackModal] = useState(null) // { offeringId, courseId, lessonId? }
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackResult, setFeedbackResult] = useState(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [meetingForm, setMeetingForm] = useState({ scheduled_at: '', duration_minutes: 60, notes: '' })
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [meetingError, setMeetingError] = useState(null)

  useEffect(() => {
    loadAll()
  }, [])

  const { activeEntityId, organizationId } = useRole()

  async function loadAll() {
    setLoading(true)

    const settingsRes = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
    if (settingsRes.data) {
      const get = k => settingsRes.data.find(s => s.key === k)?.value || ''
      setCompanyLogo(get('company_logo_horizontal') || get('company_logo'))
      setCompanyName(get('company_name') || 'MentorDesk')
      setMenteeCanEditStatus(get('mentee_can_edit_status') === 'true')
      try {
        const raw = get('mentee_statuses')
        setStatusOptions(raw ? JSON.parse(raw) : [])
      } catch { setStatusOptions([]) }
    }

    const mid = activeEntityId
    if (!mid) { setLoading(false); return }
    setMenteeId(mid)

    const [menteeRes, offeringsRes, invoicesRes, lessonsRes, pmRes, wbRes, meetingsRes, ledgerRes] = await Promise.all([
      supabase.from('mentees').select('*').eq('id', mid).single(),
      supabase
        .from('mentee_offerings')
        .select('id, assigned_date, status, offering:offerings(id, name, description, cost, billing_type, duration_value, duration_unit, offering_type)')
        .eq('mentee_id', mid)
        .eq('status', 'active'),
      supabase
        .from('invoices')
        .select('*, offering:offerings(name)')
        .eq('mentee_id', mid)
        .order('due_date', { ascending: false }),
      supabase
        .from('mentee_lesson_progress')
        .select('id, unlocked_at, completed_at, lesson:lessons(id, title, description, content, video_url, order_index, course_id)')
        .eq('mentee_id', mid)
        .order('unlocked_at', { ascending: true }),
      supabase
        .from('mentee_payment_methods')
        .select('*')
        .eq('mentee_id', mid)
        .eq('is_default', true)
        .maybeSingle(),
      supabase
        .from('mentee_whiteboards')
        .select('id, issued_at, completed_at, mentee_notes, whiteboard:lesson_whiteboards(id, title, description), lesson:lessons(id, title)')
        .eq('mentee_id', mid)
        .order('issued_at', { ascending: false }),
      supabase
        .from('meetings')
        .select('id, scheduled_at, duration_minutes, title, status, mentor:mentors(id, first_name, last_name)')
        .eq('mentee_id', mid)
        .order('scheduled_at', { ascending: false }),
      supabase
        .from('arrangement_credit_ledger')
        .select('mentee_offering_id, amount')
        .eq('mentee_id', mid),
    ])

    if (menteeRes.data) {
      setMentee(menteeRes.data)
      setProfileForm(menteeRes.data)
    }
    if (offeringsRes.data) {
      setAssignedOfferings(offeringsRes.data)
      // Load courses for enrolled offerings so we know delivery mode
      const offeringIds = offeringsRes.data.map(ao => ao.offering?.id).filter(Boolean)
      if (offeringIds.length > 0) {
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, offering_id, delivery_mode, schedule_interval, schedule_unit')
          .in('offering_id', offeringIds)
        const courses = coursesData || []
        setEnrolledCourses(courses)

        // Fetch ALL lessons for enrolled courses (not just unlocked ones)
        if (courses.length > 0) {
          const courseIds = courses.map(c => c.id)
          const { data: allLessons } = await supabase
            .from('lessons')
            .select('id, title, description, content, video_url, order_index, course_id')
            .in('course_id', courseIds)
            .order('order_index')
          if (allLessons) {
            const grouped = {}
            allLessons.forEach(l => {
              if (!grouped[l.course_id]) grouped[l.course_id] = []
              grouped[l.course_id].push(l)
            })
            setAllCourseLessons(grouped)

            // Auto-unlock lessons based on delivery mode
            const existingProgress = lessonsRes.data || []
            for (const course of courses) {
              const courseLessonList = grouped[course.id] || []
              if (courseLessonList.length === 0) continue
              const existingIds = new Set(existingProgress.filter(lp => lp.lesson?.course_id === course.id).map(lp => lp.lesson?.id))
              const now = new Date().toISOString()

              if (course.delivery_mode === 'all_unlocked') {
                // Unlock ALL lessons that don't have progress records yet
                const toUnlock = courseLessonList.filter(l => !existingIds.has(l.id))
                for (const lesson of toUnlock) {
                  const { data: newLP } = await supabase
                    .from('mentee_lesson_progress')
                    .insert({ mentee_id: mid, lesson_id: lesson.id, unlocked_at: now })
                    .select('id, unlocked_at, completed_at')
                    .single()
                  if (newLP) existingProgress.push({ ...newLP, lesson })
                }
              } else if (existingIds.size === 0) {
                // For scheduled/on_completion, unlock only the first lesson if none exist
                const firstLesson = courseLessonList[0]
                const { data: newLP } = await supabase
                  .from('mentee_lesson_progress')
                  .insert({ mentee_id: mid, lesson_id: firstLesson.id, unlocked_at: now })
                  .select('id, unlocked_at, completed_at')
                  .single()
                if (newLP) {
                  existingProgress.push({ ...newLP, lesson: firstLesson })
                }
              }
            }
            if (lessonsRes.data) setLessonProgress(existingProgress)
          }
        }
      }
    }
    if (invoicesRes.data) {
      const today = new Date().toISOString().split('T')[0]
      setInvoices(invoicesRes.data.map(i =>
        i.status === 'pending' && i.due_date < today ? { ...i, status: 'overdue' } : i
      ))
    }
    if (lessonsRes.data) {
      setLessonProgress(lessonsRes.data)
      // Fetch questions and responses for all unlocked lessons
      const lessonIds = lessonsRes.data.map(lp => lp.lesson?.id).filter(Boolean)
      if (lessonIds.length > 0) {
        const [qRes, rRes] = await Promise.all([
          supabase
            .from('lesson_questions')
            .select('id, lesson_id, question_text, question_type, options, order_index')
            .in('lesson_id', lessonIds)
            .order('order_index'),
          supabase
            .from('mentee_question_responses')
            .select('id, question_id, response_text, selected_option, is_correct')
            .eq('mentee_id', mid),
        ])
        if (qRes.data) {
          const grouped = {}
          for (const q of qRes.data) {
            if (!grouped[q.lesson_id]) grouped[q.lesson_id] = []
            grouped[q.lesson_id].push(q)
          }
          setLessonQuestions(grouped)
        }
        if (rRes.data) {
          const mapped = {}
          for (const r of rRes.data) mapped[r.question_id] = r
          setMyResponses(mapped)
        }
      }
    }
    if (wbRes.data) {
      setMyWhiteboards(wbRes.data)
      const notes = {}
      const grouped = {}
      for (const wb of wbRes.data) {
        notes[wb.id] = wb.mentee_notes || ''
        const lid = wb.whiteboard?.lesson_id
        if (lid) {
          if (!grouped[lid]) grouped[lid] = []
          grouped[lid].push(wb)
        }
      }
      setWbNotes(notes)
      setIssuedWhiteboards(grouped)
    }
    if (pmRes.data) {
      setPaymentMethod(pmRes.data)
      setPmForm(f => ({
        ...f,
        card_holder: pmRes.data.card_holder || '',
        card_expiry: pmRes.data.card_expiry || '',
        billing_street: pmRes.data.billing_street || '',
        billing_city: pmRes.data.billing_city || '',
        billing_state: pmRes.data.billing_state || '',
        billing_zip: pmRes.data.billing_zip || '',
        billing_country: pmRes.data.billing_country || '',
      }))
    }
    if (meetingsRes.data) setMeetings(meetingsRes.data)
    if (ledgerRes.data) {
      const bal = {}
      ledgerRes.data.forEach(r => {
        bal[r.mentee_offering_id] = (bal[r.mentee_offering_id] || 0) + r.amount
      })
      setCreditBalances(bal)
    }
    setLoading(false)

    // Show tutorial on first visit for this mentee
    const tutorialKey = `mentee_tutorial_${mid}`
    if (!localStorage.getItem(tutorialKey)) {
      setShowTutorial(true)
    }
  }

  function completeTutorial() {
    setShowTutorial(false)
    if (menteeId) {
      localStorage.setItem(`mentee_tutorial_${menteeId}`, '1')
    }
  }

  async function handleRequestMeeting(e) {
    e.preventDefault()
    setSavingMeeting(true)
    setMeetingError(null)
    const arrangementWithCredits = arrangementOfferings.find(ao => (creditBalances[ao.id] ?? 0) > 0)
    const { error } = await supabase.from('meetings').insert({
      mentee_id: menteeId,
      mentor_id: mentee?.mentor_id || null,
      scheduled_at: meetingForm.scheduled_at,
      duration_minutes: parseInt(meetingForm.duration_minutes) || 60,
      notes: meetingForm.notes || null,
      mentee_offering_id: arrangementWithCredits?.id || null,
    })
    setSavingMeeting(false)
    if (error) {
      setMeetingError(error.message)
    } else {
      setShowMeetingForm(false)
      setMeetingForm({ scheduled_at: '', duration_minutes: 60, notes: '' })
      const [m, l] = await Promise.all([
        supabase.from('meetings').select('id, scheduled_at, duration_minutes, title, status, mentee_offering_id, mentor:mentors(id, first_name, last_name)').eq('mentee_id', menteeId).order('scheduled_at', { ascending: false }),
        supabase.from('arrangement_credit_ledger').select('mentee_offering_id, amount').eq('mentee_id', menteeId),
      ])
      if (m.data) setMeetings(m.data)
      if (l.data) {
        const bal = {}
        l.data.forEach(r => { bal[r.mentee_offering_id] = (bal[r.mentee_offering_id] || 0) + r.amount })
        setCreditBalances(bal)
      }
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function handleCompleteLesson(progressId) {
    const now = new Date().toISOString()
    await supabase.from('mentee_lesson_progress')
      .update({ completed_at: now })
      .eq('id', progressId)
    setLessonProgress(prev => prev.map(l => l.id === progressId ? { ...l, completed_at: now } : l))

    // Auto-unlock next lesson for on_completion courses
    const completed = lessonProgress.find(lp => lp.id === progressId)
    const courseId = completed?.lesson?.course_id
    if (courseId) {
      const course = enrolledCourses.find(c => c.id === courseId)
      if (course?.delivery_mode === 'on_completion') {
        const nextIndex = (completed.lesson.order_index ?? 0) + 1
        const { data: nextLesson } = await supabase
          .from('lessons')
          .select('id, title, description, order_index, course_id')
          .eq('course_id', courseId)
          .eq('order_index', nextIndex)
          .maybeSingle()
        if (nextLesson) {
          const alreadyUnlocked = lessonProgress.some(lp => lp.lesson?.id === nextLesson.id)
          if (!alreadyUnlocked) {
            const { data: newLP } = await supabase
              .from('mentee_lesson_progress')
              .insert({ mentee_id: menteeId, lesson_id: nextLesson.id, unlocked_at: now })
              .select('id, unlocked_at, completed_at')
              .single()
            if (newLP) {
              setLessonProgress(prev => [...prev, { ...newLP, lesson: nextLesson }])
            }
          }
        }
      }
    }
  }

  async function handleSubmitResponse(questionId, response) {
    const { data } = await supabase
      .from('mentee_question_responses')
      .insert({ mentee_id: menteeId, question_id: questionId, ...response, submitted_at: new Date().toISOString() })
      .select('id, question_id, response_text, selected_option, is_correct')
      .single()
    if (data) {
      setMyResponses(prev => ({ ...prev, [questionId]: data }))
    }
  }

  function handleOpenLesson(lessonId) {
    setOpenLessonId(lessonId)
  }

  async function handleSubmitFeedback() {
    if (!feedbackModal || !feedbackText.trim()) return
    setFeedbackSending(true)
    setFeedbackResult(null)
    const { error } = await supabase.from('course_feedback').insert({
      mentee_id: menteeId,
      offering_id: feedbackModal.offeringId,
      course_id: feedbackModal.courseId || null,
      lesson_id: feedbackModal.lessonId || null,
      feedback_text: feedbackText.trim(),
      rating: feedbackRating || null,
      organization_id: organizationId,
    })
    setFeedbackSending(false)
    if (error) {
      setFeedbackResult({ type: 'error', text: 'Failed to submit feedback.' })
    } else {
      setFeedbackResult({ type: 'success', text: 'Thank you! Your feedback has been submitted.' })
      setTimeout(() => {
        setFeedbackModal(null)
        setFeedbackText('')
        setFeedbackRating(0)
        setFeedbackResult(null)
      }, 2000)
    }
  }

  async function handleSaveWbNotes(wbId) {
    setWbSaving(wbId)
    await supabase.from('mentee_whiteboards').update({ mentee_notes: wbNotes[wbId] || null }).eq('id', wbId)
    setMyWhiteboards(ws => ws.map(w => w.id === wbId ? { ...w, mentee_notes: wbNotes[wbId] || null } : w))
    setWbSaving(null)
  }

  async function handleCompleteWhiteboard(wbId) {
    const now = new Date().toISOString()
    await supabase.from('mentee_whiteboards').update({ completed_at: now }).eq('id', wbId)
    setMyWhiteboards(ws => ws.map(w => w.id === wbId ? { ...w, completed_at: now } : w))
  }

  function handleProfileChange(e) {
    const { name, value, type, checked } = e.target
    setProfileForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(null)
    const updates = {
      first_name: profileForm.first_name,
      last_name: profileForm.last_name,
      phone: profileForm.phone,
      address_street1: profileForm.address_street1,
      address_street2: profileForm.address_street2,
      address_city: profileForm.address_city,
      address_state: profileForm.address_state,
      address_zip: profileForm.address_zip,
      address_country: profileForm.address_country,
      bio: profileForm.bio || null,
    }
    if (menteeCanEditStatus) updates.status = profileForm.status
    const { error } = await supabase.from('mentees').update(updates).eq('id', menteeId)
    if (error) { setProfileError(error.message); setProfileSaving(false); return }

    // Upload avatar if selected
    if (avatarFile) {
      const result = await uploadAvatar(avatarFile, 'mentees', menteeId)
      if (result.error) {
        setProfileError(`Profile saved but photo upload failed: ${result.error}`)
        setProfileSaving(false)
        return
      }
      const { error: urlError } = await supabase.from('mentees').update({ avatar_url: result.publicUrl }).eq('id', menteeId)
      if (urlError) {
        setProfileError(`Profile saved but failed to link photo: ${urlError.message}`)
        setProfileSaving(false)
        return
      }
      setProfileForm(f => ({ ...f, avatar_url: result.publicUrl }))
      setAvatarFile(null)
    }

    setMentee(profileForm)
    setProfileSuccess('Profile updated successfully.')
    setProfileSaving(false)
  }

  function handlePmChange(e) {
    const { name, value } = e.target
    setPmForm(f => {
      let v = value
      if (name === 'card_number') {
        v = value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
      }
      if (name === 'card_expiry') {
        v = value.replace(/\D/g, '').slice(0, 4)
        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
      }
      if (name === 'card_cvv') v = value.replace(/\D/g, '').slice(0, 4)
      return { ...f, [name]: v }
    })
  }

  async function handlePmSave(e) {
    e.preventDefault()
    setPmSaving(true)
    setPmError(null)
    setPmSuccess(null)

    const digits = pmForm.card_number.replace(/\s/g, '')
    const last4 = digits.slice(-4)
    const brand = detectBrand(digits)

    // Delete existing default and insert new
    await supabase.from('mentee_payment_methods').delete().eq('mentee_id', menteeId)
    const { error } = await supabase.from('mentee_payment_methods').insert({
      mentee_id: menteeId,
      card_holder: pmForm.card_holder,
      card_last4: last4,
      card_brand: brand,
      card_expiry: pmForm.card_expiry,
      billing_street: pmForm.billing_street,
      billing_city: pmForm.billing_city,
      billing_state: pmForm.billing_state,
      billing_zip: pmForm.billing_zip,
      billing_country: pmForm.billing_country,
      is_default: true,
    })

    if (error) {
      setPmError(error.message)
    } else {
      setPaymentMethod({ card_last4: last4, card_brand: brand, card_expiry: pmForm.card_expiry, card_holder: pmForm.card_holder, ...pmForm })
      setPmSuccess('Payment method saved.')
      setEditingPm(false)
      setPmForm(f => ({ ...f, card_number: '', card_cvv: '' }))
    }
    setPmSaving(false)
  }

  const pendingInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'overdue')
  const activeWhiteboards = myWhiteboards.filter(w => !w.completed_at)
  const initials = mentee ? `${mentee.first_name?.[0] || ''}${mentee.last_name?.[0] || ''}` : ''
  const arrangementOfferings = assignedOfferings.filter(ao => ao.offering?.offering_type === 'arrangement')
  const hasMeetingCredits = arrangementOfferings.some(ao => (creditBalances[ao.id] ?? 0) > 0)
  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date())

  const TABS = [
    { key: 'overview',     label: 'Overview',     icon: null },
    { key: 'courses',      label: 'My Courses',   icon: BookOpen },
    { key: 'meetings',     label: 'Meetings',     icon: Calendar },
    { key: 'profile',      label: 'My Profile',   icon: User },
    { key: 'billing',      label: 'Billing',      icon: CreditCard },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#9ca3af' }}>Loading…</p>
      </div>
    )
  }

  if (!menteeId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb', gap: '1rem' }}>
        <p style={{ color: '#6b7280' }}>Your mentee profile is not linked to this account. Please contact your administrator.</p>
        <button style={p.signOutBtn} onClick={handleSignOut}>Sign Out</button>
      </div>
    )
  }

  return (
    <div style={p.wrapper}>
      {showTutorial && (
        <MenteeTutorial onComplete={completeTutorial} onTabChange={setTab} />
      )}
      {/* Sidebar */}
      <aside style={p.sidebar}>
        <div style={p.sidebarLogo}>
          {companyLogo
            ? <img src={companyLogo} alt="Logo" style={p.sidebarLogoImg} />
            : <span style={p.sidebarLogoText}>{companyName}</span>
          }
        </div>
        <nav style={p.sidebarNav}>
          {TABS.map(t => (
            <button
              key={t.key}
              style={{ ...p.sidebarNavBtn, ...(tab === t.key ? p.sidebarNavBtnActive : {}) }}
              onClick={() => setTab(t.key)}
            >
              {tab === t.key && <div style={p.activeBar} />}
              {t.icon && <t.icon size={16} strokeWidth={tab === t.key ? 2.2 : 1.8} style={{ opacity: tab === t.key ? 1 : 0.5, flexShrink: 0 }} />}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div style={p.sidebarFooter}>
          <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <RoleSwitcher />
          </div>
          <BugReportButton inline />
          <button style={p.sidebarSignOut} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main style={p.main}>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div>
            <h1 style={p.pageTitle}>Welcome back, {mentee?.first_name}!</h1>
            <p style={p.pageSub}>Here's a summary of your program.</p>
            <div style={p.overviewGrid}>
              <div style={p.overviewCard} onClick={() => setTab('courses')}>
                <div style={{ ...p.overviewIcon, background: '#eef2ff' }}>
                  <BookOpen size={22} color="#6366f1" />
                </div>
                <div style={p.overviewStat}>{assignedOfferings.length}</div>
                <div style={p.overviewLabel}>Active Courses</div>
              </div>
              <div style={p.overviewCard} onClick={() => setTab('billing')}>
                <div style={{ ...p.overviewIcon, background: pendingInvoices.length > 0 ? '#fef2f2' : '#f0fdf4' }}>
                  <CreditCard size={22} color={pendingInvoices.length > 0 ? '#dc2626' : '#16a34a'} />
                </div>
                <div style={p.overviewStat}>{pendingInvoices.length}</div>
                <div style={p.overviewLabel}>Outstanding Invoices</div>
              </div>
              <div style={p.overviewCard} onClick={() => setTab('profile')}>
                <div style={{ ...p.overviewIcon, background: '#f0fdf4' }}>
                  <User size={22} color="#16a34a" />
                </div>
                <div style={p.overviewStat}>{mentee?.status || '—'}</div>
                <div style={p.overviewLabel}>Program Status</div>
              </div>
              <div style={p.overviewCard} onClick={() => setTab('meetings')}>
                <div style={{ ...p.overviewIcon, background: upcomingMeetings.length > 0 ? '#f0fdfa' : '#f9fafb' }}>
                  <Calendar size={22} color={upcomingMeetings.length > 0 ? '#0d9488' : '#9ca3af'} />
                </div>
                <div style={p.overviewStat}>{upcomingMeetings.length}</div>
                <div style={p.overviewLabel}>Upcoming Meetings</div>
              </div>
            </div>

            {pendingInvoices.length > 0 && (
              <div style={p.alertBanner}>
                <AlertCircle size={16} color="#dc2626" />
                <span>You have <strong>{pendingInvoices.length}</strong> outstanding invoice{pendingInvoices.length !== 1 ? 's' : ''} totalling <strong>{fmt(pendingInvoices.reduce((s, i) => s + Number(i.amount), 0))}</strong>.</span>
                <button style={p.alertBtn} onClick={() => setTab('billing')}>View Invoices →</button>
              </div>
            )}
          </div>
        )}

        {/* ── My Courses ── */}
        {/* ── My Courses ── */}
        {tab === 'courses' && (
          <div>
            {openLessonId ? (() => {
              // Find lesson from progress or from allCourseLessons
              const lp = lessonProgress.find(l => l.lesson?.id === openLessonId)
              const lessonData = lp?.lesson || Object.values(allCourseLessons).flat().find(l => l.id === openLessonId)
              if (!lessonData) return null
              const course = enrolledCourses.find(c => c.id === lessonData.course_id)
              const ao = course ? assignedOfferings.find(a => a.offering?.id === course.offering_id) : null
              return (
                <LessonViewer
                  lesson={lessonData}
                  questions={lessonQuestions[openLessonId] || []}
                  responses={myResponses}
                  onSubmitResponse={handleSubmitResponse}
                  isCompleted={!!(lp?.completed_at)}
                  onMarkComplete={lp ? () => { handleCompleteLesson(lp.id); setOpenLessonId(null) } : undefined}
                  onBack={() => setOpenLessonId(null)}
                  onFeedback={ao ? () => setFeedbackModal({ offeringId: ao.offering.id, courseId: course?.id, lessonId: openLessonId }) : undefined}
                />
              )
            })() : (
              <>
                <h1 style={p.pageTitle}>My Courses</h1>
                <p style={p.pageSub}>Offerings and programs you're currently enrolled in.</p>
                {assignedOfferings.length === 0 ? (
                  <div style={p.emptyState}>
                    <BookOpen size={36} color="#d1d5db" strokeWidth={1.5} />
                    <p>No courses assigned yet. Contact your administrator.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {assignedOfferings.map(ao => {
                      const course = enrolledCourses.find(c => c.offering_id === ao.offering?.id)
                      const allLessons = course ? (allCourseLessons[course.id] || []) : []
                      const unlockedIds = new Set(lessonProgress.filter(lp => lp.lesson?.course_id === course?.id).map(lp => lp.lesson?.id))
                      const progressMap = {}
                      lessonProgress.filter(lp => lp.lesson?.course_id === course?.id).forEach(lp => { progressMap[lp.lesson?.id] = lp })
                      const completedCount = Object.values(progressMap).filter(lp => lp.completed_at).length
                      const total = allLessons.length
                      const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0

                      return (
                        <div key={ao.id} style={p.courseCard}>
                          <div style={p.courseHeader}>
                            <div style={p.courseIcon}><BookOpen size={18} color="#6366f1" /></div>
                            <span style={p.courseBilling}>
                              {ao.offering?.billing_type === 'recurring' ? 'Recurring' : 'One-time'}
                            </span>
                          </div>
                          <div style={p.courseName}>{ao.offering?.name}</div>
                          {ao.offering?.description && (
                            <div style={p.courseDesc}>{ao.offering.description}</div>
                          )}
                          <div style={p.courseMeta}>
                            {ao.offering?.duration_value && (
                              <span style={p.courseMetaItem}>{ao.offering.duration_value} {ao.offering.duration_unit}</span>
                            )}
                            {ao.offering?.cost && (
                              <span style={p.courseMetaItem}>{fmt(ao.offering.cost)}</span>
                            )}
                          </div>
                          <div style={p.courseFooter}>
                            <span style={p.courseDate}>Enrolled {ao.assigned_date}</span>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <button
                                style={p.feedbackBtn}
                                onClick={() => setFeedbackModal({ offeringId: ao.offering.id, courseId: course?.id })}
                              >
                                <MessageSquare size={12} /> Feedback
                              </button>
                              <span style={{ ...p.courseStatus, backgroundColor: '#f0fdf4', color: '#16a34a' }}>Active</span>
                            </div>
                          </div>

                          {/* All lessons for this course */}
                          {allLessons.length > 0 && (
                            <div style={p.lessonsCard}>
                              <div style={p.lessonsTitle}>
                                <span>Lessons</span>
                                <span style={p.progressLabel}>{completedCount} of {total} completed</span>
                              </div>
                              <div style={p.progressBarWrap}>
                                <div style={{ ...p.progressBarFill, width: `${pct}%` }} />
                              </div>
                              <div style={p.lessonsList}>
                                {allLessons.map((lesson, idx) => {
                                  const isUnlocked = unlockedIds.has(lesson.id)
                                  const progress = progressMap[lesson.id]
                                  const hasContent = lesson.content && lesson.content !== '<p></p>'
                                  const hasVideo = !!lesson.video_url
                                  const hasQuestions = (lessonQuestions[lesson.id] || []).length > 0
                                  const lessonWbs = isUnlocked ? (issuedWhiteboards[lesson.id] || []) : []

                                  if (!isUnlocked) {
                                    return (
                                      <div key={lesson.id} style={{ ...p.lessonRow, opacity: 0.5 }}>
                                        <div style={{ ...p.lessonNum, background: '#f3f4f6', color: '#d1d5db' }}>
                                          <Lock size={12} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <div style={{ ...p.lessonTitle, color: '#9ca3af' }}>{lesson.title}</div>
                                          {lesson.description && <div style={p.lessonDesc}>{lesson.description}</div>}
                                        </div>
                                        <span style={p.lockedBadge}>Locked</span>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div key={lesson.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                                      <div
                                        style={{ ...p.lessonRow, borderBottom: 'none', cursor: (hasContent || hasVideo || hasQuestions) ? 'pointer' : 'default' }}
                                        onClick={() => (hasContent || hasVideo || hasQuestions) && handleOpenLesson(lesson.id)}
                                      >
                                        <div style={{ ...p.lessonNum, background: progress?.completed_at ? '#f0fdf4' : '#eef2ff', color: progress?.completed_at ? '#16a34a' : '#6366f1' }}>
                                          {progress?.completed_at ? <CheckCircle size={14} /> : idx + 1}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <div style={p.lessonTitle}>{lesson.title}</div>
                                          {lesson.description && <div style={p.lessonDesc}>{lesson.description}</div>}
                                          <div style={p.lessonMeta}>
                                            {progress && <>Unlocked {new Date(progress.unlocked_at).toLocaleDateString()}</>}
                                            {progress?.completed_at && ` · Completed ${new Date(progress.completed_at).toLocaleDateString()}`}
                                          </div>
                                          {(hasContent || hasVideo || hasQuestions) && (
                                            <div style={p.lessonIndicators}>
                                              {hasVideo && <span style={p.lessonIndicator}><Play size={11} /> Video</span>}
                                              {hasContent && <span style={p.lessonIndicator}><BookOpen size={11} /> Content</span>}
                                              {hasQuestions && <span style={p.lessonIndicator}>? {(lessonQuestions[lesson.id] || []).length} Q</span>}
                                            </div>
                                          )}
                                        </div>
                                        {(hasContent || hasVideo || hasQuestions) ? (
                                          <button style={p.openLessonBtn} onClick={e => { e.stopPropagation(); handleOpenLesson(lesson.id) }}>Open</button>
                                        ) : progress && !progress.completed_at ? (
                                          <button style={p.completeBtn} onClick={e => { e.stopPropagation(); handleCompleteLesson(progress.id) }}>Mark Complete</button>
                                        ) : progress?.completed_at ? (
                                          <span style={p.completedBadge}>Done</span>
                                        ) : null}
                                      </div>
                                      {lessonWbs.length > 0 && (
                                        <div style={p.wbInlineSection}>
                                          <div style={p.wbInlineHeader}>
                                            <Clipboard size={12} color="#8b5cf6" />
                                            <span style={p.wbInlineHeaderText}>Whiteboards:</span>
                                          </div>
                                          {lessonWbs.map(wb => (
                                            <div key={wb.id} style={p.wbInlineRow}>
                                              <span style={p.wbInlineBullet}>•</span>
                                              <div style={{ flex: 1 }}>
                                                <span style={p.wbInlineTitle}>{wb.whiteboard?.title}</span>
                                                {wb.whiteboard?.description && <span style={p.wbInlineDesc}> — {wb.whiteboard.description}</span>}
                                              </div>
                                              <span style={p.wbInlineDate}>{new Date(wb.issued_at).toLocaleDateString()}</span>
                                              {wb.completed_at ? (
                                                <span style={p.wbInlineDone}>✓ Complete</span>
                                              ) : (
                                                <button style={p.wbInlineCompleteBtn} onClick={() => handleCompleteWhiteboard(wb.id)}>Mark Done</button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Feedback modal */}
        {feedbackModal && (
          <div style={p.fbOverlay} onClick={e => { if (e.target === e.currentTarget) { setFeedbackModal(null); setFeedbackText(''); setFeedbackRating(0); setFeedbackResult(null) } }}>
            <div style={p.fbModal}>
              <div style={p.fbHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={16} color="#6366f1" />
                  <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem' }}>Course Feedback</span>
                </div>
                <button style={p.fbClose} onClick={() => { setFeedbackModal(null); setFeedbackText(''); setFeedbackRating(0); setFeedbackResult(null) }}><X size={16} /></button>
              </div>
              <div style={p.fbBody}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Rating</label>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setFeedbackRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Star size={22} color={n <= feedbackRating ? '#f59e0b' : '#d1d5db'} fill={n <= feedbackRating ? '#f59e0b' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>Your feedback</label>
                  <textarea
                    style={{ padding: '0.65rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    placeholder="What did you think of this course? Any suggestions?"
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    rows={4}
                  />
                </div>
                {feedbackResult && (
                  <div style={{ padding: '0.6rem 0.85rem', borderRadius: 7, fontSize: '0.82rem', fontWeight: 500, backgroundColor: feedbackResult.type === 'success' ? '#f0fdf4' : '#fef2f2', color: feedbackResult.type === 'success' ? '#15803d' : '#dc2626', border: `1px solid ${feedbackResult.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                    {feedbackResult.text}
                  </div>
                )}
              </div>
              <div style={p.fbFooter}>
                <button style={{ padding: '0.55rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.85rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' }} onClick={() => { setFeedbackModal(null); setFeedbackText(''); setFeedbackRating(0); setFeedbackResult(null) }}>Cancel</button>
                <button
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSending || !feedbackText.trim()}
                >
                  {feedbackSending ? 'Submitting…' : 'Submit Feedback'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Meetings ── */}
        {tab === 'meetings' && (
          <div>
            <h1 style={p.pageTitle}>My Meetings</h1>
            <p style={p.pageSub}>View your meeting schedule and request time with your mentor.</p>

            {/* Credit charts per arrangement */}
            {arrangementOfferings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {arrangementOfferings.map(ao => {
                  const balance = creditBalances[ao.id] ?? 0
                  const linked = meetings.filter(m => m.mentee_offering_id === ao.id)
                  const completed = linked.filter(m => m.status === 'completed').length
                  const upcoming = linked.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date()).length
                  const remaining = Math.max(balance, 0)
                  const total = completed + upcoming + remaining
                  return (
                    <div key={ao.id} style={p.creditCard}>
                      <div style={p.creditCardHeader}>
                        <div>
                          <div style={p.creditCardName}>{ao.offering?.name}</div>
                          <div style={p.creditCardSub}>Meeting credit allocation</div>
                        </div>
                        <div style={{ ...p.creditBadge, ...(remaining === 0 ? { backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' } : {}) }}>
                          {remaining} available
                        </div>
                      </div>
                      {total > 0 ? (
                        <>
                          <div style={{ display: 'flex', height: 14, borderRadius: 79, overflow: 'hidden', backgroundColor: '#e5e7eb', marginBottom: '0.6rem' }}>
                            {completed > 0 && (
                              <div title={`${completed} completed`} style={{ width: `${(completed / total) * 100}%`, backgroundColor: '#6366f1', transition: 'width 0.4s' }} />
                            )}
                            {upcoming > 0 && (
                              <div title={`${upcoming} upcoming`} style={{ width: `${(upcoming / total) * 100}%`, backgroundColor: '#f59e0b', transition: 'width 0.4s' }} />
                            )}
                            {remaining > 0 && (
                              <div title={`${remaining} available`} style={{ width: `${(remaining / total) * 100}%`, backgroundColor: '#d1fae5', transition: 'width 0.4s' }} />
                            )}
                          </div>
                          <div style={p.creditLegend}>
                            <span style={p.creditLegendItem}>
                              <span style={{ ...p.creditDot, backgroundColor: '#6366f1' }} />
                              <strong>{completed}</strong> completed
                            </span>
                            <span style={p.creditLegendItem}>
                              <span style={{ ...p.creditDot, backgroundColor: '#f59e0b' }} />
                              <strong>{upcoming}</strong> upcoming
                            </span>
                            <span style={p.creditLegendItem}>
                              <span style={{ ...p.creditDot, backgroundColor: '#10b981' }} />
                              <strong>{remaining}</strong> available
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#9ca3af' }}>
                              {total} total allocated
                            </span>
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No credits granted yet. Credits are issued when invoices are paid.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Schedule button */}
            {!showMeetingForm && (
              <div style={{ marginBottom: '1.25rem' }}>
                <button
                  style={{ ...p.saveBtn, display: 'inline-flex', alignItems: 'center', gap: '0.45rem', opacity: hasMeetingCredits ? 1 : 0.45, cursor: hasMeetingCredits ? 'pointer' : 'not-allowed' }}
                  disabled={!hasMeetingCredits}
                  onClick={() => hasMeetingCredits && setShowMeetingForm(true)}
                  title={!hasMeetingCredits ? 'No meeting credits available. Contact your mentor.' : 'Request a meeting with your mentor'}
                >
                  <CalendarPlus size={15} />
                  Schedule Meeting
                </button>
                {!hasMeetingCredits && arrangementOfferings.length > 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>
                    No credits available. Credits are granted when your invoice is marked paid.
                  </p>
                )}
                {arrangementOfferings.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>
                    You need an active arrangement to schedule meetings. Contact your administrator.
                  </p>
                )}
              </div>
            )}

            {/* Request form */}
            {showMeetingForm && (
              <div style={{ ...p.section, marginBottom: '1.25rem' }}>
                <div style={p.sectionTitle}>Request a Meeting</div>
                <div style={p.sectionBody}>
                  {meetingError && <div style={p.errorBox}>{meetingError}</div>}
                  <form onSubmit={handleRequestMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={p.formRow}>
                      <div style={p.fieldGroup}>
                        <label style={p.label}>Date & Time *</label>
                        <input style={p.input} type="datetime-local" required
                          value={meetingForm.scheduled_at}
                          onChange={e => setMeetingForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                      </div>
                      <div style={p.fieldGroup}>
                        <label style={p.label}>Duration (minutes)</label>
                        <input style={p.input} type="number" min="15" step="15"
                          value={meetingForm.duration_minutes}
                          onChange={e => setMeetingForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                      </div>
                    </div>
                    <div style={p.fieldGroup}>
                      <label style={p.label}>Notes (optional)</label>
                      <textarea style={{ ...p.input, resize: 'vertical', fontFamily: 'inherit' }} rows={2}
                        placeholder="Any topics or requests for your mentor…"
                        value={meetingForm.notes}
                        onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button type="button" style={p.cancelBtn} onClick={() => { setShowMeetingForm(false); setMeetingError(null) }}>Cancel</button>
                      <button type="submit" style={{ ...p.saveBtn, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} disabled={savingMeeting}>
                        {savingMeeting ? 'Scheduling…' : <><CalendarPlus size={14} /> Schedule</>}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Upcoming meetings */}
            {upcomingMeetings.length > 0 && (
              <div style={{ ...p.section, marginBottom: '1rem' }}>
                <div style={p.sectionTitle}>Upcoming</div>
                <div style={p.sectionBody}>
                  {[...upcomingMeetings].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).map(m => (
                    <MeetingItem key={m.id} meeting={m} />
                  ))}
                </div>
              </div>
            )}

            {/* Past meetings */}
            {meetings.filter(m => m.status === 'completed' || new Date(m.scheduled_at) < new Date()).length > 0 && (
              <div style={p.section}>
                <div style={p.sectionTitle}>Past</div>
                <div style={p.sectionBody}>
                  {meetings
                    .filter(m => m.status === 'completed' || (m.status !== 'scheduled' ? true : new Date(m.scheduled_at) < new Date()))
                    .filter(m => !upcomingMeetings.some(u => u.id === m.id))
                    .map(m => <MeetingItem key={m.id} meeting={m} past />)
                  }
                </div>
              </div>
            )}

            {meetings.length === 0 && !showMeetingForm && (
              <div style={p.emptyState}>
                <Calendar size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No meetings yet. Use the button above to schedule one.</p>
              </div>
            )}
          </div>
        )}

        {/* ── My Profile ── */}
        {tab === 'profile' && profileForm && (
          <div>
            <h1 style={p.pageTitle}>My Profile</h1>
            <p style={p.pageSub}>Update your personal information.</p>
            {profileSuccess && <div style={p.successBox}>{profileSuccess}</div>}
            {profileError && <div style={p.errorBox}>{profileError}</div>}
            <form onSubmit={handleProfileSave} style={p.formCard}>
              <div style={p.formSection}>
                <div style={p.formSectionTitle}>Profile Picture</div>
                <div style={{ ...p.formSectionBody, alignItems: 'center', display: 'flex', flexDirection: 'column' }}>
                  <AvatarUpload
                    url={profileForm.avatar_url}
                    initials={initials}
                    gradient="linear-gradient(135deg, #3b82f6, #6366f1)"
                    onChange={setAvatarFile}
                    size={80}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    JPG, PNG or WebP. Max 5 MB.
                  </p>
                </div>
              </div>
              <div style={p.formSection}>
                <div style={p.formSectionTitle}>Personal Info</div>
                <div style={p.formSectionBody}>
                  <div style={p.formRow}>
                    <PField label="First Name" name="first_name" value={profileForm.first_name || ''} onChange={handleProfileChange} required />
                    <PField label="Last Name" name="last_name" value={profileForm.last_name || ''} onChange={handleProfileChange} required />
                  </div>
                  <PField label="Phone" name="phone" value={profileForm.phone || ''} onChange={handleProfileChange} />
                  <PField label="Email" name="email" type="email" value={profileForm.email || ''} onChange={handleProfileChange} disabled />
                  <div style={p.fieldGroup}>
                    <label style={p.label}>Program Status</label>
                    {menteeCanEditStatus ? (
                      <select
                        style={p.input}
                        name="status"
                        value={profileForm.status || ''}
                        onChange={handleProfileChange}
                      >
                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <div style={{ padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#6b7280', backgroundColor: '#f9fafb' }}>
                        {profileForm.status || '—'}
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#9ca3af' }}>(set by your mentor)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={p.formSection}>
                <div style={p.formSectionTitle}>Address</div>
                <div style={p.formSectionBody}>
                  <PField label="Street Address" name="address_street1" value={profileForm.address_street1 || ''} onChange={handleProfileChange} />
                  <PField label="Address Line 2" name="address_street2" value={profileForm.address_street2 || ''} onChange={handleProfileChange} />
                  <div style={p.formRow}>
                    <PField label="City" name="address_city" value={profileForm.address_city || ''} onChange={handleProfileChange} />
                    <div style={p.fieldGroup}>
                      <label style={p.label}>State</label>
                      <select style={p.input} name="address_state" value={profileForm.address_state || ''} onChange={handleProfileChange}>
                        <option value="">—</option>
                        {US_STATES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </div>
                    <PField label="ZIP" name="address_zip" value={profileForm.address_zip || ''} onChange={handleProfileChange} />
                  </div>
                  <div style={p.fieldGroup}>
                    <label style={p.label}>Country</label>
                    <select style={p.input} name="address_country" value={profileForm.address_country || ''} onChange={handleProfileChange}>
                      <option value="">— Select —</option>
                      {COUNTRIES.map((c, i) => c.disabled
                        ? <option key={i} disabled>{c.label}</option>
                        : <option key={c.value} value={c.value}>{c.label}</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>
              <div style={p.formSection}>
                <div style={p.formSectionTitle}>About Me</div>
                <div style={p.formSectionBody}>
                  <div style={p.fieldGroup}>
                    <label style={p.label}>Bio</label>
                    <textarea
                      style={{ ...p.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 80 }}
                      name="bio"
                      value={profileForm.bio || ''}
                      onChange={handleProfileChange}
                      rows={4}
                      placeholder="Tell us a little about yourself — hobbies, interests, goals…"
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="submit" style={p.saveBtn} disabled={profileSaving}>
                  {profileSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Billing ── */}
        {tab === 'billing' && (
          <div>
            <h1 style={p.pageTitle}>Billing</h1>
            <p style={p.pageSub}>Your invoices and payment information.</p>

            {pmSuccess && <div style={p.successBox}>{pmSuccess}</div>}
            {pmError && <div style={p.errorBox}>{pmError}</div>}

            <div style={p.billingGrid}>
              {/* Invoices */}
              <div style={p.section}>
                <div style={p.sectionTitle}>Invoices</div>
                <div style={p.sectionBody}>
                  {invoices.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No invoices yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {invoices.map(inv => {
                        const ss = STATUS_STYLES[inv.status] || STATUS_STYLES.pending
                        return (
                          <div key={inv.id} style={p.invoiceRow}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={p.invName}>{inv.offering?.name || inv.description || 'Invoice'}</div>
                                {inv.invoice_number && <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6366f1', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate(`/mentee/invoices/${inv.id}`)}>{inv.invoice_number}</span>}
                              </div>
                              <div style={p.invDate}>Due: {inv.due_date}</div>
                            </div>
                            <div style={p.invAmount}>{fmt(inv.amount)}</div>
                            <span style={{ ...p.invBadge, backgroundColor: ss.bg, color: ss.color }}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              <div style={p.section}>
                <div style={p.sectionTitle}>Payment Method</div>
                <div style={p.sectionBody}>
                  {paymentMethod && !editingPm ? (
                    <div>
                      <div style={p.savedCard}>
                        <CreditCard size={18} color="#6366f1" />
                        <div>
                          <div style={p.cardLine}>{paymentMethod.card_brand || 'Card'} •••• {paymentMethod.card_last4}</div>
                          <div style={p.cardSub}>Expires {paymentMethod.card_expiry} · {paymentMethod.card_holder}</div>
                        </div>
                        <button style={p.changeBtn} onClick={() => setEditingPm(true)}>Update</button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handlePmSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={p.pmNotice}>
                        <Shield size={12} color="#6366f1" />
                        <span>Card numbers are not stored. Only the last 4 digits are saved.</span>
                      </div>
                      <PField label="Cardholder Name" name="card_holder" value={pmForm.card_holder} onChange={handlePmChange} required />
                      <PField label="Card Number" name="card_number" value={pmForm.card_number} onChange={handlePmChange} placeholder="1234 5678 9012 3456" required />
                      <div style={p.formRow}>
                        <PField label="Expiry (MM/YY)" name="card_expiry" value={pmForm.card_expiry} onChange={handlePmChange} placeholder="MM/YY" required />
                        <PField label="CVV" name="card_cvv" value={pmForm.card_cvv} onChange={handlePmChange} placeholder="•••" />
                      </div>
                      <div style={p.pmLabel}>Billing Address</div>
                      <PField label="Street" name="billing_street" value={pmForm.billing_street} onChange={handlePmChange} />
                      <div style={p.formRow}>
                        <PField label="City" name="billing_city" value={pmForm.billing_city} onChange={handlePmChange} />
                        <PField label="ZIP" name="billing_zip" value={pmForm.billing_zip} onChange={handlePmChange} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                        {paymentMethod && <button type="button" style={p.cancelBtn} onClick={() => setEditingPm(false)}>Cancel</button>}
                        <button type="submit" style={p.saveBtn} disabled={pmSaving}>{pmSaving ? 'Saving…' : 'Save Card'}</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

function PField({ label, name, value, onChange, type = 'text', required, disabled, placeholder }) {
  return (
    <div style={p.fieldGroup}>
      <label style={p.label}>{label}{required ? ' *' : ''}</label>
      <input
        style={{ ...p.input, ...(disabled ? { backgroundColor: '#f9fafb', color: '#9ca3af' } : {}) }}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}

const p = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' },
  sidebar: {
    width: 'var(--sidebar-width, 240px)',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 20,
    borderRight: '1px solid rgba(255,255,255,0.04)',
  },
  sidebarLogo: {
    padding: '1.4rem 1.1rem 1.2rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sidebarLogoImg: { height: 30, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 },
  sidebarLogoText: { fontSize: '1rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.02em' },
  sidebarNav: {
    flex: 1,
    padding: '0.75rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    overflowY: 'auto',
  },
  sidebarNavBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.6rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(156,163,175,0.75)',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    position: 'relative',
    transition: 'color 0.12s',
  },
  sidebarNavBtnActive: {
    color: '#fff',
    fontWeight: 600,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '15%',
    bottom: '15%',
    width: 3,
    borderRadius: '0 3px 3px 0',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  sidebarSignOut: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(156,163,175,0.6)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.12s',
  },
  signOutBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.8rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  main: { marginLeft: 'var(--sidebar-width, 240px)', flex: 1, maxWidth: 960, padding: '2rem 1.5rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.25rem' },
  pageSub: { color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' },
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' },
  overviewCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'center' },
  overviewIcon: { width: 48, height: 48, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.65rem' },
  overviewStat: { fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.25rem' },
  overviewLabel: { fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 },
  alertBanner: { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem 1rem', backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: '0.875rem', color: '#dc2626', flexWrap: 'wrap' },
  alertBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #f3f4f6' },
  courseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' },
  courseCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  courseHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  courseIcon: { width: 34, height: 34, borderRadius: 7, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseBilling: { fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  courseName: { fontWeight: 700, color: '#111827', fontSize: '0.95rem' },
  courseDesc: { fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 },
  courseMeta: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  courseMetaItem: { fontSize: '0.75rem', padding: '0.2rem 0.55rem', backgroundColor: '#f3f4f6', borderRadius: 79, color: '#6b7280', fontWeight: 600 },
  courseFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' },
  courseDate: { fontSize: '0.75rem', color: '#9ca3af' },
  courseStatus: { fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: 79, fontWeight: 600 },
  formCard: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  formSection: { borderBottom: '1px solid #f3f4f6' },
  formSectionTitle: { padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', textTransform: 'uppercase', letterSpacing: '0.07em' },
  formSectionBody: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  formRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.72rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' },
  saveBtn: { padding: '0.6rem 1.4rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' },
  cancelBtn: { padding: '0.6rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  billingGrid: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  section: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  sectionTitle: { padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '1rem 1.25rem' },
  invoiceRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' },
  invName: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  invDate: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' },
  invAmount: { fontWeight: 700, color: '#111827', fontSize: '0.9rem', flexShrink: 0 },
  invBadge: { padding: '0.2rem 0.55rem', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  savedCard: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  cardLine: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  cardSub: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' },
  changeBtn: { marginLeft: 'auto', padding: '0.3rem 0.75rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 8, color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  pmNotice: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.75rem', backgroundColor: '#eef2ff', borderRadius: 8, fontSize: '0.75rem', color: '#4338ca' },
  pmLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.25rem' },
  lessonsCard: { backgroundColor: '#fff', borderRadius: 8, border: '1px solid #f3f4f6', overflow: 'hidden' },
  lessonsTitle: { padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontWeight: 600, color: '#6366f1', fontSize: '0.72rem', textTransform: 'none', letterSpacing: 0 },
  progressBarWrap: { height: 4, backgroundColor: '#e5e7eb', margin: '0 1.25rem' },
  progressBarFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 79, transition: 'width 0.4s ease' },
  lessonsList: { padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  lockedHint: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.25rem', color: '#d1d5db', fontSize: '0.78rem', fontStyle: 'italic' },
  lessonRow: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0.25rem', borderBottom: '1px solid #f9fafb' },
  lessonNum: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, marginTop: 2 },
  lessonTitle: { fontWeight: 600, color: '#111827', fontSize: '0.9rem', marginBottom: '0.15rem' },
  lessonDesc: { fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '0.25rem' },
  lessonMeta: { fontSize: '0.72rem', color: '#9ca3af' },
  lessonIndicators: { display: 'flex', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' },
  lessonIndicator: { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#6366f1', backgroundColor: '#eef2ff', padding: '0.15rem 0.45rem', borderRadius: 4, fontWeight: 600 },
  openLessonBtn: { padding: '0.35rem 0.75rem', background: 'none', border: '1.5px solid #c7d2fe', color: '#6366f1', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, cursor: 'pointer' },
  completeBtn: { padding: '0.35rem 0.75rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, cursor: 'pointer' },
  completedBadge: { padding: '0.25rem 0.65rem', backgroundColor: '#f0fdf4', color: '#16a34a', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  lockedBadge: { padding: '0.25rem 0.65rem', backgroundColor: '#f3f4f6', color: '#d1d5db', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  feedbackBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.6rem', background: 'none', border: '1.5px solid #c7d2fe', borderRadius: 79, color: '#6366f1', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  fbOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' },
  fbModal: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' },
  fbHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.25rem', borderBottom: '1px solid #f3f4f6' },
  fbClose: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
  fbBody: { padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  fbFooter: { display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6' },
  wbInlineSection: { backgroundColor: '#faf5ff', borderLeft: '3px solid #8b5cf6', padding: '0.4rem 0.75rem 0.5rem 0.75rem', marginLeft: '0.25rem', marginBottom: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  wbInlineHeader: { display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' },
  wbInlineHeaderText: { fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed' },
  wbInlineRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  wbInlineBullet: { color: '#a78bfa', fontSize: '0.8rem', flexShrink: 0 },
  wbInlineTitle: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  wbInlineDesc: { fontSize: '0.78rem', color: '#6b7280' },
  wbInlineDate: { fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 },
  wbInlineDone: { padding: '0.15rem 0.5rem', backgroundColor: '#f0fdf4', color: '#16a34a', borderRadius: 79, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 },
  wbInlineCompleteBtn: { padding: '0.2rem 0.55rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  wbCard: { backgroundColor: '#fff', borderRadius: 8, border: '1px solid #f3f4f6', boxShadow: 'var(--shadow-sm)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  wbCardHeader: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  wbIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wbTitle: { fontWeight: 700, color: '#111827', fontSize: '0.95rem' },
  wbMeta: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' },
  wbBadge: { padding: '0.2rem 0.65rem', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  wbDesc: { fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.55, padding: '0.65rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6' },
  wbNotesSection: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  wbNotesLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  wbNotesInput: { width: '100%', padding: '0.7rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.875rem', color: '#111827', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 },
  wbActions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  wbSaveBtn: { padding: '0.45rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.82rem', color: '#374151', fontWeight: 500, cursor: 'pointer' },
  wbCompleteBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 1.1rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  creditCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1.1rem 1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  creditCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' },
  creditCardName: { fontWeight: 700, color: '#111827', fontSize: '0.9rem' },
  creditCardSub: { fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' },
  creditBadge: { padding: '0.25rem 0.7rem', borderRadius: 79, fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', flexShrink: 0 },
  creditLegend: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#6b7280', alignItems: 'center' },
  creditLegendItem: { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  creditDot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
  meetingRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' },
  meetingIcon: { width: 36, height: 36, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  meetingTitle: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  meetingMeta: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' },
  meetingBadge: { padding: '0.2rem 0.6rem', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
}
