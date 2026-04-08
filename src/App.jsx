import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { applyTheme } from './theme'
import { RoleProvider } from './context/RoleContext'
import { PLAN_LIMITS } from './constants/planLimits'
import Login from './pages/Login'
import GetStarted from './pages/GetStarted'
import Signup from './pages/Signup'
import SignupRequests from './pages/SignupRequests'
import InvoiceDetail from './pages/InvoiceDetail'
import AdminDashboard from './pages/AdminDashboard'
import ManageMentors from './pages/ManageMentors'
import MentorDetail from './pages/MentorDetail'
import ManageMentees from './pages/ManageMentees'
import ManageStaff from './pages/ManageStaff'
import StaffDetail from './pages/StaffDetail'
import ManageOfferings from './pages/ManageOfferings'
import ManageStaffRoles from './pages/ManageStaffRoles'
import Reports from './pages/Reports'
import Billing from './pages/Billing'
import Invoicing from './pages/Invoicing'
import CourseBuilder from './pages/CourseBuilder'
import ArrangementForm from './pages/ArrangementForm'
import CourseForm from './pages/CourseForm'
import MenteeDetail from './pages/MenteeDetail'
import ManageAssistantMentors from './pages/ManageAssistantMentors'
import AssistantMentorDetail from './pages/AssistantMentorDetail'
import MentorAssignMentees from './pages/MentorAssignMentees'
import AssistantMentorAssignMentees from './pages/AssistantMentorAssignMentees'
import CompanySettings from './pages/CompanySettings'
import AuditLog from './pages/AuditLog'
import SetPassword from './pages/SetPassword'
import EditProfile from './pages/EditProfile'
import MentorPayroll from './pages/MentorPayroll'
import MentorDashboard from './pages/MentorDashboard'
import MenteeDashboard from './pages/MenteeDashboard'
import MenteePreview from './pages/MenteePreview'
import AssistantMentorDashboard from './pages/AssistantMentorDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import AdminLayout from './components/AdminLayout'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorTracker from './components/ErrorTracker'
import SmartHelp from './components/SmartHelp'
import { runRecurringBilling } from './utils/recurringBilling'

const ROLE_PRIORITY = ['admin', 'staff', 'mentor', 'assistantmentor', 'mentee', 'trainee']

const DESTINATIONS = {
  recovery: '/set-password',
  admin: '/admin',
  staff: '/admin',
  mentor: '/mentor',
  assistantmentor: '/assistant-mentor',
  mentee: '/mentee',
  trainee: '/mentee',
}

function AdminRoute({ session, children }) {
  return (
    <ProtectedRoute session={session} allowed={['admin', 'staff']}>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  )
}


