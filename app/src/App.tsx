import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './router/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import CompanySettingsPage from './pages/CompanySettingsPage'
import PeopleListPage from './pages/PeopleListPage'
import DebugPanel from './components/DebugPanel'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DebugPanel />
        <Routes>

          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — requires auth */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/staff" element={<PeopleListPage title="Staff" roles={['admin', 'staff']} />} />
            <Route path="/mentors" element={<PeopleListPage title="Mentors" roles={['mentor']} />} />
            <Route path="/assistant-mentors" element={<PeopleListPage title="Assistant Mentors" roles={[]} />} />
            <Route path="/mentees" element={<PeopleListPage title="Mentees" roles={[]} />} />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CompanySettingsPage />
              </ProtectedRoute>
            } />
            {/* Additional routes added here as pages are built */}
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
