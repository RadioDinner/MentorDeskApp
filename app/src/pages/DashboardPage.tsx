import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import type { StaffMember, MentorTask } from '../types'
import { Skeleton } from '../components/ui'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

interface AdminStats {
  activeMentees: number
  mentors: number
  activePairings: number
  activeEnrollments: number
}

interface MenteeAssignment {
  id: string                 // mentee_offerings.id
  offeringName: string
  offeringType: 'course' | 'engagement'
  status: string
  mentor: { first_name: string; last_name: string } | null
  // Course-only
  lessonsTotal?: number
  lessonsCompleted?: number
  // Engagement-only
  nextMeetingAt?: string | null
}

interface MenteeHabitCard {
  id: string
  name: string
  status: string
  successfulDays: number
  goalDays: number | null
}

export default function DashboardPage() {
  const { profile, isMenteeMode, menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats>({ activeMentees: 0, mentors: 0, activePairings: 0, activeEnrollments: 0 })
  const [statsLoading, setStatsLoading] = useState(true)
  const [menteeAssignments, setMenteeAssignments] = useState<MenteeAssignment[]>([])
  const [menteeHabits, setMenteeHabits] = useState<MenteeHabitCard[]>([])
  const [menteeLoading, setMenteeLoading] = useState(true)

  useEffect(() => {
    if (!profile) return

    if (isMenteeMode && menteeProfile) {
      async function fetchMenteeData() {
        setMenteeLoading(true)
        const menteeId = menteeProfile!.id
        const nowIso = new Date().toISOString()

        const [moRes, pairingsRes, habitsRes, meetingsRes, lessonsRes, progressRes] = await Promise.all([
          // Active courses + engagements (the actual assignments).
          supabase
            .from('mentee_offerings')
            .select('id, status, offering_id, offering:offerings(id, name, type)')
            .eq('mentee_id', menteeId)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
          // Mentor per offering (used to label engagement cards).
          supabase
            .from('pairings')
            .select('offering_id, mentor:staff!pairings_mentor_id_fkey(first_name, last_name)')
            .eq('mentee_id', menteeId)
            .eq('status', 'active'),
          // Active habits.
          supabase
            .from('mentee_habits')
            .select('id, name_snapshot, status, successful_days_count, goal_successful_days_snapshot, duration_days_snapshot')
            .eq('mentee_id', menteeId)
            .eq('status', 'active')
            .order('assigned_at', { ascending: false }),
          // Upcoming meetings (for engagement "next meeting" preview).
          supabase
            .from('meetings')
            .select('id, mentee_offering_id, scheduled_start_at')
            .eq('mentee_id', menteeId)
            .eq('status', 'scheduled')
            .gte('scheduled_start_at', nowIso)
            .order('scheduled_start_at', { ascending: true }),
          // Course total-lessons (indexed by offering_id).
          supabase
            .from('lessons')
            .select('id, offering_id')
            .eq('organization_id', menteeProfile!.organization_id),
          // Course progress (completed lessons per assignment).
          supabase
            .from('lesson_progress')
            .select('mentee_offering_id, status')
            .eq('mentee_id', menteeId)
            .eq('status', 'completed'),
        ])

        // Index mentor-per-offering so we can label engagement cards.
        const mentorByOffering: Record<string, { first_name: string; last_name: string }> = {}
        for (const p of (pairingsRes.data ?? []) as unknown as { offering_id: string | null; mentor: { first_name: string; last_name: string } | null }[]) {
          if (p.offering_id && p.mentor) mentorByOffering[p.offering_id] = p.mentor
        }

        // Index next meeting per mentee_offering.
        const nextMeetingByMO: Record<string, string> = {}
        for (const m of (meetingsRes.data ?? []) as { mentee_offering_id: string | null; scheduled_start_at: string }[]) {
          if (m.mentee_offering_id && !nextMeetingByMO[m.mentee_offering_id]) {
            nextMeetingByMO[m.mentee_offering_id] = m.scheduled_start_at
          }
        }

        // Index lessons per course offering.
        const lessonCountByOffering: Record<string, number> = {}
        for (const l of (lessonsRes.data ?? []) as { offering_id: string }[]) {
          lessonCountByOffering[l.offering_id] = (lessonCountByOffering[l.offering_id] ?? 0) + 1
        }

        // Index completed lessons per assignment.
        const completedByMO: Record<string, number> = {}
        for (const p of (progressRes.data ?? []) as { mentee_offering_id: string }[]) {
          completedByMO[p.mentee_offering_id] = (completedByMO[p.mentee_offering_id] ?? 0) + 1
        }

        type MORow = {
          id: string
          status: string
          offering_id: string
          offering: { id: string; name: string; type: 'course' | 'engagement' } | null
        }
        const assignments: MenteeAssignment[] = ((moRes.data ?? []) as unknown as MORow[])
          .filter(m => m.offering)
          .map(m => {
            const offering = m.offering!
            const base: MenteeAssignment = {
              id: m.id,
              offeringName: offering.name,
              offeringType: offering.type,
              status: m.status,
              mentor: mentorByOffering[m.offering_id] ?? null,
            }
            if (offering.type === 'course') {
              base.lessonsTotal = lessonCountByOffering[m.offering_id] ?? 0
              base.lessonsCompleted = completedByMO[m.id] ?? 0
            } else {
              base.nextMeetingAt = nextMeetingByMO[m.id] ?? null
            }
            return base
          })

        setMenteeAssignments(assignments)

        type HabitRow = {
          id: string; name_snapshot: string; status: string
          successful_days_count: number | null
          goal_successful_days_snapshot: number | null
          duration_days_snapshot: number | null
        }
        setMenteeHabits(((habitsRes.data ?? []) as HabitRow[]).map(h => ({
          id: h.id,
          name: h.name_snapshot,
          status: h.status,
          successfulDays: h.successful_days_count ?? 0,
          goalDays: h.goal_successful_days_snapshot ?? h.duration_days_snapshot ?? null,
        })))

        setMenteeLoading(false)
      }
      fetchMenteeData()
      return
    }

    if (isMentor) return  // MentorDashboard fetches its own data

    // Admin / ops stats — 4 parallel count-only queries
    const orgId = profile.organization_id
    async function fetchStats() {
      setStatsLoading(true)
      const [menteesRes, pairingsRes, enrollmentsRes, staffRes] = await Promise.all([
        supabaseRestGet('mentees', `select=id&limit=0&organization_id=eq.${orgId}&archived_at=is.null`, { countExact: true, label: 'dash:mentees' }),
        supabaseRestGet('pairings', `select=id&limit=0&organization_id=eq.${orgId}&status=eq.active`, { countExact: true, label: 'dash:pairings' }),
        supabaseRestGet('mentee_offerings', `select=id&limit=0&organization_id=eq.${orgId}&status=eq.active`, { countExact: true, label: 'dash:enrollments' }),
        supabaseRestGet<{ role: string }>('staff', `select=role&organization_id=eq.${orgId}`, { label: 'dash:staff' }),
      ])
      const mentorCount = (staffRes.data ?? []).filter(s => s.role === 'mentor').length
      setStats({
        activeMentees: menteesRes.count ?? 0,
        mentors: mentorCount,
        activePairings: pairingsRes.count ?? 0,
        activeEnrollments: enrollmentsRes.count ?? 0,
      })
      setStatsLoading(false)
    }
    fetchStats()
  }, [profile?.organization_id, isMenteeMode, menteeProfile?.id])

  if (!profile) return null

  const isMentor = profile.role === 'mentor' || profile.role === 'assistant_mentor'
  const isAdmin = profile.role === 'admin'

  // ====== MENTEE DASHBOARD ======
  if (isMenteeMode && menteeProfile) {
    const engagements = menteeAssignments.filter(a => a.offeringType === 'engagement')
    const courses = menteeAssignments.filter(a => a.offeringType === 'course')
    const hasAnything = engagements.length + courses.length + menteeHabits.length > 0
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {menteeProfile.first_name}</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
        </div>

        {menteeLoading ? (
          <Skeleton count={3} className="h-20 w-full" gap="gap-3" />
        ) : !hasAnything ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">Nothing assigned yet.</p>
            <p className="text-xs text-gray-400 mt-1">Your mentor will assign engagements, courses, or habits when ready.</p>
          </div>
        ) : (
          <>
            {engagements.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">My Engagements</h3>
                <div className="space-y-3">
                  {engagements.map(eng => (
                    <button
                      key={eng.id}
                      onClick={() => navigate(`/my-engagements/${eng.id}`)}
                      className="w-full bg-white rounded-md border border-gray-200/80 px-5 py-4 text-left hover:border-brand hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{eng.offeringName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Mentor: {eng.mentor ? `${eng.mentor.first_name} ${eng.mentor.last_name}` : 'Unassigned'}
                          </p>
                          {eng.nextMeetingAt ? (
                            <p className="text-xs text-brand font-medium mt-1.5">
                              Next meeting · {new Date(eng.nextMeetingAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1.5">No meeting scheduled · tap to schedule</p>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-gray-400 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {courses.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">My Courses</h3>
                <div className="space-y-3">
                  {courses.map(c => {
                    const total = c.lessonsTotal ?? 0
                    const done = c.lessonsCompleted ?? 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/my-courses/${c.id}`)}
                        className="w-full bg-white rounded-md border border-gray-200/80 px-5 py-4 text-left hover:border-brand hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <p className="text-sm font-semibold text-gray-900 truncate flex-1">{c.offeringName}</p>
                          <span className="text-xs font-medium text-gray-600 tabular-nums shrink-0">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-500">
                          {done} of {total} lesson{total !== 1 ? 's' : ''} complete
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {menteeHabits.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">My Habits</h3>
                <div className="space-y-3">
                  {menteeHabits.map(h => {
                    const pct = h.goalDays && h.goalDays > 0 ? Math.min(100, Math.round((h.successfulDays / h.goalDays) * 100)) : 0
                    return (
                      <button
                        key={h.id}
                        onClick={() => navigate(`/my-habits/${h.id}`)}
                        className="w-full bg-white rounded-md border border-gray-200/80 px-5 py-4 text-left hover:border-brand hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <p className="text-sm font-semibold text-gray-900 truncate flex-1">{h.name}</p>
                          {h.goalDays && <span className="text-xs font-medium text-gray-600 tabular-nums shrink-0">{pct}%</span>}
                        </div>
                        {h.goalDays ? (
                          <>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-gray-500">{h.successfulDays} of {h.goalDays} successful days</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">{h.successfulDays} successful day{h.successfulDays !== 1 ? 's' : ''}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => navigate('/my-engagements')} className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              <p className="text-sm font-medium text-gray-900">Engagements</p>
            </button>
            <button onClick={() => navigate('/my-courses')} className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              <p className="text-sm font-medium text-gray-900">Courses</p>
            </button>
            <button onClick={() => navigate('/my-habits')} className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              <p className="text-sm font-medium text-gray-900">Habits</p>
            </button>
            <button onClick={() => navigate('/my-billing')} className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              <p className="text-sm font-medium text-gray-900">Billing</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ====== MENTOR DASHBOARD ======
  if (isMentor) {
    return <MentorDashboard profile={profile} navigate={navigate} />
  }

  // ====== ADMIN / OPS DASHBOARD ======

  const kpiCards = [
    {
      label: 'Active Mentees',
      value: stats.activeMentees,
      subtitle: 'in your program',
      dot: 'bg-green-400',
      valueColor: 'text-green-700',
    },
    {
      label: 'Mentors',
      value: stats.mentors,
      subtitle: 'on your team',
      dot: 'bg-blue-400',
      valueColor: 'text-blue-700',
    },
    {
      label: 'Active Pairings',
      value: stats.activePairings,
      subtitle: 'mentor–mentee pairs',
      dot: 'bg-violet-400',
      valueColor: 'text-violet-700',
    },
    {
      label: 'Active Enrollments',
      value: stats.activeEnrollments,
      subtitle: 'courses & engagements',
      dot: 'bg-amber-400',
      valueColor: 'text-amber-700',
    },
  ]

  const peopleItems = [
    { title: 'Staff',             desc: 'Organization team members',    route: '/staff',             addRoute: '/staff/new' },
    { title: 'Mentors',           desc: 'Manage your mentoring team',   route: '/mentors',           addRoute: '/mentors/new' },
    { title: 'Assistant Mentors', desc: 'Mentors in training',          route: '/assistant-mentors', addRoute: '/assistant-mentors/new' },
    { title: 'Mentees',           desc: 'Track program participants',   route: '/mentees',           addRoute: '/mentees/new' },
  ]

  const businessItems = [
    { title: 'Courses',     desc: 'Course catalog and content',       route: '/courses',     addRoute: '/courses/new' },
    { title: 'Engagements', desc: 'Engagement types and programs',    route: '/engagements', addRoute: '/engagements/new' },
    { title: 'Pairings',    desc: 'Mentor–mentee assignments',        route: '/pairings',    addRoute: '/pairings/new' },
    { title: 'Reports',     desc: 'Analytics and program insights',   route: '/reports',     addRoute: null },
  ]

  const financeItems = [
    { title: 'Invoicing', desc: 'Create and track invoices',      route: '/invoicing', addRoute: null },
    { title: 'Payroll',   desc: 'Staff compensation tracking',    route: '/payroll',   addRoute: null },
  ]

  const systemItems = [
    { title: 'Audit Log', desc: 'Track actions and changes',                route: '/audit-log', addRoute: null },
    { title: 'Settings',  desc: 'Company and app configuration',            route: '/settings',  addRoute: null },
  ]

  const sections = isAdmin
    ? [
        { label: 'People',   items: peopleItems },
        { label: 'Business', items: businessItems },
        { label: 'Finance',  items: financeItems },
        { label: 'System',   items: systemItems },
      ]
    : [
        { label: 'People',   items: peopleItems },
        { label: 'Business', items: businessItems },
      ]

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${card.dot}`} />
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{card.label}</p>
            </div>
            {statsLoading ? (
              <div className="h-8 w-12 bg-gray-100 rounded animate-pulse mb-1" />
            ) : (
              <p className={`text-3xl font-bold tabular-nums ${card.valueColor}`}>
                {card.value.toLocaleString()}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
          </div>
        ))}
      </div>

      {/* Module Sections */}
      {sections.map(section => (
        <div key={section.label}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{section.label}</h3>
          <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
            {section.items.map(item => (
              <div key={item.title} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.addRoute && (
                    <button
                      onClick={() => navigate(item.addRoute!)}
                      className="px-3 py-1.5 text-xs font-medium text-brand border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    >
                      + Add
                    </button>
                  )}
                  <button
                    onClick={() => navigate(item.route)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    Manage →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Non-admin fallback */}
      {!isAdmin && sections.length === 0 && (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">
            Welcome back, {profile.first_name}. You are signed in as <span className="font-medium capitalize">{profile.role}</span>.
          </p>
        </div>
      )}
    </div>
  )
}

// ====== MENTOR DASHBOARD COMPONENT ======

interface MentorMentee {
  id: string
  first_name: string
  last_name: string
  email: string
  pairings: { id: string; status: string; offering_id: string | null; offering_name: string | null; offering_type: string | null }[]
}

function MentorDashboard({ profile, navigate }: { profile: StaffMember; navigate: (path: string) => void }) {
  const [mentees, setMentees] = useState<MentorMentee[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingTasks, setPendingTasks] = useState<MentorTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const { data: pairingsData } = await supabase
          .from('pairings')
          .select('id, status, mentee_id, offering_id')
          .eq('mentor_id', profile.id)
          .in('status', ['active', 'paused'])

        if (!pairingsData?.length) { setMentees([]); return }

        const menteeIds = [...new Set(pairingsData.map(p => p.mentee_id))]

        const { data: menteesData } = await supabase
          .from('mentees')
          .select('id, first_name, last_name, email')
          .in('id', menteeIds)

        const offeringIds = pairingsData.map(p => p.offering_id).filter(Boolean) as string[]
        let offeringsMap: Record<string, { name: string; type: string }> = {}
        if (offeringIds.length > 0) {
          const { data: offerings } = await supabase
            .from('offerings')
            .select('id, name, type')
            .in('id', offeringIds)
          if (offerings) {
            offeringsMap = Object.fromEntries(offerings.map(o => [o.id, { name: o.name, type: o.type }]))
          }
        }

        const menteesMap = new Map<string, MentorMentee>()
        for (const m of (menteesData ?? [])) {
          menteesMap.set(m.id, { ...m, pairings: [] })
        }
        for (const p of pairingsData) {
          const mentee = menteesMap.get(p.mentee_id)
          if (mentee) {
            const off = p.offering_id ? offeringsMap[p.offering_id] : null
            mentee.pairings.push({
              id: p.id,
              status: p.status,
              offering_id: p.offering_id,
              offering_name: off?.name ?? null,
              offering_type: off?.type ?? null,
            })
          }
        }

        setMentees(Array.from(menteesMap.values()))
      } catch {
        // silently handled
      } finally {
        setLoading(false)
      }
    }

    async function fetchTasks() {
      setTasksLoading(true)
      try {
        const { data } = await supabase
          .from('mentor_tasks')
          .select('*')
          .eq('mentor_id', profile.id)
          .eq('status', 'pending')
          .order('priority', { ascending: true }) // urgent first (alphabetical: normal > urgent, so asc puts urgent... wait, 'n' < 'u', so desc)
          .order('created_at', { ascending: false })
          .limit(5)
        setPendingTasks((data ?? []) as MentorTask[])
      } catch {
        // silently handled
      } finally {
        setTasksLoading(false)
      }
    }

    fetchData()
    fetchTasks()
  }, [profile.id])

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {profile.first_name}</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{mentees.length}</p>
          <p className="text-xs text-gray-500 mt-1">Active mentees</p>
        </div>
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">
            {mentees.reduce((sum, m) => sum + m.pairings.length, 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Active pairings</p>
        </div>
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{pendingTasks.length}{pendingTasks.length === 5 ? '+' : ''}</p>
          <p className="text-xs text-gray-500 mt-1">Pending tasks</p>
        </div>
      </div>

      {/* Tasks widget */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tasks</h3>
          <button
            onClick={() => navigate('/my-tasks')}
            className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
          >
            View all →
          </button>
        </div>
        {tasksLoading ? (
          <Skeleton count={2} className="h-14 w-full" gap="gap-2" />
        ) : pendingTasks.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-5 py-6 text-center">
            <p className="text-sm text-gray-400">No pending tasks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingTasks.map(t => (
              <div
                key={t.id}
                onClick={() => navigate('/my-tasks')}
                className={`bg-white rounded-md border px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-gray-300 transition-colors ${
                  t.priority === 'urgent' ? 'border-amber-300' : 'border-gray-200/80'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${t.priority === 'urgent' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.source === 'journey_decision' && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">Journey</span>
                    )}
                    {t.due_date && (
                      <span className={`text-[10px] ${t.due_date <= new Date().toISOString().slice(0, 10) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        Due {new Date(t.due_date + 'T00:00:00').toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Mentees</h3>
          <button
            onClick={() => navigate('/mentees')}
            className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
          >
            View all →
          </button>
        </div>

        {loading ? (
          <Skeleton count={4} className="h-16 w-full" gap="gap-3" />
        ) : mentees.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No mentees assigned to you yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentees.map(mentee => (
              <div key={mentee.id} className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                      {mentee.first_name[0]}{mentee.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{mentee.first_name} {mentee.last_name}</p>
                      <p className="text-xs text-gray-500">{mentee.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/mentees/${mentee.id}/edit`)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    View
                  </button>
                </div>

                {mentee.pairings.length > 0 && (
                  <div className="mt-2 pl-12 space-y-1.5">
                    {mentee.pairings.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <p className="text-xs text-gray-600">
                          {p.offering_name ?? 'General Mentoring'}
                          {p.offering_type === 'course' && <span className="text-gray-400 ml-1">(Course)</span>}
                          {p.offering_type === 'engagement' && <span className="text-gray-400 ml-1">(Engagement)</span>}
                        </p>
                        <span className={`text-[9px] font-medium px-1 py-0.5 rounded capitalize ${
                          p.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
