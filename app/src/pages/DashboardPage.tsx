import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Offering, StaffMember } from '../types'

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

interface Stats {
  mentors: number
  staff: number
}

interface MenteeEngagement {
  id: string
  status: string
  mentor: { first_name: string; last_name: string } | null
  offering: Offering | null
}

export default function DashboardPage() {
  const { profile, isMenteeMode, menteeProfile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ mentors: 0, staff: 0 })
  const [menteeEngagements, setMenteeEngagements] = useState<MenteeEngagement[]>([])

  useEffect(() => {
    if (!profile) return
    if (isMenteeMode && menteeProfile) {
      // Fetch active pairings for this mentee
      async function fetchMenteeData() {
        const { data } = await supabase
          .from('pairings')
          .select(`id, status, offering_id, mentor:staff!pairings_mentor_id_fkey ( first_name, last_name )`)
          .eq('mentee_id', menteeProfile!.id)
          .in('status', ['active', 'paused'])

        if (data) {
          // Fetch offerings for pairings that have offering_id
          const offeringIds = data.map(p => p.offering_id).filter(Boolean) as string[]
          let offeringsMap: Record<string, Offering> = {}
          if (offeringIds.length > 0) {
            const { data: offerings } = await supabase
              .from('offerings')
              .select('*')
              .in('id', offeringIds)
            if (offerings) {
              offeringsMap = Object.fromEntries(offerings.map(o => [o.id, o as Offering]))
            }
          }

          setMenteeEngagements(data.map(p => ({
            id: p.id,
            status: p.status,
            mentor: p.mentor as unknown as { first_name: string; last_name: string } | null,
            offering: p.offering_id ? offeringsMap[p.offering_id] ?? null : null,
          })))
        }
      }
      fetchMenteeData()
      return
    }

    async function fetchStats() {
      const { data: staffData } = await supabase
        .from('staff')
        .select('role')
        .eq('organization_id', profile!.organization_id)

      if (staffData) {
        setStats({
          mentors: staffData.filter(s => s.role === 'mentor').length,
          staff: staffData.filter(s =>
            s.role === 'admin' ||
            s.role === 'operations' ||
            s.role === 'course_creator' ||
            s.role === 'staff'
          ).length,
        })
      }
    }

    fetchStats()
  }, [profile?.organization_id, isMenteeMode, menteeProfile?.id])

  if (!profile) return null

  // ====== MENTEE DASHBOARD ======
  if (isMenteeMode && menteeProfile) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {menteeProfile.first_name}</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
        </div>

        {menteeEngagements.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active Engagements</h3>
            <div className="space-y-3">
              {menteeEngagements.map(eng => (
                <div key={eng.id} className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {eng.offering ? eng.offering.name : 'General Mentoring'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Mentor: {eng.mentor ? `${eng.mentor.first_name} ${eng.mentor.last_name}` : 'Unassigned'}
                        {eng.offering?.type === 'course' && ' \u00b7 Course'}
                        {eng.offering?.type === 'engagement' && ' \u00b7 Engagement'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      eng.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {eng.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No active engagements right now.</p>
            <p className="text-xs text-gray-400 mt-1">Your mentor or organization admin will assign you when ready.</p>
          </div>
        )}

        {/* Quick links */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/my-engagements')}
              className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">My Engagements</p>
              <p className="text-xs text-gray-500 mt-0.5">View your courses and programs</p>
            </button>
            <button
              onClick={() => navigate('/my-billing')}
              className="bg-white rounded-md border border-gray-200/80 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">Billing</p>
              <p className="text-xs text-gray-500 mt-0.5">Payment info and invoices</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isAdmin = profile.role === 'admin'
  const isMentor = profile.role === 'mentor' || profile.role === 'assistant_mentor'

  // ====== MENTOR DASHBOARD ======
  if (isMentor) {
    return <MentorDashboard profile={profile} navigate={navigate} />
  }

  const statCards = [
    { label: 'Mentors', count: stats.mentors, color: 'bg-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Staff', count: stats.staff, color: 'bg-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  ]

  const peopleItems = [
    { title: 'Staff', desc: 'Organization team members', route: '/staff', canAdd: true, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { title: 'Mentors', desc: 'Manage your mentoring team', route: '/mentors', canAdd: true, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { title: 'Assistant Mentors', desc: 'Mentors in training', route: '/assistant-mentors', canAdd: true, iconBg: 'bg-teal-50', iconColor: 'text-teal-600' },
    { title: 'Mentees', desc: 'Track program participants', route: '/mentees', canAdd: true, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  ]

  const businessItems = [
    { title: 'Offerings', desc: 'Plans, pricing and durations', route: '/offerings', canAdd: true, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
    { title: 'Reports', desc: 'Analytics and program insights', route: '/reports', canAdd: false, iconBg: 'bg-brand-light', iconColor: 'text-brand' },
  ]

  const financeItems = [
    { title: 'Invoicing', desc: 'Create and track invoices', route: '/invoicing', canAdd: true, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
    { title: 'Payroll', desc: 'Staff compensation tracking', route: '/payroll', canAdd: false, iconBg: 'bg-lime-50', iconColor: 'text-lime-600' },
  ]

  const systemItems = [
    { title: 'Billing', desc: 'Your MentorDesk subscription & payment', route: '/billing', canAdd: false, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { title: 'Audit Log', desc: 'Track actions and changes', route: '/audit-log', canAdd: false, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { title: 'Settings', desc: 'Company and app configuration', route: '/settings', canAdd: false, iconBg: 'bg-gray-100', iconColor: 'text-gray-600' },
  ]

  return (
    <div className="max-w-5xl space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
      </div>

      {/* Stat Cards */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(card => (
            <div key={card.label} className="bg-white rounded-md border border-gray-200/80  px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded ${card.iconBg} flex items-center justify-center`}>
                  <svg className={`w-4 h-4 ${card.iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{card.count}</p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`${card.color} h-1.5 rounded-full`} style={{ width: `${Math.min(card.count * 5, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Module Sections */}
      {isAdmin && [
        { label: 'People', items: peopleItems },
        { label: 'Business', items: businessItems },
        { label: 'Finance', items: financeItems },
        { label: 'System', items: systemItems },
      ].map(section => (
        <div key={section.label}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{section.label}</h3>
          <div className="bg-white rounded-md border border-gray-200/80  divide-y divide-gray-100">
            {section.items.map(item => (
              <div key={item.title} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded ${item.iconBg} flex items-center justify-center`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path className={item.iconColor} strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.canAdd && (
                    <button className="px-3 py-1.5 text-xs font-medium text-brand border border-gray-200 rounded hover:bg-gray-50 transition-colors">
                      + Add
                    </button>
                  )}
                  <button
                    onClick={() => navigate(item.route)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    Manage &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Non-admin fallback */}
      {!isAdmin && (
        <div className="bg-white rounded-md border border-gray-200/80  px-6 py-8 text-center">
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

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Get all active pairings for this mentor
        const { data: pairingsData } = await supabase
          .from('pairings')
          .select('id, status, mentee_id, offering_id')
          .eq('mentor_id', profile.id)
          .in('status', ['active', 'paused'])

        if (!pairingsData?.length) { setMentees([]); return }

        // Get unique mentee IDs
        const menteeIds = [...new Set(pairingsData.map(p => p.mentee_id))]

        // Fetch mentee details
        const { data: menteesData } = await supabase
          .from('mentees')
          .select('id, first_name, last_name, email')
          .in('id', menteeIds)

        // Fetch offering names for pairings that have one
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

        // Group pairings by mentee
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
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile.id])

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {profile.first_name}</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate()}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-2xl font-bold text-gray-900">{mentees.length}</p>
          <p className="text-xs text-gray-500">Active mentees</p>
        </div>
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-2xl font-bold text-gray-900">{mentees.reduce((sum, m) => sum + m.pairings.length, 0)}</p>
          <p className="text-xs text-gray-500">Active pairings</p>
        </div>
      </div>

      {/* Mentees list with their engagements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Mentees</h3>
          <button
            onClick={() => navigate('/mentees')}
            className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
          >
            View all &rarr;
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
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

                {/* Engagements for this mentee */}
                {mentee.pairings.length > 0 && (
                  <div className="mt-2 pl-12 space-y-1.5">
                    {mentee.pairings.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <p className="text-xs text-gray-600">
                          {p.offering_name ?? 'General Mentoring'}
                          {p.offering_type === 'course' && (
                            <span className="text-gray-400 ml-1">(Course)</span>
                          )}
                          {p.offering_type === 'engagement' && (
                            <span className="text-gray-400 ml-1">(Engagement)</span>
                          )}
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
