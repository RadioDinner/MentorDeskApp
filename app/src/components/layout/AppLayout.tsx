import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':          'Home',
  '/staff':              'Staff',
  '/mentors':            'Mentors',
  '/assistant-mentors':  'Assistant Mentors',
  '/mentees':            'Mentees',
  '/offerings':          'Offerings',
  '/reports':            'Reports',
  '/billing':            'Billing',
  '/invoicing':          'Invoicing',
  '/payroll':            'Payroll',
  '/audit-log':          'Audit Log',
  '/settings':           'Settings',
  '/profile':            'Profile Settings',
}

export default function AppLayout() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'MentorDesk'

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar title={title} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
