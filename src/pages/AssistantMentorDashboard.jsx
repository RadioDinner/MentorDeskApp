import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Users, Calendar, User, LogOut, CalendarCheck, CalendarPlus, HeartHandshake, Eye, BookOpen, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import BugReportButton from '../components/BugReportButton'
import { useRole } from '../context/RoleContext'
import RoleSwitcher from '../components/RoleSwitcher'
import { parseStatuses, getStatusColor } from '../utils/statuses'

function MeetingItem({ meeting }) {
  const dt = new Date(meeting.scheduled_at)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const isCompleted = meeting.status === 'completed'
  const isPast = new Date(meeting.scheduled_at) < new Date()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: isCompleted || isPast ? '#f9fafb' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isCompleted ? <CalendarCheck size={16} color="#9ca3af" /> : isPast ? <Calendar size={16} color="#9ca3af" /> : <CalendarPlus size={16} color="#0d9488" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{meeting.title || 'Meeting'}</div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
          {dateStr} at {timeStr} · {meeting.duration_minutes} min
          {meeting.mentor ? ` · with ${meeting.mentor.first_name} ${meeting.mentor.last_name}` : ''}
        </div>
      </div>
      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 49, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, backgroundColor: isCompleted ? '#f0fdf4' : '#f0fdfa', color: isCompleted ? '#16a34a' : '#0d9488' }}>
        {isCompleted ? 'Completed' : 'Scheduled'}
      </span>
    </div>
  )
}