export default function App() {
  const [session, setSession] = useState(undefined)
  const [roles, setRoles] = useState(undefined)       // string[] of all user roles
  const [roleMap, setRoleMap] = useState({})            // { role: entity_id }
  const [activeRole, setActiveRoleState] = useState(undefined)
  const [staffPerms, setStaffPerms] = useState(null)
  const [organizationId, setOrganizationId] = useState(null)
  const [organizationSlug, setOrganizationSlug] = useState(null)
  const [featureFlags, setFeatureFlags] = useState({})
  const [impersonatedOrgId, setImpersonatedOrgId] = useState(null)
  const [allUserOrgs, setAllUserOrgs] = useState([]) // for multi-org switching
  const [plan, setPlan] = useState('free')
  const [orgLicenseLimits, setOrgLicenseLimits] = useState(null)
  const [entityCounts, setEntityCounts] = useState({ mentors: 0, mentees: 0, staff: 0, assistant_mentors: 0, offerings: 0 })

  // The effective org ID (impersonation overrides real org)
  const effectiveOrgId = impersonatedOrgId || organizationId

  // Theme loading is deferred until we know the org (see fetchRoles)
  const loadThemeForOrg = useCallback(async (orgId) => {
    if (!orgId) return
    const { data } = await supabase.from('settings').select('key, value').eq('organization_id', orgId)
    if (!data) return
    const get = k => data.find(s => s.key === k)?.value
    applyTheme({
      primary: get('primary_color'),
      secondary: get('secondary_color'),
      highlight: get('highlight_color'),
    })
  }, [])

  // Load org metadata (slug, feature flags, plan)
  const loadOrgMeta = useCallback(async (orgId) => {
    if (!orgId) return
    const { data: org } = await supabase.from('organizations').select('slug, feature_flags, plan, license_limits').eq('id', orgId).maybeSingle()
    if (org) {
      setOrganizationSlug(org.slug)
      setFeatureFlags(org.feature_flags || {})
      setPlan(org.plan || 'free')
      setOrgLicenseLimits(org.license_limits || null)
    }
  }, [])

  // Load entity counts for plan limit checking
  const loadEntityCounts = useCallback(async (orgId) => {
    if (!orgId) return
    const [m, me, st, pp, of] = await Promise.all([
      supabase.from('mentors').select('id', { count: 'exact', head: true }),
      supabase.from('mentees').select('id', { count: 'exact', head: true }).neq('is_test_account', true),
      supabase.from('staff').select('id', { count: 'exact', head: true }),
      supabase.from('assistant_mentors').select('id', { count: 'exact', head: true }),
      supabase.from('offerings').select('id', { count: 'exact', head: true }),
    ])
    setEntityCounts({
      mentors: m.count || 0,
      mentees: me.count || 0,
      staff: st.count || 0,
      assistant_mentors: pp.count || 0,
      offerings: of.count || 0,
    })
  }, [])

  const loadStaffPerms = useCallback(async (entityId) => {
    if (!entityId) { setStaffPerms(null); return }
    const { data: perms } = await supabase
      .from('staff_permissions')
      .select('*')
      .eq('staff_id', entityId)
      .maybeSingle()
    setStaffPerms(perms || {})
  }, [])

  const setActiveRole = useCallback(async (newRole) => {
    setActiveRoleState(newRole)
    // Persist to profiles.active_role
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      supabase.from('profiles').update({ active_role: newRole }).eq('id', user.id)
    }
    // Load staff perms if switching to staff
    if (newRole === 'staff') {
      loadStaffPerms(roleMap[newRole])
    } else {
      setStaffPerms(null)
    }
  }, [roleMap, loadStaffPerms])

  useEffect(() => {
    let rolesLoaded = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session && !rolesLoaded) {
        rolesLoaded = true
        fetchRoles(session.user.id)
      } else if (!session) {
        setRoles(null)
        setActiveRoleState(null)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setSession(session)
        setRoles(null)
        setActiveRoleState('recovery')
        return
      }
      // Skip role refetch on token refresh or duplicate initial session
      if (_event === 'TOKEN_REFRESHED' || (_event === 'INITIAL_SESSION' && rolesLoaded)) {
        setSession(session)
        return
      }
      setSession(session)
      if (session) {
        if (!rolesLoaded) {
          rolesLoaded = true
          fetchRoles(session.user.id)
        }
        if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
          const key = `login_ev_${session.user.id}`
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            supabase.from('login_events').insert({
              user_id: session.user.id,
              email: session.user.email,
            })
          }
        }
      } else {
        rolesLoaded = false
        setRoles(null)
        setActiveRoleState(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchRoles(userId) {
    const { data: urData, error: urError } = await supabase
      .from('user_roles')
      .select('role, entity_id, organization_id')
      .eq('user_id', userId)

    if (urError || !urData || urData.length === 0) {
      setRoles([])
      setActiveRoleState(null)
      return
    }

    // Determine the user's organization (use first org found)
    const orgId = urData[0].organization_id
    setOrganizationId(orgId)
    loadThemeForOrg(orgId)
    loadOrgMeta(orgId)
    loadEntityCounts(orgId)

    // Run recurring billing check (once per session)
    const billingKey = `billing_check_${userId}`
    if (!sessionStorage.getItem(billingKey)) {
      sessionStorage.setItem(billingKey, '1')
      runRecurringBilling(orgId)
    }
    // Collect all unique orgs for multi-org switching
    const uniqueOrgIds = [...new Set(urData.map(r => r.organization_id))]
    if (uniqueOrgIds.length > 1) {
      const { data: orgsData } = await supabase.from('organizations').select('id, name, slug').in('id', uniqueOrgIds)
      setAllUserOrgs(orgsData || [])
    } else {
      setAllUserOrgs([])
    }

    // Filter out super_admin — it's handled by the separate super admin app
    const orgRoles = urData.filter(r => r.role !== 'super_admin')
    const roleList = orgRoles.map(r => r.role)
    const map = {}
    orgRoles.forEach(r => { map[r.role] = r.entity_id })

    setRoles(roleList)
    setRoleMap(map)

    // Determine active role: check profiles.active_role, then priority
    const { data: profileData } = await supabase
      .from('profiles')
      .select('active_role')
      .eq('id', userId)
      .single()

    const savedRole = profileData?.active_role
    let chosen = null
    if (savedRole && roleList.includes(savedRole)) {
      chosen = savedRole
    } else {
      chosen = ROLE_PRIORITY.find(r => roleList.includes(r)) || roleList[0]
    }

    setActiveRoleState(chosen)

    // Load staff permissions if active role is staff
    if (chosen === 'staff' && map.staff) {
      const { data: perms } = await supabase
        .from('staff_permissions')
        .select('*')
        .eq('staff_id', map.staff)
        .maybeSingle()
      setStaffPerms(perms || {})
    }
  }

  // Allow child components to trigger a role refresh (e.g. after adding a test mentee role)
  const refreshRoles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await fetchRoles(user.id)
  }, [])

  // All hooks must be above any conditional returns (React rules of hooks)
  const hasFeature = useCallback((flag) => {
    if (activeRole === 'super_admin') return true
    const planDef = PLAN_LIMITS[plan] || PLAN_LIMITS.free
    const planDefault = planDef.features[flag] ?? true
    if (featureFlags[flag] !== undefined) return featureFlags[flag]
    return planDefault
  }, [featureFlags, activeRole, plan])

  const checkLimit = useCallback((entityKey) => {
    const planDef = PLAN_LIMITS[plan] || PLAN_LIMITS.free
    // Per-org license_limits take priority over plan defaults; -1 means unlimited
    let max
    if (orgLicenseLimits && orgLicenseLimits[entityKey] !== undefined) {
      max = orgLicenseLimits[entityKey] === -1 ? Infinity : orgLicenseLimits[entityKey]
    } else {
      max = planDef.limits[entityKey]
    }
    const current = entityCounts[entityKey] || 0
    return {
      current,
      max,
      unlimited: max === Infinity,
      atLimit: max !== Infinity && current >= max,
      remaining: max === Infinity ? Infinity : Math.max(0, max - current),
    }
  }, [plan, entityCounts, orgLicenseLimits])

  const refreshEntityCounts = useCallback(() => {
    loadEntityCounts(effectiveOrgId)
  }, [effectiveOrgId, loadEntityCounts])

  const switchOrg = useCallback(async (newOrgId) => {
    setOrganizationId(newOrgId)
    setImpersonatedOrgId(null)
    loadThemeForOrg(newOrgId)
    loadOrgMeta(newOrgId)
    loadEntityCounts(newOrgId)
  }, [loadThemeForOrg, loadOrgMeta, loadEntityCounts])

  // Wait for initial load
  if (session === undefined || activeRole === undefined) return null

  const activeEntityId = roleMap[activeRole] || null

  const roleCtx = {
    session,
    roles: roles || [],
    activeRole,
    setActiveRole,
    activeEntityId,
    staffPerms,
    roleMap,
    organizationId: effectiveOrgId,
    organizationSlug,
    featureFlags,
    hasFeature,
    allUserOrgs,
    switchOrg,
    impersonatedOrgId,
    setImpersonatedOrgId,
    plan,
    checkLimit,
    refreshEntityCounts,
    refreshRoles,
  }

  return (
    <RoleProvider value={roleCtx}>
      <ErrorBoundary name="App">
      <BrowserRouter>
        <ErrorTracker />
        <SmartHelp />
        <Routes>
          <Route path="/login" element={<RoleRedirect session={session} activeRole={activeRole} loginPage />} />
          <Route path="/:slug/login" element={<RoleRedirect session={session} activeRole={activeRole} loginPage />} />
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/:slug/signup" element={<Signup />} />

          <Route path="/admin" element={<AdminRoute session={session}><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/mentors" element={<AdminRoute session={session}><ManageMentors /></AdminRoute>} />
          <Route path="/admin/mentors/:id" element={<AdminRoute session={session}><MentorDetail /></AdminRoute>} />
          <Route path="/admin/mentors/:id/assign" element={<AdminRoute session={session}><MentorAssignMentees /></AdminRoute>} />
          <Route path="/admin/mentees" element={<AdminRoute session={session}><ManageMentees /></AdminRoute>} />
          <Route path="/admin/staff" element={<AdminRoute session={session}><ManageStaff /></AdminRoute>} />
          <Route path="/admin/staff/:id" element={<AdminRoute session={session}><StaffDetail /></AdminRoute>} />
          <Route path="/admin/offerings" element={<AdminRoute session={session}><ManageOfferings /></AdminRoute>} />
          <Route path="/admin/staff-roles" element={<AdminRoute session={session}><ManageStaffRoles /></AdminRoute>} />
          <Route path="/admin/mentees/:id" element={<AdminRoute session={session}><MenteeDetail /></AdminRoute>} />
          <Route path="/admin/assistant-mentors" element={<AdminRoute session={session}><ManageAssistantMentors /></AdminRoute>} />
          <Route path="/admin/assistant-mentors/:id" element={<AdminRoute session={session}><AssistantMentorDetail /></AdminRoute>} />
          <Route path="/admin/assistant-mentors/:id/assign" element={<AdminRoute session={session}><AssistantMentorAssignMentees /></AdminRoute>} />
          <Route path="/admin/reports" element={<AdminRoute session={session}><Reports /></AdminRoute>} />
          <Route path="/admin/billing" element={<AdminRoute session={session}><Billing /></AdminRoute>} />
          <Route path="/admin/invoicing" element={<AdminRoute session={session}><Invoicing /></AdminRoute>} />
          <Route path="/admin/invoices/:invoiceId" element={<AdminRoute session={session}><InvoiceDetail /></AdminRoute>} />
          <Route path="/admin/offerings/:id/build" element={<AdminRoute session={session}><CourseBuilder /></AdminRoute>} />
          <Route path="/admin/offerings/arrangement/new" element={<AdminRoute session={session}><ArrangementForm /></AdminRoute>} />
          <Route path="/admin/offerings/arrangement/:id/edit" element={<AdminRoute session={session}><ArrangementForm /></AdminRoute>} />
          <Route path="/admin/offerings/course/new" element={<AdminRoute session={session}><CourseForm /></AdminRoute>} />
          <Route path="/admin/offerings/course/:id/edit" element={<AdminRoute session={session}><CourseForm /></AdminRoute>} />
          <Route path="/admin/signup-requests" element={<AdminRoute session={session}><SignupRequests /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute session={session}><CompanySettings /></AdminRoute>} />
          <Route path="/admin/mentor-payroll" element={<AdminRoute session={session}><MentorPayroll /></AdminRoute>} />
          <Route path="/admin/audit-log" element={<AdminRoute session={session}><AuditLog /></AdminRoute>} />
          <Route path="/admin/profile" element={<AdminRoute session={session}><EditProfile /></AdminRoute>} />
          <Route path="/set-password" element={<SetPassword />} />

          <Route path="/mentor" element={
            <ProtectedRoute session={session} allowed={['mentor']}>
              <MentorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/mentor/view-mentee/:menteeId" element={
            <ProtectedRoute session={session} allowed={['mentor']}>
              <MenteePreview />
            </ProtectedRoute>
          } />
          <Route path="/assistant-mentor" element={
            <ProtectedRoute session={session} allowed={['assistantmentor']}>
              <AssistantMentorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/assistant-mentor/view-mentee/:menteeId" element={
            <ProtectedRoute session={session} allowed={['assistantmentor']}>
              <MenteePreview />
            </ProtectedRoute>
          } />
          <Route path="/mentee" element={
            <ProtectedRoute session={session} allowed={['mentee', 'trainee']}>
              <MenteeDashboard />
            </ProtectedRoute>
          } />
          <Route path="/mentee/invoices/:invoiceId" element={
            <ProtectedRoute session={session} allowed={['mentee', 'trainee']}>
              <InvoiceDetail readOnly />
            </ProtectedRoute>
          } />
          <Route path="*" element={<RoleRedirect session={session} activeRole={activeRole} />} />
        </Routes>
      </BrowserRouter>
      </ErrorBoundary>
    </RoleProvider>
  )
}

function RoleRedirect({ session, activeRole, loginPage }) {
  if (!session) return loginPage ? <Login /> : <Navigate to="/login" replace />
  return <Navigate to={DESTINATIONS[activeRole] || '/login'} replace />
}

// Re-export for Login to check if a slug matches a known route prefix
export const KNOWN_ROUTE_PREFIXES = ['admin', 'mentor', 'mentee', 'assistant-mentor', 'login', 'signup', 'get-started', 'set-password']
