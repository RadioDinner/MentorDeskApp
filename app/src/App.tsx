import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { UserPreferencesProvider } from './context/UserPreferencesContext'
import { AccessibilityProvider } from './context/AccessibilityContext'
import ProtectedRoute from './router/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import DebugPanel from './components/DebugPanel'
import { Skeleton } from './components/ui'

// LoginPage is the unauthenticated landing page and is always needed in the
// first chunk, so it stays eager. Everything else is route-level code split:
// Vite will emit one chunk per page and only download it when the route is
// first visited. AppLayout's <Suspense> boundary handles per-route transitions
// so the sidebar stays stable; the top-level <Suspense> below covers the
// brief window between first render and AppLayout mounting.
import LoginPage from './pages/LoginPage'

const DashboardPage              = lazy(() => import('./pages/DashboardPage'))
const ProfilePage                = lazy(() => import('./pages/ProfilePage'))
const CompanySettingsPage        = lazy(() => import('./pages/CompanySettingsPage'))
const PeopleListPage             = lazy(() => import('./pages/PeopleListPage'))
const PersonEditPage             = lazy(() => import('./pages/PersonEditPage'))
const PersonCreatePage           = lazy(() => import('./pages/PersonCreatePage'))
const CoursesPage                = lazy(() => import('./pages/CoursesPage'))
const EngagementsPage            = lazy(() => import('./pages/EngagementsPage'))
const OfferingCreatePage         = lazy(() => import('./pages/OfferingCreatePage'))
const OfferingEditPage           = lazy(() => import('./pages/OfferingEditPage'))
const MenteesListPage            = lazy(() => import('./pages/MenteesListPage'))
const MenteeCreatePage           = lazy(() => import('./pages/MenteeCreatePage'))
const MenteeEditPage             = lazy(() => import('./pages/MenteeEditPage'))
const PairingsPage               = lazy(() => import('./pages/PairingsPage'))
const PairingCreatePage          = lazy(() => import('./pages/PairingCreatePage'))
const PairingEditPage            = lazy(() => import('./pages/PairingEditPage'))
const CourseBuilderPage          = lazy(() => import('./pages/CourseBuilderPage'))
const AuditLogPage               = lazy(() => import('./pages/AuditLogPage'))
const MenteeEngagementsPage      = lazy(() => import('./pages/MenteeEngagementsPage'))
const MenteeCoursesPage          = lazy(() => import('./pages/MenteeCoursesPage'))
const MenteeCourseViewerPage     = lazy(() => import('./pages/MenteeCourseViewerPage'))
const MenteeBillingPage          = lazy(() => import('./pages/MenteeBillingPage'))
const AvailabilityPage           = lazy(() => import('./pages/AvailabilityPage'))
const MentorMeetingsPage         = lazy(() => import('./pages/MentorMeetingsPage'))
const InvoicingPage              = lazy(() => import('./pages/InvoicingPage'))
const InvoicePrintPage           = lazy(() => import('./pages/InvoicePrintPage'))
const PayrollPage                = lazy(() => import('./pages/PayrollPage'))
const MenteeEngagementDetailPage = lazy(() => import('./pages/MenteeEngagementDetailPage'))
const HabitsPage                 = lazy(() => import('./pages/HabitsPage'))
const HabitCreatePage            = lazy(() => import('./pages/HabitCreatePage'))
const HabitEditPage              = lazy(() => import('./pages/HabitEditPage'))
const MenteeHabitsPage           = lazy(() => import('./pages/MenteeHabitsPage'))
const MenteeHabitDetailPage      = lazy(() => import('./pages/MenteeHabitDetailPage'))
const CanvasesPage               = lazy(() => import('./pages/CanvasesPage'))
const CanvasCreatePage           = lazy(() => import('./pages/CanvasCreatePage'))
const CanvasEditPage             = lazy(() => import('./pages/CanvasEditPage'))
const MenteeCanvasesPage         = lazy(() => import('./pages/MenteeCanvasesPage'))
const JourneysPage               = lazy(() => import('./pages/JourneysPage'))
const JourneyCreatePage          = lazy(() => import('./pages/JourneyCreatePage'))
const JourneyEditPage            = lazy(() => import('./pages/JourneyEditPage'))
const MentorTasksPage            = lazy(() => import('./pages/MentorTasksPage'))
const AutomationsPage            = lazy(() => import('./pages/AutomationsPage'))
const AutomationEditPage         = lazy(() => import('./pages/AutomationEditPage'))
const ComingSoonPage             = lazy(() => import('./pages/ComingSoonPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UserPreferencesProvider>
        <AccessibilityProvider>
        <ThemeProvider>
        <ToastProvider>
        <DebugPanel />
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
            <div className="w-full max-w-md">
              <Skeleton count={5} className="h-11 w-full" gap="gap-3" />
            </div>
          </div>
        }>
        <Routes>

          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Standalone printable invoice (no sidebar chrome) */}
          <Route
            path="/invoices/:id/print"
            element={
              <ProtectedRoute>
                <InvoicePrintPage />
              </ProtectedRoute>
            }
          />

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
            <Route path="/staff" element={<PeopleListPage title="Staff" roles={['admin', 'operations', 'course_creator', 'staff']} createLabel="Create Staff Member" createRoute="/staff/new" showAccessGroups />} />
            <Route path="/staff/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations']}>
                <PersonCreatePage title="Create Staff Member" defaultRole="operations" backRoute="/staff" allowRoleSelection />
              </ProtectedRoute>
            } />
            <Route path="/mentors" element={<PeopleListPage title="Mentors" roles={['mentor']} createLabel="Create Mentor" createRoute="/mentors/new" />} />
            <Route path="/mentors/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations']}>
                <PersonCreatePage title="Create Mentor" defaultRole="mentor" backRoute="/mentors" />
              </ProtectedRoute>
            } />
            <Route path="/assistant-mentors" element={<PeopleListPage title="Assistant Mentors" roles={['assistant_mentor']} createLabel="Create Assistant Mentor" createRoute="/assistant-mentors/new" />} />
            <Route path="/assistant-mentors/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations']}>
                <PersonCreatePage title="Create Assistant Mentor" defaultRole="assistant_mentor" backRoute="/assistant-mentors" />
              </ProtectedRoute>
            } />
            <Route path="/mentees" element={<MenteesListPage />} />
            <Route path="/mentees/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations']}>
                <MenteeCreatePage />
              </ProtectedRoute>
            } />
            <Route path="/mentees/:id/edit" element={<MenteeEditPage />} />
            <Route path="/pairings" element={<PairingsPage />} />
            <Route path="/pairings/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations']}>
                <PairingCreatePage />
              </ProtectedRoute>
            } />
            <Route path="/pairings/:id/edit" element={<PairingEditPage />} />
            <Route path="/people/:id/edit" element={<PersonEditPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/new" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <OfferingCreatePage title="Create Course" offeringType="course" />
              </ProtectedRoute>
            } />
            <Route path="/courses/:id/edit" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <OfferingEditPage />
              </ProtectedRoute>
            } />
            <Route path="/courses/:id/builder" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <CourseBuilderPage />
              </ProtectedRoute>
            } />
            <Route path="/engagements" element={<EngagementsPage />} />
            <Route path="/engagements/new" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <OfferingCreatePage title="Create Engagement" offeringType="engagement" />
              </ProtectedRoute>
            } />
            <Route path="/engagements/:id/edit" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <OfferingEditPage />
              </ProtectedRoute>
            } />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/habits/new" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <HabitCreatePage />
              </ProtectedRoute>
            } />
            <Route path="/habits/:id/edit" element={
              <ProtectedRoute allowedRoles={['admin', 'course_creator']}>
                <HabitEditPage />
              </ProtectedRoute>
            } />
            <Route path="/canvases" element={<CanvasesPage />} />
            <Route path="/canvases/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations', 'mentor', 'assistant_mentor']}>
                <CanvasCreatePage />
              </ProtectedRoute>
            } />
            <Route path="/canvases/:id" element={<CanvasEditPage />} />
            <Route path="/journeys" element={<JourneysPage />} />
            <Route path="/journeys/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations', 'course_creator']}>
                <JourneyCreatePage />
              </ProtectedRoute>
            } />
            <Route path="/journeys/:id" element={<JourneyEditPage />} />
            {/* Legacy /flows routes redirect to /journeys */}
            <Route path="/flows" element={<Navigate to="/journeys" replace />} />
            <Route path="/flows/*" element={<Navigate to="/journeys" replace />} />
            <Route path="/offerings" element={<Navigate to="/courses" replace />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/people/:id/availability" element={<AvailabilityPage />} />
            <Route path="/meetings" element={<MentorMeetingsPage />} />
            <Route path="/my-tasks" element={<MentorTasksPage />} />
            {/* Mentee-specific routes */}
            <Route path="/my-engagements" element={<MenteeEngagementsPage />} />
            <Route path="/my-engagements/:id" element={<MenteeEngagementDetailPage />} />
            <Route path="/my-courses" element={<MenteeCoursesPage />} />
            <Route path="/my-courses/:id" element={<MenteeCourseViewerPage />} />
            <Route path="/my-habits" element={<MenteeHabitsPage />} />
            <Route path="/my-habits/:id" element={<MenteeHabitDetailPage />} />
            <Route path="/my-canvases" element={<MenteeCanvasesPage />} />
            <Route path="/my-canvases/:id" element={<CanvasEditPage />} />
            <Route path="/my-billing" element={<MenteeBillingPage />} />
            <Route path="/automations" element={
              <ProtectedRoute allowedRoles={['admin', 'operations', 'mentor', 'assistant_mentor']}>
                <AutomationsPage />
              </ProtectedRoute>
            } />
            <Route path="/automations/new" element={
              <ProtectedRoute allowedRoles={['admin', 'operations', 'mentor', 'assistant_mentor']}>
                <AutomationEditPage />
              </ProtectedRoute>
            } />
            <Route path="/automations/:id" element={
              <ProtectedRoute allowedRoles={['admin', 'operations', 'mentor', 'assistant_mentor']}>
                <AutomationEditPage />
              </ProtectedRoute>
            } />
            <Route path="/reports" element={<ComingSoonPage title="Reports" />} />
            <Route path="/billing" element={<ComingSoonPage title="Billing" />} />
            <Route path="/invoicing" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <InvoicingPage />
              </ProtectedRoute>
            } />
            <Route path="/payroll" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PayrollPage />
              </ProtectedRoute>
            } />
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
        </Suspense>
        </ToastProvider>
        </ThemeProvider>
        </AccessibilityProvider>
        </UserPreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
