import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isSuperAdminAuthenticated } from './superAdminClient'
import { restoreSupabaseSession } from './supabaseClient'
import SuperAdminLogin from './pages/SuperAdminLogin'
import SuperAdminLayout from './components/SuperAdminLayout'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import ManageOrganizations from './pages/ManageOrganizations'
import OrganizationDetail from './pages/OrganizationDetail'
import SuperAdminSettings from './pages/SuperAdminSettings'
import SuperAdminUsage from './pages/SuperAdminUsage'
import ErrorLogs from './pages/ErrorLogs'
import PendingSignups from './pages/PendingSignups'
import PlatformInvoicing from './pages/PlatformInvoicing'

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      if (isSuperAdminAuthenticated()) {
        // Restore the Supabase session from stored tokens
        await restoreSupabaseSession()
        setAuthenticated(true)
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  async function handleLoginSuccess(email) {
    await restoreSupabaseSession()
    setAuthenticated(true)
  }

  function handleLogout() {
    setAuthenticated(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Loading...
      </div>
    )
  }

  if (!authenticated) {
    return <SuperAdminLogin onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <BrowserRouter>
      <SuperAdminLayout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<SuperAdminDashboard />} />
          <Route path="/organizations" element={<ManageOrganizations />} />
          <Route path="/organizations/:id" element={<OrganizationDetail />} />
          <Route path="/settings" element={<SuperAdminSettings />} />
          <Route path="/invoicing" element={<PlatformInvoicing />} />
          <Route path="/usage" element={<SuperAdminUsage />} />
          <Route path="/error-logs" element={<ErrorLogs />} />
          <Route path="/signups" element={<PendingSignups />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SuperAdminLayout>
    </BrowserRouter>
  )
}
