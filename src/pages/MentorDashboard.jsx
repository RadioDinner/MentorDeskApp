import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Users, Calendar, User, LogOut, CalendarCheck, CalendarPlus, BarChart3, ArrowLeft, TrendingUp, Clock, CheckCircle, Eye, FlaskConical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import RoleSwitcher from '../components/RoleSwitcher'
import BugReportButton from '../components/BugReportButton'
import { parseStatuses, getStatusColor } from '../utils/statuses'

function MeetingItem({ meeting }) {
  const dt = new Date(meeting.scheduled_at)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const mentee = meeting.mentee
  const isCompleted = meeting.status === 'completed'
  const isPast = new Date(meeting.scheduled_at) < new Date()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: isCompleted || isPast ? '#f9fafb' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isCompleted
          ? <CalendarCheck size={16} color="#9ca3af" />
          : isPast
            ? <Calendar size={16} color="#9ca3af" />
            : <CalendarPlus size={16} color="#0d9488" />
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{meeting.title || 'Meeting'}</div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
          {dateStr} at {timeStr} · {meeting.duration_minutes} min
          {mentee ? ` · with ${mentee.first_name} ${mentee.last_name}` : ''}
        </div>
      </div>
      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, backgroundColor: isCompleted ? '#f0fdf4' : '#f0fdfa', color: isCompleted ? '#16a34a' : '#0d9488' }}>
        {isCompleted ? 'Completed' : 'Scheduled'}
      </span>
    </div>
  )
}

