import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
