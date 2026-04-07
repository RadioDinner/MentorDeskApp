import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { ArrowLeft, BookOpen, Calendar, CalendarCheck, CalendarPlus, Clock, CheckCircle, AlertCircle, Clipboard, Eye, CreditCard, User } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import InvoiceActions from '../components/InvoiceActions'

function MeetingItem({ meeting, past }) {
  const dt = new Date(meeting.scheduled_at)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const isCompleted = meeting.status === 'completed'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ width: 36, height: 36, borderRadius: 7, backgroundColor: past || isCompleted ? '#f9fafb' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isCompleted ? <CalendarCheck size={16} color="#9ca3af" /> : past ? <Calendar size={16} color="#9ca3af" /> : <CalendarPlus size={16} color="#0d9488" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{meeting.title || 'Meeting'}</div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
          {dateStr} at {timeStr} · {meeting.duration_minutes} min
          {meeting.mentor ? ` · with ${meeting.mentor.first_name} ${meeting.mentor.last_name}` : ''}
        </div>
      </div>
      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 79, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, backgroundColor: isCompleted ? '#f0fdf4' : '#f0fdfa', color: isCompleted ? '#16a34a' : '#0d9488' }}>
        {isCompleted ? 'Completed' : 'Scheduled'}
      </span>
    </div>
  )
}