export default function MentorDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [mentorId, setMentorId] = useState(null)
  const [mentor, setMentor] = useState(null)
  const [mentees, setMentees] = useState([])
  const [meetings, setMeetings] = useState([])
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyName, setCompanyName] = useState('MentorDesk')
  const [statusOptions, setStatusOptions] = useState([])
  const [loading, setLoading] = useState(true)

  // Mentee history detail
  const [selectedMentee, setSelectedMentee] = useState(null)
  const [menteeHistory, setMenteeHistory] = useState({ meetings: [], offerings: [], credits: {} })
  const [historyLoading, setHistoryLoading] = useState(false)

  // Test mentee account
  const [testMenteeId, setTestMenteeId] = useState(null)
  const [testMenteeLoading, setTestMenteeLoading] = useState(false)
  const [testMenteeReady, setTestMenteeReady] = useState(false)

  const { activeEntityId, organizationId, session, setActiveRole, roles, refreshRoles } = useRole()

  useEffect(() => { loadAll() }, [activeEntityId, organizationId])

  async function loadAll() {
    setLoading(true)

    const settingsRes = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
    if (settingsRes.data) {
      const get = k => settingsRes.data.find(s => s.key === k)?.value || ''
      setCompanyLogo(get('company_logo_horizontal') || get('company_logo'))
      setCompanyName(get('company_name') || 'MentorDesk')
      setStatusOptions(parseStatuses(settingsRes.data.find(s => s.key === 'mentee_statuses')?.value))
    }

    const mid = activeEntityId
    if (!mid) { setLoading(false); return }
    setMentorId(mid)

    const [mentorRes, menteesRes, meetingsRes] = await Promise.all([
      supabase.from('mentors').select('id, first_name, last_name, email, phone, avatar_url, availability').eq('id', mid).single(),
      supabase.from('mentees').select('id, first_name, last_name, email, phone, status, avatar_url, signup_date').eq('mentor_id', mid).neq('is_test_account', true).order('last_name'),
      supabase.from('meetings')
        .select('id, scheduled_at, duration_minutes, title, status, mentee:mentees(id, first_name, last_name)')
        .eq('mentor_id', mid)
        .order('scheduled_at', { ascending: false }),
    ])

    if (mentorRes.data) setMentor(mentorRes.data)
    if (menteesRes.data) setMentees(menteesRes.data)
    if (meetingsRes.data) setMeetings(meetingsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    if (mentorId && organizationId) loadTestMentee()
  }, [mentorId, organizationId])

  async function loadTestMentee() {
    const { data } = await supabase.from('mentees')
      .select('id')
      .eq('mentor_id', mentorId)
      .eq('organization_id', organizationId)
      .eq('is_test_account', true)
      .limit(1)
      .single()
    if (data) {
      setTestMenteeId(data.id)
      // Check if the mentee role is already linked
      setTestMenteeReady(roles?.includes('mentee'))
    }
  }

  async function handleTestMentee() {
    // If already set up, just switch role
    if (testMenteeReady) {
      setActiveRole('mentee')
      navigate('/mentee')
      return
    }

    setTestMenteeLoading(true)
    const userId = session?.user?.id
    if (!userId) { setTestMenteeLoading(false); return }

    let menteeId = testMenteeId

    // Step 1: Create test mentee record if needed
    if (!menteeId) {
      const { data, error } = await supabase.from('mentees').insert({
        first_name: mentor?.first_name || 'Test',
        last_name: `${mentor?.last_name || 'Mentee'} (Test)`,
        email: mentor?.email || null,
        mentor_id: mentorId,
        organization_id: organizationId,
        status: 'Active',
        is_test_account: true,
      }).select('id').single()

      if (error || !data) {
        console.error('Failed to create test mentee:', error)
        setTestMenteeLoading(false)
        return
      }
      menteeId = data.id
      setTestMenteeId(menteeId)
    }

    // Step 2: Add mentee role to user_roles (if not already there)
    await supabase.from('user_roles').upsert({
      user_id: userId,
      role: 'mentee',
      entity_id: menteeId,
      organization_id: organizationId,
    }, { onConflict: 'user_id,role,organization_id' })

    // Step 3: Link profile to mentee entity
    await supabase.from('profiles').update({ mentee_id: menteeId }).eq('id', userId)

    // Step 4: Refresh roles, switch to mentee, navigate
    await refreshRoles()
    setActiveRole('mentee')
    setTestMenteeLoading(false)
    navigate('/mentee')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const initials = mentor ? `${mentor.first_name?.[0] || ''}${mentor.last_name?.[0] || ''}` : ''
  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date())
  const pastMeetings = meetings.filter(m => m.status === 'completed' || (m.status !== 'scheduled' ? false : new Date(m.scheduled_at) < new Date()))

  const TABS = [
    { key: 'overview',  label: 'Overview',    icon: null },
    { key: 'mentees',   label: 'My Mentees',  icon: Users },
    { key: 'meetings',  label: 'Meetings',    icon: Calendar },
    { key: 'profile',   label: 'My Profile',  icon: User },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#9ca3af' }}>Loading…</p>
      </div>
    )
  }

  if (!mentorId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb', gap: '1rem' }}>
        <p style={{ color: '#6b7280' }}>Your mentor account is not linked to a profile. Please ask your administrator to link your account.</p>
        <button style={s.signOutBtn} onClick={handleSignOut}><LogOut size={14} /> Sign Out</button>
      </div>
    )
  }

  return (
    <div style={s.wrapper}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>
          {companyLogo
            ? <img src={companyLogo} alt="Logo" style={s.sidebarLogoImg} />
            : <span style={s.sidebarLogoText}>{companyName}</span>
          }
        </div>
        <nav style={s.sidebarNav}>
          {TABS.map(t => (
            <button
              key={t.key}
              style={{ ...s.sidebarNavBtn, ...(tab === t.key ? s.sidebarNavBtnActive : {}) }}
              onClick={() => setTab(t.key)}
            >
              {tab === t.key && <div style={s.activeBar} />}
              {t.icon && <t.icon size={16} strokeWidth={tab === t.key ? 2.2 : 1.8} style={{ opacity: tab === t.key ? 1 : 0.5, flexShrink: 0 }} />}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div style={s.sidebarFooter}>
          <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <RoleSwitcher />
          </div>
          <button style={s.testMenteeBtn} onClick={handleTestMentee} disabled={testMenteeLoading}>
            <FlaskConical size={14} strokeWidth={2} />
            <span>{testMenteeLoading ? 'Setting up…' : testMenteeReady ? 'Switch to Mentee View' : 'Set Up Mentee Account'}</span>
          </button>
          <BugReportButton inline />
          <button style={s.sidebarSignOut} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main style={s.main}>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div>
            <h1 style={s.pageTitle}>Welcome back, {mentor?.first_name}!</h1>
            <p style={s.pageSub}>Here's a summary of your mentoring activity.</p>
            <div style={s.overviewGrid}>
              <div style={s.overviewCard} onClick={() => setTab('mentees')}>
                <div style={{ ...s.overviewIcon, background: '#eef2ff' }}>
                  <Users size={22} color="#6366f1" />
                </div>
                <div style={s.overviewStat}>{mentees.length}</div>
                <div style={s.overviewLabel}>My Mentees</div>
              </div>
              <div style={s.overviewCard} onClick={() => setTab('meetings')}>
                <div style={{ ...s.overviewIcon, background: upcomingMeetings.length > 0 ? '#f0fdfa' : '#f9fafb' }}>
                  <Calendar size={22} color={upcomingMeetings.length > 0 ? '#0d9488' : '#9ca3af'} />
                </div>
                <div style={s.overviewStat}>{upcomingMeetings.length}</div>
                <div style={s.overviewLabel}>Upcoming Meetings</div>
              </div>
              <div style={s.overviewCard} onClick={() => setTab('meetings')}>
                <div style={{ ...s.overviewIcon, background: '#f0fdf4' }}>
                  <CalendarCheck size={22} color="#16a34a" />
                </div>
                <div style={s.overviewStat}>{pastMeetings.length}</div>
                <div style={s.overviewLabel}>Completed Meetings</div>
              </div>
            </div>

            {/* Quick mentee list preview */}
            <div style={s.section}>
              <div style={s.sectionTitle}>My Mentees</div>
              <div style={s.sectionBody}>
                {mentees.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.25rem 0', color: '#9ca3af', fontSize: '0.875rem' }}>
                    No mentees assigned yet.
                  </div>
                ) : (
                  <>
                    {mentees.slice(0, 5).map(mentee => {
                      const sc = getStatusColor(mentee.status, statusOptions.indexOf(mentee.status))
                      const ini = `${mentee.first_name?.[0] || ''}${mentee.last_name?.[0] || ''}`
                      return (
                        <div key={mentee.id} style={s.menteeRow}>
                          <div style={s.menteeAvatar}>
                            {mentee.avatar_url
                              ? <img src={mentee.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              : ini
                            }
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={s.menteeName}>{mentee.first_name} {mentee.last_name}</div>
                            <div style={s.menteeMeta}>{mentee.email}</div>
                          </div>
                          {mentee.status && (
                            <span style={{ ...s.statusPill, backgroundColor: sc.bg, color: sc.color }}>{mentee.status}</span>
                          )}
                          <button
                            style={s.viewAsBtnSmall}
                            onClick={() => navigate(`/mentor/view-mentee/${mentee.id}`)}
                            title={`View as ${mentee.first_name}`}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      )
                    })}
                    {mentees.length > 5 && (
                      <button style={s.viewAllBtn} onClick={() => setTab('mentees')}>
                        View all {mentees.length} mentees →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Upcoming meetings preview */}
            {upcomingMeetings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>Upcoming Meetings</div>
                <div style={s.sectionBody}>
                  {upcomingMeetings.slice(0, 3).map(m => <MeetingItem key={m.id} meeting={m} />)}
                  {upcomingMeetings.length > 3 && (
                    <button style={s.viewAllBtn} onClick={() => setTab('meetings')}>
                      View all meetings →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── My Mentees ── */}
        {tab === 'mentees' && (
          <div>
            <h1 style={s.pageTitle}>My Mentees</h1>
            <p style={s.pageSub}>Mentees currently assigned to you.</p>
            {mentees.length === 0 ? (
              <div style={s.emptyState}>
                <Users size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No mentees assigned yet.</p>
              </div>
            ) : (
              <div style={s.section}>
                <div style={s.sectionTitle}>All Mentees ({mentees.length})</div>
                <div style={s.sectionBody}>
                  {mentees.map(mentee => {
                    const sc = getStatusColor(mentee.status, statusOptions.indexOf(mentee.status))
                    const ini = `${mentee.first_name?.[0] || ''}${mentee.last_name?.[0] || ''}`
                    return (
                      <div key={mentee.id} style={s.menteeRow}>
                        <div style={s.menteeListAvatar}>
                          {mentee.avatar_url
                            ? <img src={mentee.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : ini
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={s.menteeName}>{mentee.first_name} {mentee.last_name}</div>
                          <div style={s.menteeMeta}>{mentee.email}</div>
                        </div>
                        {mentee.status && (
                          <span style={{ ...s.statusPill, backgroundColor: sc.bg, color: sc.color }}>{mentee.status}</span>
                        )}
                        <button
                          style={s.viewAsBtn}
                          onClick={() => navigate(`/mentor/view-mentee/${mentee.id}`)}
                        >
                          <Eye size={13} /> View as Mentee
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Meetings ── */}
        {tab === 'meetings' && (
          <div>
            <h1 style={s.pageTitle}>Meetings</h1>
            <p style={s.pageSub}>Your upcoming and past meetings with mentees.</p>

            {meetings.length === 0 ? (
              <div style={s.emptyState}>
                <Calendar size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No meetings scheduled yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {upcomingMeetings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Upcoming</div>
                    <div style={s.sectionBody}>
                      {[...upcomingMeetings].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).map(m => (
                        <MeetingItem key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                )}
                {pastMeetings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Past</div>
                    <div style={s.sectionBody}>
                      {pastMeetings.map(m => <MeetingItem key={m.id} meeting={m} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── My Profile ── */}
        {tab === 'profile' && mentor && (
          <div>
            <h1 style={s.pageTitle}>My Profile</h1>
            <p style={s.pageSub}>Your mentor account information.</p>
            <div style={s.profileCard}>
              <div style={s.profileAvatarRow}>
                <div style={s.profileAvatar}>{initials}</div>
                <div>
                  <div style={s.profileName}>{mentor.first_name} {mentor.last_name}</div>
                  <div style={s.profileRole}>Mentor</div>
                </div>
              </div>
              <div style={s.profileFields}>
                {mentor.email && (
                  <div style={s.profileField}>
                    <div style={s.profileFieldLabel}>Email</div>
                    <div style={s.profileFieldValue}>{mentor.email}</div>
                  </div>
                )}
                {mentor.phone && (
                  <div style={s.profileField}>
                    <div style={s.profileFieldLabel}>Phone</div>
                    <div style={s.profileFieldValue}>{mentor.phone}</div>
                  </div>
                )}
                <div style={s.profileField}>
                  <div style={s.profileFieldLabel}>Mentees</div>
                  <div style={s.profileFieldValue}>{mentees.length} assigned</div>
                </div>
              </div>
            </div>

            {/* Availability */}
            <AvailabilityEditor mentorId={mentorId} initial={mentor.availability || {}} />
          </div>
        )}

      </main>
    </div>
  )
}

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

function AvailabilityEditor({ mentorId, initial }) {
  const [avail, setAvail] = useState(() => {
    const a = {}
    DAYS.forEach(d => { a[d.key] = initial[d.key] || [] })
    return a
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function addSlot(day) {
    setAvail(a => ({ ...a, [day]: [...a[day], { start: '09:00', end: '17:00' }] }))
    setSaved(false)
  }

  function removeSlot(day, idx) {
    setAvail(a => ({ ...a, [day]: a[day].filter((_, i) => i !== idx) }))
    setSaved(false)
  }

  function updateSlot(day, idx, field, value) {
    setAvail(a => ({
      ...a,
      [day]: a[day].map((slot, i) => i === idx ? { ...slot, [field]: value } : slot),
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    // Filter out empty days
    const clean = {}
    DAYS.forEach(d => { if (avail[d.key].length > 0) clean[d.key] = avail[d.key] })
    await supabase.from('mentors').update({ availability: clean }).eq('id', mentorId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div style={av.card}>
      <div style={av.header}>
        <div>
          <h2 style={av.title}>Available Hours</h2>
          <p style={av.sub}>Set your weekly availability for mentoring sessions.</p>
        </div>
        <button style={av.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Hours'}
        </button>
      </div>
      <div style={av.grid}>
        {DAYS.map(d => (
          <div key={d.key} style={av.dayRow}>
            <div style={av.dayLabel}>{d.label}</div>
            <div style={av.slots}>
              {avail[d.key].length === 0 ? (
                <span style={av.unavailable}>Unavailable</span>
              ) : (
                avail[d.key].map((slot, i) => (
                  <div key={i} style={av.slot}>
                    <input style={av.timeInput} type="time" value={slot.start} onChange={e => updateSlot(d.key, i, 'start', e.target.value)} />
                    <span style={av.timeSep}>to</span>
                    <input style={av.timeInput} type="time" value={slot.end} onChange={e => updateSlot(d.key, i, 'end', e.target.value)} />
                    <button style={av.removeSlotBtn} onClick={() => removeSlot(d.key, i)} title="Remove">&times;</button>
                  </div>
                ))
              )}
              <button style={av.addSlotBtn} onClick={() => addSlot(d.key)}>+ Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const av = {
  card: { marginTop: '1.5rem', backgroundColor: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6' },
  title: { fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '0.15rem' },
  sub: { fontSize: '0.82rem', color: '#9ca3af' },
  saveBtn: { padding: '0.5rem 1.1rem', background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  grid: { padding: '0.5rem 0' },
  dayRow: { display: 'flex', alignItems: 'flex-start', padding: '0.65rem 1.5rem', borderBottom: '1px solid #f9fafb' },
  dayLabel: { width: 100, flexShrink: 0, fontSize: '0.85rem', fontWeight: 600, color: '#374151', paddingTop: '0.35rem' },
  slots: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' },
  slot: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  timeInput: { padding: '0.35rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', color: '#111827', width: 110 },
  timeSep: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 },
  removeSlotBtn: { width: 24, height: 24, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 },
  addSlotBtn: { padding: '0.25rem 0.6rem', background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 6, color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  unavailable: { fontSize: '0.82rem', color: '#d1d5db', fontStyle: 'italic' },
}

const s = {
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
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
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
  testMenteeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.65rem 1.25rem',
    background: 'none',
    border: 'none',
    color: 'rgba(251,191,36,0.85)',
    fontSize: '0.82rem',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.12s',
    outline: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
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
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  overviewCard: { backgroundColor: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'center' },
  overviewIcon: { width: 48, height: 48, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.65rem' },
  overviewStat: { fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.25rem' },
  overviewLabel: { fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 },
  emptyState: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', backgroundColor: '#fff', borderRadius: 10, border: '1px solid #f3f4f6' },
  section: { backgroundColor: '#fff', borderRadius: 10, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '1rem' },
  sectionTitle: { padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '0.75rem 1.25rem' },
  menteeRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' },
  menteeAvatar: { width: 34, height: 34, borderRadius: '50%', background: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden' },
  menteeListAvatar: { width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, overflow: 'hidden' },
  menteeName: { fontWeight: 600, color: '#111827', fontSize: '0.875rem' },
  menteeMeta: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' },
  statusPill: { padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  viewAllBtn: { display: 'block', width: '100%', marginTop: '0.5rem', padding: '0.5rem', background: 'none', border: 'none', color: '#6366f1', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  menteeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' },
  menteeCard: { backgroundColor: '#fff', borderRadius: 10, padding: '1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.2rem' },
  menteeCardAvatar: { width: 52, height: 52, borderRadius: '50%', background: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0, overflow: 'hidden', marginBottom: '0.5rem' },
  menteeCardName: { fontWeight: 700, color: '#111827', fontSize: '0.95rem' },
  menteeCardMeta: { fontSize: '0.78rem', color: '#9ca3af' },
  profileCard: { backgroundColor: '#fff', borderRadius: 10, padding: '1.5rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', maxWidth: 480 },
  profileAvatarRow: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f3f4f6' },
  profileAvatar: { width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 },
  profileName: { fontWeight: 700, color: '#111827', fontSize: '1.1rem' },
  profileRole: { fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' },
  profileFields: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  profileField: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  profileFieldLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  profileFieldValue: { fontSize: '0.9rem', color: '#111827', fontWeight: 500 },
  viewAsBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.65rem', padding: '0.4rem 0.85rem', background: 'none', border: '1.5px solid #c7d2fe', borderRadius: 8, color: '#6366f1', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  viewAsBtnSmall: { width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', cursor: 'pointer', flexShrink: 0, padding: 0 },
}
