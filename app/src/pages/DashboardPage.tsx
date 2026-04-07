import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ mentors: 0, staff: 0 })

  useEffect(() => {
    if (!profile) return

    async function fetchStats() {
      const { data: staffData } = await supabase
        .from('staff')
        .select('role')
        .eq('organization_id', profile!.organization_id)

      if (staffData) {
        setStats({
          mentors: staffData.filter(s => s.role === 'mentor').length,
          staff: staffData.filter(s => s.role === 'staff' || s.role === 'admin').length,
        })
      }
    }

    fetchStats()
  }, [profile])

  if (!profile) return null

  const isAdmin = profile.role === 'admin'

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
    { title: 'Billing', desc: 'Manage billing and payments', route: '/billing', canAdd: false, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { title: 'Invoicing', desc: 'Create and track invoices', route: '/invoicing', canAdd: true, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
    { title: 'Payroll', desc: 'Staff compensation tracking', route: '/payroll', canAdd: false, iconBg: 'bg-lime-50', iconColor: 'text-lime-600' },
  ]

  const systemItems = [
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