export default function MenteePreview() {
  const { menteeId } = useParams()
  const navigate = useNavigate()
  const { organizationId } = useRole()
  const [tab, setTab] = useState('overview')
  const [mentee, setMentee] = useState(null)
  const [assignedOfferings, setAssignedOfferings] = useState([])
  const [lessonProgress, setLessonProgress] = useState([])
  const [meetings, setMeetings] = useState([])
  const [creditBalances, setCreditBalances] = useState({})
  const [myWhiteboards, setMyWhiteboards] = useState([])
  const [enrolledCourses, setEnrolledCourses] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyName, setCompanyName] = useState('MentorDesk')

  useEffect(() => {
    if (menteeId) loadMenteeData(menteeId)
  }, [menteeId])

  async function loadMenteeData(mid) {
    setLoading(true)

    const [settingsRes, menteeRes, offeringsRes, lessonsRes, wbRes, meetingsRes, ledgerRes, invoicesRes] = await Promise.all([
      supabase.from('settings').select('key, value').eq('organization_id', organizationId),
      supabase.from('mentees').select('*').eq('id', mid).single(),
      supabase.from('mentee_offerings')
        .select('id, assigned_date, status, offering:offerings(id, name, description, cost, billing_type, duration_value, duration_unit, offering_type)')
        .eq('mentee_id', mid).eq('status', 'active'),
      supabase.from('mentee_lesson_progress')
        .select('id, unlocked_at, completed_at, lesson:lessons(id, title, description, order_index, course_id)')
        .eq('mentee_id', mid).order('unlocked_at', { ascending: true }),
      supabase.from('mentee_whiteboards')
        .select('id, issued_at, completed_at, mentee_notes, whiteboard:lesson_whiteboards(id, title, description), lesson:lessons(id, title)')
        .eq('mentee_id', mid).order('issued_at', { ascending: false }),
      supabase.from('meetings')
        .select('id, scheduled_at, duration_minutes, title, status, mentor:mentors(id, first_name, last_name)')
        .eq('mentee_id', mid).order('scheduled_at', { ascending: false }),
      supabase.from('arrangement_credit_ledger')
        .select('mentee_offering_id, amount').eq('mentee_id', mid),
      supabase.from('invoices')
        .select('*, offering:offerings(name)').eq('mentee_id', mid)
        .order('due_date', { ascending: false }),
    ])

    if (settingsRes.data) {
      const get = k => settingsRes.data.find(s => s.key === k)?.value || ''
      setCompanyLogo(get('company_logo'))
      setCompanyName(get('company_name') || 'MentorDesk')
    }

    if (menteeRes.data) setMentee(menteeRes.data)
    if (offeringsRes.data) {
      setAssignedOfferings(offeringsRes.data)
      const offeringIds = offeringsRes.data.map(ao => ao.offering?.id).filter(Boolean)
      if (offeringIds.length > 0) {
        const { data: coursesData } = await supabase.from('courses')
          .select('id, offering_id, delivery_mode, schedule_interval, schedule_unit')
          .in('offering_id', offeringIds)
        setEnrolledCourses(coursesData || [])
      }
    }
    if (lessonsRes.data) setLessonProgress(lessonsRes.data)
    if (wbRes.data) setMyWhiteboards(wbRes.data)
    if (meetingsRes.data) setMeetings(meetingsRes.data)
    if (invoicesRes.data) {
      const today = new Date().toISOString().split('T')[0]
      setInvoices(invoicesRes.data.map(i =>
        i.status === 'pending' && i.due_date < today ? { ...i, status: 'overdue' } : i
      ))
    }
    if (ledgerRes.data) {
      const bal = {}
      ledgerRes.data.forEach(r => { bal[r.mentee_offering_id] = (bal[r.mentee_offering_id] || 0) + r.amount })
      setCreditBalances(bal)
    }

    setLoading(false)
  }

  async function refreshInvoices() {
    const { data } = await supabase.from('invoices')
      .select('*, offering:offerings(name)').eq('mentee_id', menteeId)
      .order('due_date', { ascending: false })
    if (data) {
      const today = new Date().toISOString().split('T')[0]
      setInvoices(data.map(i => i.status === 'pending' && i.due_date < today ? { ...i, status: 'overdue' } : i))
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#9ca3af' }}>Loading mentee view…</p>
      </div>
    )
  }

  if (!mentee) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f9fafb', gap: '1rem' }}>
        <p style={{ color: '#6b7280' }}>Mentee not found.</p>
        <button style={s.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back to Dashboard</button>
      </div>
    )
  }

  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date())
  const pastMeetings = meetings.filter(m => m.status === 'completed' || new Date(m.scheduled_at) < new Date())
  const outstandingInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'overdue')

  const completedLessons = lessonProgress.filter(lp => lp.completed_at).length
  const totalLessons = lessonProgress.length

  const TABS = [
    { key: 'overview',     label: 'Overview',     icon: null },
    { key: 'courses',      label: 'My Courses',   icon: BookOpen },
    { key: 'meetings',     label: 'Meetings',     icon: Calendar },
    { key: 'whiteboards',  label: 'Whiteboards',  icon: Clipboard },
    { key: 'billing',      label: 'Billing',      icon: CreditCard },
  ]

  return (
    <div style={s.wrapper}>
      {/* Sidebar — matches MenteeDashboard */}
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
          {/* Preview indicator */}
          <div style={s.previewIndicator}>
            <Eye size={14} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>Preview Mode</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>Viewing as {mentee.first_name}</div>
            </div>
          </div>
          <button style={s.sidebarBackBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={14} strokeWidth={2} />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </aside>

      <main style={s.main}>
        {/* Preview banner */}
        <div style={s.previewBanner}>
          <Eye size={15} />
          <span>
            Viewing as <strong>{mentee.first_name} {mentee.last_name}</strong> — This is a read-only preview of what this mentee sees.
          </span>
          <button style={s.exitBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={13} /> Back
          </button>
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div>
            <h1 style={s.pageTitle}>Welcome back, {mentee.first_name}!</h1>
            <p style={s.pageSub}>Here's a summary of your program.</p>

            {outstandingInvoices.length > 0 && (
              <div style={s.alertBanner}>
                <AlertCircle size={16} />
                <span>{outstandingInvoices.length} outstanding invoice{outstandingInvoices.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            <div style={s.overviewGrid}>
              <div style={s.overviewCard} onClick={() => setTab('courses')}>
                <div style={{ ...s.overviewIcon, background: '#eef2ff' }}>
                  <BookOpen size={22} color="#6366f1" />
                </div>
                <div style={s.overviewStat}>{assignedOfferings.length}</div>
                <div style={s.overviewLabel}>Active Courses</div>
              </div>
              <div style={s.overviewCard} onClick={() => setTab('billing')}>
                <div style={{ ...s.overviewIcon, background: outstandingInvoices.length > 0 ? '#fef2f2' : '#f0fdf4' }}>
                  <AlertCircle size={22} color={outstandingInvoices.length > 0 ? '#dc2626' : '#16a34a'} />
                </div>
                <div style={s.overviewStat}>{outstandingInvoices.length}</div>
                <div style={s.overviewLabel}>Outstanding Invoices</div>
              </div>
              <div style={s.overviewCard} onClick={() => setTab('meetings')}>
                <div style={{ ...s.overviewIcon, background: '#f0fdfa' }}>
                  <Calendar size={22} color="#0d9488" />
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

            {/* Enrolled offerings preview */}
            {assignedOfferings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>Enrolled Offerings</div>
                <div style={s.sectionBody}>
                  {assignedOfferings.map(ao => (
                    <div key={ao.id} style={s.offeringRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>{ao.offering?.name}</div>
                        {ao.offering?.description && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>{ao.offering.description}</div>}
                      </div>
                      <span style={{ ...s.pill, backgroundColor: ao.offering?.offering_type === 'arrangement' ? '#f0fdfa' : '#eef2ff', color: ao.offering?.offering_type === 'arrangement' ? '#0d9488' : '#6366f1' }}>
                        {ao.offering?.offering_type === 'arrangement' ? 'Arrangement' : 'Course'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming meetings preview */}
            {upcomingMeetings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>Upcoming Meetings</div>
                <div style={s.sectionBody}>
                  {upcomingMeetings.slice(0, 5).map(m => <MeetingItem key={m.id} meeting={m} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Courses ── */}
        {tab === 'courses' && (
          <div>
            <h1 style={s.pageTitle}>My Courses</h1>
            <p style={s.pageSub}>{mentee.first_name}'s enrolled offerings and lesson progress.</p>

            {assignedOfferings.length === 0 ? (
              <div style={s.emptyState}>
                <BookOpen size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No offerings assigned.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {assignedOfferings.map(ao => {
                  const off = ao.offering
                  const isArr = off?.offering_type === 'arrangement'
                  const credits = creditBalances[ao.id]
                  return (
                    <div key={ao.id} style={s.section}>
                      <div style={s.sectionTitle}>
                        {off?.name}
                        <span style={{ ...s.pill, marginLeft: '0.5rem', backgroundColor: isArr ? '#f0fdfa' : '#eef2ff', color: isArr ? '#0d9488' : '#6366f1' }}>
                          {isArr ? 'Arrangement' : 'Course'}
                        </span>
                      </div>
                      <div style={s.sectionBody}>
                        {off?.description && <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.75rem' }}>{off.description}</p>}
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#6b7280' }}>
                          {off?.cost != null && <span>Cost: <strong>${parseFloat(off.cost).toFixed(2)}</strong>{off.billing_type === 'recurring' ? '/mo' : ''}</span>}
                          {isArr && credits != null && <span>Credits remaining: <strong>{credits}</strong></span>}
                          {!isArr && off?.duration_value && <span>Duration: <strong>{off.duration_value} {off.duration_unit}</strong></span>}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Lesson progress */}
                {lessonProgress.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Lesson Progress ({completedLessons}/{totalLessons})</div>
                    <div style={s.sectionBody}>
                      <div style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: '0.75rem' }}>
                        <div style={{ height: '100%', borderRadius: 99, backgroundColor: completedLessons === totalLessons ? '#16a34a' : '#6366f1', width: `${totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0}%`, transition: 'width 0.3s' }} />
                      </div>
                      {lessonProgress.map(lp => (
                        <div key={lp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb' }}>
                          {lp.completed_at
                            ? <CheckCircle size={16} color="#16a34a" />
                            : <Clock size={16} color="#d1d5db" />
                          }
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: lp.completed_at ? '#111827' : '#9ca3af' }}>{lp.lesson?.title}</div>
                            {lp.completed_at && <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Completed {new Date(lp.completed_at).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Meetings ── */}
        {tab === 'meetings' && (
          <div>
            <h1 style={s.pageTitle}>Meetings</h1>
            <p style={s.pageSub}>{mentee.first_name}'s scheduled and completed meetings.</p>

            {meetings.length === 0 ? (
              <div style={s.emptyState}>
                <Calendar size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No meetings yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {upcomingMeetings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Upcoming ({upcomingMeetings.length})</div>
                    <div style={s.sectionBody}>
                      {[...upcomingMeetings].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).map(m => (
                        <MeetingItem key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                )}
                {pastMeetings.length > 0 && (
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Past ({pastMeetings.length})</div>
                    <div style={s.sectionBody}>
                      {pastMeetings.slice(0, 20).map(m => <MeetingItem key={m.id} meeting={m} past />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Whiteboards ── */}
        {tab === 'whiteboards' && (
          <div>
            <h1 style={s.pageTitle}>Whiteboards</h1>
            <p style={s.pageSub}>{mentee.first_name}'s issued whiteboard exercises.</p>

            {myWhiteboards.length === 0 ? (
              <div style={s.emptyState}>
                <Clipboard size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No whiteboards issued yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myWhiteboards.map(wb => (
                  <div key={wb.id} style={s.section}>
                    <div style={s.sectionBody}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem' }}>{wb.whiteboard?.title || 'Whiteboard'}</div>
                          {wb.lesson?.title && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>Lesson: {wb.lesson.title}</div>}
                        </div>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, backgroundColor: wb.completed_at ? '#f0fdf4' : '#fffbeb', color: wb.completed_at ? '#16a34a' : '#d97706' }}>
                          {wb.completed_at ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      {wb.whiteboard?.description && <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0.5rem 0 0' }}>{wb.whiteboard.description}</p>}
                      {wb.mentee_notes && (
                        <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 9, border: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Mentee Notes</div>
                          <div style={{ fontSize: '0.85rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{wb.mentee_notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Billing ── */}
        {tab === 'billing' && (
          <div>
            <h1 style={s.pageTitle}>Billing</h1>
            <p style={s.pageSub}>{mentee.first_name}'s invoice history.</p>

            {invoices.length === 0 ? (
              <div style={s.emptyState}>
                <AlertCircle size={36} color="#d1d5db" strokeWidth={1.5} />
                <p>No invoices yet.</p>
              </div>
            ) : (
              <div style={s.section}>
                <div style={s.sectionTitle}>Invoices ({invoices.length})</div>
                <div style={s.sectionBody}>
                  {invoices.map(inv => {
                    const stStyle = inv.status === 'paid' ? { bg: '#f0fdf4', color: '#16a34a' }
                      : inv.status === 'overdue' ? { bg: '#fef2f2', color: '#dc2626' }
                      : inv.status === 'cancelled' ? { bg: '#f1f5f9', color: '#64748b' }
                      : { bg: '#fffbeb', color: '#d97706' }
                    return (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #f9fafb', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.85rem' }}>{inv.description || inv.offering?.name || 'Invoice'}</div>
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Due {new Date(inv.due_date).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: '#111827' }}>${parseFloat(inv.amount || 0).toFixed(2)}</span>
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, backgroundColor: stStyle.bg, color: stStyle.color }}>
                            {inv.status}
                          </span>
                          <InvoiceActions invoice={inv} onUpdate={refreshInvoices} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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
  previewIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    color: '#fbbf24',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sidebarBackBtn: {
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
    outline: 'none',
  },
  main: { marginLeft: 'var(--sidebar-width, 240px)', flex: 1, maxWidth: 960, padding: '2rem 1.5rem' },
  previewBanner: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: '0.82rem', fontWeight: 500, flexWrap: 'wrap', marginBottom: '1.25rem' },
  exitBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto', padding: '0.3rem 0.7rem', backgroundColor: '#fff', border: '1px solid #fde68a', borderRadius: 7, color: '#92400e', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  backBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.85rem', color: '#374151', fontWeight: 600, cursor: 'pointer' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.25rem' },
  pageSub: { color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' },
  alertBanner: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1rem' },
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' },
  overviewCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1.25rem', boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'center' },
  overviewIcon: { width: 48, height: 48, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.65rem' },
  overviewStat: { fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.25rem' },
  overviewLabel: { fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 },
  section: { backgroundColor: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-sm)', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '1rem' },
  sectionTitle: { display: 'flex', alignItems: 'center', padding: '0.65rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionBody: { padding: '1rem 1.25rem' },
  offeringRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb', gap: '0.75rem' },
  pill: { display: 'inline-flex', padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '3rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #f3f4f6' },
}