export default function AssistantMentorDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [partnerId, setPartnerId] = useState(null)
  const [partner, setPartner] = useState(null)
  const [mentee, setMentee] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [offerings, setOfferings] = useState([])
  const [lessonProgress, setLessonProgress] = useState([])
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyName, setCompanyName] = useState('MentorDesk')
  const [statusOptions, setStatusOptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  const { activeEntityId, organizationId } = useRole()

  async function loadAll() {
    setLoading(true)

    const settingsRes = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
    if (settingsRes.data) {
      const get = k => settingsRes.data.find(s => s.key === k)?.value || ''
      setCompanyLogo(get('company_logo_horizontal') || get('company_logo'))
      setCompanyName(get('company_name') || 'MentorDesk')
      setStatusOptions(parseStatuses(settingsRes.data.find(s => s.key === 'mentee_statuses')?.value))
    }

    const ppId = activeEntityId
    if (!ppId) { setLoading(false); return }
    setPartnerId(ppId)

    const { data: partnerData } = await supabase
      .from('assistant_mentors')
      .select('id, first_name, last_name, email, phone, avatar_url, mentee_id, start_date')
      .eq('id', ppId)
      .single()

    if (!partnerData) { setLoading(false); return }
    setPartner(partnerData)

    // Load assigned mentee data if one is assigned
    if (partnerData.mentee_id) {
      const [menteeRes, meetingsRes, offeringsRes, lessonsRes] = await Promise.all([
        supabase.from('mentees')
          .select('id, first_name, last_name, email, phone, status, avatar_url, signup_date, address_city, address_state')
          .eq('id', partnerData.mentee_id)
          .single(),
        supabase.from('meetings')
          .select('id, scheduled_at, duration_minutes, title, status, mentor:mentors(id, first_name, last_name)')
          .eq('mentee_id', partnerData.mentee_id)
          .order('scheduled_at', { ascending: false }),
        supabase.from('mentee_offerings')
          .select('id, assigned_date, status, offering:offerings(id, name, description, cost, billing_type, offering_type)')
          .eq('mentee_id', partnerData.mentee_id)
          .eq('status', 'active'),
        supabase.from('mentee_lesson_progress')
          .select('id, unlocked_at, completed_at, lesson:lessons(id, title, order_index, course_id)')
          .eq('mentee_id', partnerData.mentee_id)
          .order('unlocked_at', { ascending: true }),
      ])

      if (menteeRes.data) setMentee(menteeRes.data)
      if (meetingsRes.data) setMeetings(meetingsRes.data)
      if (offeringsRes.data) setOfferings(offeringsRes.data)
      if (lessonsRes.data) setLessonProgress(lessonsRes.data)
    }

    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const initials = partner ? `${partner.first_name?.[0] || ''}${partner.last_name?.[0] || ''}` : ''
  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date())
  const pastMeetings = meetings.filter(m => m.status === 'completed' || new Date(m.scheduled_at) < new Date())
  const completedLessons = lessonProgress.filter(lp => lp.completed_at).length
  const totalLessons = lessonProgress.length

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'mentee',   label: 'My Mentee',  icon: Users },
    { key: 'profile',  label: 'My Profile', icon: User },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#9ca3af' }}>Loading…</p>
      </div>
    )
  }

  if (!partnerId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb', gap: '1rem' }}>
        <p style={{ color: '#6b7280' }}>Your assistant mentor account is not linked to a profile. Please ask your administrator to link your account.</p>
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
            <h1 style={s.pageTitle}>Welcome back, {partner?.first_name}!</h1>
            <p style={s.pageSub}>Here's a summary of your assigned mentee's activity.</p>

            {!mentee ? (
              <div style={s.emptyState}>
                <HeartHandshake size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No mentee assigned yet. Ask your administrator to assign a mentee to you.</p>
              </div>
            ) : (
              <>
                <div style={s.overviewGrid}>
                  <div style={s.overviewCard} onClick={() => setTab('mentee')}>
                    <div style={{ ...s.overviewIcon, background: '#eef2ff' }}>
                      <Users size={22} color="#6366f1" />
                    </div>
                    <div style={s.overviewStat}>1</div>
                    <div style={s.overviewLabel}>Assigned Mentee</div>
                  </div>
                  <div style={s.overviewCard}>
                    <div style={{ ...s.overviewIcon, background: '#f0fdfa' }}>
                      <BookOpen size={22} color="#0d9488" />
                    </div>
                    <div style={s.overviewStat}>{offerings.length}</div>
                    <div style={s.overviewLabel}>Active Offerings</div>
                  </div>
                  <div style={s.overviewCard}>
                    <div style={{ ...s.overviewIcon, background: upcomingMeetings.length > 0 ? '#f0fdfa' : '#f9fafb' }}>
                      <Calendar size={22} color={upcomingMeetings.length > 0 ? '#0d9488' : '#9ca3af'} />
                    </div>
                    <div style={s.overviewStat}>{upcomingMeetings.length}</div>
                    <div style={s.overviewLabel}>Upcoming Meetings</div>
                  </div>
                  <div style={s.overviewCard}>
                    <div style={{ ...s.overviewIcon, background: '#f0fdf4' }}>
                      <CheckCircle size={22} color="#16a34a" />
                    </div>
                    <div style={s.overviewStat}>{completedLessons}/{totalLessons}</div>
                    <div style={s.overviewLabel}>Lessons Completed</div>
                  </div>
                </div>

                {/* Mentee quick card */}
                <div style={s.section}>
                  <div style={s.sectionTitle}>Assigned Mentee</div>
                  <div style={s.sectionBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={s.menteeCardAvatar}>
                        {mentee.avatar_url
                          ? <img src={mentee.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                          : `${mentee.first_name?.[0] || ''}${mentee.last_name?.[0] || ''}`
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: '1rem' }}>{mentee.first_name} {mentee.last_name}</div>
                        {mentee.email && <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>{mentee.email}</div>}
                        {(mentee.address_city || mentee.address_state) && (
                          <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                            {[mentee.address_city, mentee.address_state].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                      {mentee.status && (() => {
                        const sc = getStatusColor(mentee.status, statusOptions.indexOf(mentee.status))
                        return <span style={{ ...s.statusPill, backgroundColor: sc.bg, color: sc.color }}>{mentee.status}</span>
                      })()}
                      <button style={s.viewAsBtn} onClick={() => navigate(`/assistant-mentor/view-mentee/${mentee.id}`)}>
                        <Eye size={13} /> View as Mentee
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upcoming meetings */}
                {upcomingMeetings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Upcoming Meetings</div>
                    <div style={s.sectionBody}>
                      {upcomingMeetings.slice(0, 5).map(m => <MeetingItem key={m.id} meeting={m} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── My Mentee ── */}
        {tab === 'mentee' && (
          <div>
            <h1 style={s.pageTitle}>My Mentee</h1>
            <p style={s.pageSub}>Details about your assigned mentee.</p>

            {!mentee ? (
              <div style={s.emptyState}>
                <Users size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No mentee assigned yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Profile card */}
                <div style={s.section}>
                  <div style={s.sectionTitle}>Profile</div>
                  <div style={s.sectionBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={s.menteeCardAvatar}>
                        {mentee.avatar_url
                          ? <img src={mentee.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                          : `${mentee.first_name?.[0] || ''}${mentee.last_name?.[0] || ''}`
                        }
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: '1.1rem' }}>{mentee.first_name} {mentee.last_name}</div>
                        {mentee.status && (() => {
                          const sc = getStatusColor(mentee.status, statusOptions.indexOf(mentee.status))
                          return <span style={{ ...s.statusPill, backgroundColor: sc.bg, color: sc.color, marginTop: '0.25rem', display: 'inline-block' }}>{mentee.status}</span>
                        })()}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      {mentee.email && <div><div style={s.fieldLabel}>Email</div><div style={s.fieldValue}>{mentee.email}</div></div>}
                      {mentee.phone && <div><div style={s.fieldLabel}>Phone</div><div style={s.fieldValue}>{mentee.phone}</div></div>}
                      {mentee.signup_date && <div><div style={s.fieldLabel}>Joined</div><div style={s.fieldValue}>{new Date(mentee.signup_date).toLocaleDateString()}</div></div>}
                      {(mentee.address_city || mentee.address_state) && (
                        <div><div style={s.fieldLabel}>Location</div><div style={s.fieldValue}>{[mentee.address_city, mentee.address_state].filter(Boolean).join(', ')}</div></div>
                      )}
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                      <button style={s.viewAsBtn} onClick={() => navigate(`/assistant-mentor/view-mentee/${mentee.id}`)}>
                        <Eye size={13} /> View Full Dashboard as Mentee
                      </button>
                    </div>
                  </div>
                </div>

                {/* Offerings */}
                {offerings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Active Offerings ({offerings.length})</div>
                    <div style={s.sectionBody}>
                      {offerings.map(ao => (
                        <div key={ao.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb', gap: '0.75rem' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{ao.offering?.name}</div>
                            {ao.offering?.description && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{ao.offering.description}</div>}
                          </div>
                          <span style={{ ...s.typePill, backgroundColor: ao.offering?.offering_type === 'arrangement' ? '#f0fdfa' : '#eef2ff', color: ao.offering?.offering_type === 'arrangement' ? '#0d9488' : '#6366f1' }}>
                            {ao.offering?.offering_type === 'arrangement' ? 'Arrangement' : 'Course'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lesson progress */}
                {lessonProgress.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Lesson Progress ({completedLessons}/{totalLessons})</div>
                    <div style={s.sectionBody}>
                      <div style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 49, overflow: 'hidden', marginBottom: '0.75rem' }}>
                        <div style={{ height: '100%', borderRadius: 49, backgroundColor: completedLessons === totalLessons && totalLessons > 0 ? '#16a34a' : '#6366f1', width: `${totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0}%`, transition: 'width 0.3s' }} />
                      </div>
                      {lessonProgress.map(lp => (
                        <div key={lp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid #f9fafb' }}>
                          {lp.completed_at ? <CheckCircle size={16} color="#16a34a" /> : <Clock size={16} color="#d1d5db" />}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: lp.completed_at ? '#111827' : '#9ca3af' }}>{lp.lesson?.title}</div>
                            {lp.completed_at && <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Completed {new Date(lp.completed_at).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meetings */}
                <div style={s.section}>
                  <div style={s.sectionTitle}>Meetings ({meetings.length})</div>
                  <div style={s.sectionBody}>
                    {meetings.length === 0 ? (
                      <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>No meetings scheduled yet.</p>
                    ) : (
                      <>
                        {upcomingMeetings.length > 0 && upcomingMeetings.map(m => <MeetingItem key={m.id} meeting={m} />)}
                        {pastMeetings.length > 0 && pastMeetings.slice(0, 10).map(m => <MeetingItem key={m.id} meeting={m} />)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── My Profile ── */}
        {tab === 'profile' && partner && (
          <div>
            <h1 style={s.pageTitle}>My Profile</h1>
            <p style={s.pageSub}>Your assistant mentor account information.</p>
            <div style={s.profileCard}>
              <div style={s.profileAvatarRow}>
                <div style={s.profileAvatar}>
                  {partner.avatar_url
                    ? <img src={partner.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : initials
                  }
                </div>
                <div>
                  <div style={s.profileName}>{partner.first_name} {partner.last_name}</div>
                  <div style={s.profileRole}>Assistant Mentor</div>
                </div>
              </div>
              <div style={s.profileFields}>
                {partner.email && (
                  <div style={s.profileField}>
                    <div style={s.profileFieldLabel}>Email</div>
                    <div style={s.profileFieldValue}>{partner.email}</div>
                  </div>
                )}
                {partner.phone && (
                  <div style={s.profileField}>
                    <div style={s.profileFieldLabel}>Phone</div>
                    <div style={s.profileFieldValue}>{partner.phone}</div>
                  </div>
                )}
                {partner.start_date && (
                  <div style={s.profileField}>
                    <div style={s.profileFieldLabel}>Start Date</div>
                    <div style={s.profileFieldValue}>{new Date(partner.start_date).toLocaleDateString()}</div>
                  </div>
                )}
                <div style={s.profileField}>
                  <div style={s.profileFieldLabel}>Assigned Mentee</div>
                  <div style={s.profileFieldValue}>{mentee ? `${mentee.first_name} ${mentee.last_name}` : 'None assigned'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
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
  signOutBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.8rem', color: '#6b7280', fontWeight: 500, cursor: 'pointer' },
  main: { marginLeft: 'var(--sidebar-width, 240px)', flex: 1, maxWidth: 960, padding: '2rem 1.5rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.25rem' },
  pageSub: { color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' },
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  overviewCard: { backgroundColor: '#fff', borderRadius: 6, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'center' },
  overviewIcon: { width: 48, height: 48, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.65rem' },
  overviewStat: { fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.25rem' },
  overviewLabel: { fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 },
  emptyState: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', backgroundColor: '#fff', borderRadius: 6, border: '1px solid #f3f4f6' },
  section: { backgroundColor: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '1rem' },
  sectionTitle: { padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '0.85rem 1.25rem' },
  menteeCardAvatar: { width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0, overflow: 'hidden' },
  statusPill: { padding: '0.2rem 0.6rem', borderRadius: 49, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  typePill: { display: 'inline-flex', padding: '0.2rem 0.6rem', borderRadius: 49, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  viewAsBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', background: 'none', border: '1.5px solid #c7d2fe', borderRadius: 6, color: '#6366f1', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  fieldLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.1rem' },
  fieldValue: { fontSize: '0.9rem', color: '#111827', fontWeight: 500 },
  profileCard: { backgroundColor: '#fff', borderRadius: 6, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', maxWidth: 480 },
  profileAvatarRow: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f3f4f6' },
  profileAvatar: { width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0, overflow: 'hidden' },
  profileName: { fontWeight: 700, color: '#111827', fontSize: '1.1rem' },
  profileRole: { fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' },
  profileFields: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  profileField: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  profileFieldLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  profileFieldValue: { fontSize: '0.9rem', color: '#111827', fontWeight: 500 },
}
