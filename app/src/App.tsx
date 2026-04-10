import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './router/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import CompanySettingsPage from './pages/CompanySettingsPage'
import PeopleListPage from './pages/PeopleListPage'
import PersonEditPage from './pages/PersonEditPage'
import PersonCreatePage from './pages/PersonCreatePage'
import CoursesPage from './pages/CoursesPage'
import EngagementsPage from './pages/EngagementsPage'
import OfferingCreatePage from './pages/OfferingCreatePage'
import OfferingEditPage from './pages/OfferingEditPage'
import MenteesListPage from './pages/MenteesListPage'
import MenteeCreatePage from './pages/MenteeCreatePage'
import MenteeEditPage from './pages/MenteeEditPage'
import PairingsPage from './pages/PairingsPage'
import PairingCreatePage from './pages/PairingCreatePage'
import PairingEditPage from './pages/PairingEditPage'
import CourseBuilderPage from './pages/CourseBuilderPage'
import AuditLogPage from './pages/AuditLogPage'
import MenteeEngagementsPage from './pages/MenteeEngagementsPage'
import MenteeCoursesPage from './pages/MenteeCoursesPage'
import MenteeCourseViewerPage from './pages/MenteeCourseViewerPage'
import MenteeBillingPage from './pages/MenteeBillingPage'
import ComingSoonPage from './pages/ComingSoonPage'
import DebugPanel from './components/DebugPanel'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
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
            <Route path="/staff" element={<PeopleListPage title="Staff" roles={['admin', 'staff']} createLabel="Create Staff Member" createRoute="/staff/new" showAccessGroups />} />
            <Route path="/staff/new" element={<PersonCreatePage title="Create Staff Member" defaultRole="staff" backRoute="/staff" />} />
            <Route path="/mentors" element={<PeopleListPage title="Mentors" roles={['mentor']} createLabel="Create Mentor" createRoute="/mentors/new" />} />
            <Route path="/mentors/new" element={<PersonCreatePage title="Create Mentor" defaultRole="mentor" backRoute="/mentors" />} />
            <Route path="/assistant-mentors" element={<PeopleListPage title="Assistant Mentors" roles={['assistant_mentor']} createLabel="Create Assistant Mentor" createRoute="/assistant-mentors/new" />} />
            <Route path="/assistant-mentors/new" element={<PersonCreatePage title="Create Assistant Mentor" defaultRole="assistant_mentor" backRoute="/assistant-mentors" />} />
            <Route path="/mentees" element={<MenteesListPage />} />
            <Route path="/mentees/new" element={<MenteeCreatePage />} />
            <Route path="/mentees/:id/edit" element={<MenteeEditPage />} />
            <Route path="/pairings" element={<PairingsPage />} />
            <Route path="/pairings/new" element={<PairingCreatePage />} />
            <Route path="/pairings/:id/edit" element={<PairingEditPage />} />
            <Route path="/people/:id/edit" element={<PersonEditPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/new" element={<OfferingCreatePage title="Create Course" offeringType="course" />} />
            <Route path="/courses/:id/edit" element={<OfferingEditPage />} />
            <Route path="/courses/:id/builder" element={<CourseBuilderPage />} />
            <Route path="/engagements" element={<EngagementsPage />} />
            <Route path="/engagements/new" element={<OfferingCreatePage title="Create Engagement" offeringType="engagement" />} />
            <Route path="/engagements/:id/edit" element={<OfferingEditPage />} />
            <Route path="/offerings" element={<Navigate to="/courses" replace />} />
            {/* Mentee-specific routes */}
            <Route path="/my-engagements" element={<MenteeEngagementsPage />} />
            <Route path="/my-courses" element={<MenteeCoursesPage />} />
            <Route path="/my-courses/:id" element={<MenteeCourseViewerPage />} />
            <Route path="/my-billing" element={<MenteeBillingPage />} />
            <Route path="/reports" element={<ComingSoonPage title="Reports" />} />
            <Route path="/billing" element={<ComingSoonPage title="Billing" />} />
            <Route path="/invoicing" element={<ComingSoonPage title="Invoicing" />} />
            <Route path="/payroll" element={<ComingSoonPage title="Payroll" />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CompanySettingsPage />
              </ProtectedRoute>
            } />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
