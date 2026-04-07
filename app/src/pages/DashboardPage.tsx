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
    { title: 'Mentors', desc: 'Manage your mentoring team', route: '/mentors', canAdd: true, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { title: 'Mentees', desc: 'Track program participants', route: '/mentees', canAdd: true, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
    { title: 'Staff', desc: 'Organization team members', route: '/staff', canAdd: true, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  ]

  const systemItems = [
    { title: 'Staff Roles', desc: 'Manage permissions and access', route: '/staff-roles', canAdd: false, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
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
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
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

      {/* People Section */}
      {isAdmin && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">People</h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {peopleItems.map(item => (
              <div key={item.title} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                    <svg className={`w-4.5 h-4.5 ${item.iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.canAdd && (
                    <button className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      + Add
                    </button>
                  )}
                  <button
                    onClick={() => navigate(item.route)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Manage &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Section */}
      {isAdmin && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">System</h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {systemItems.map(item => (
              <div key={item.title} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                    <svg className={`w-4.5 h-4.5 ${item.iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(item.route)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Manage &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-admin fallback */}
      {!isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-8 text-center">
          <p className="text-sm text-gray-500">
            Welcome back, {profile.first_name}. You are signed in as <span className="font-medium capitalize">{profile.role}</span>.
          </p>
        </div>
      )}

    </div>
  )
}
