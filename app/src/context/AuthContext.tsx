import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { purgeExpiredArchives } from '../lib/archivePurge'
import type { StaffMember, Mentee } from '../types'

export interface ProfileOption {
  type: 'staff' | 'mentee'
  id: string
  label: string
  role: string
  staffRecord?: StaffMember
  menteeRecord?: Mentee
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: StaffMember | null
  loading: boolean
  // Multi-profile support
  allProfiles: ProfileOption[]
  activeProfileId: string | null
  menteeProfile: Mentee | null
  isMenteeMode: boolean
  switchProfile: (profileId: string) => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  staff: 'Staff',
  mentor: 'Mentor',
  assistant_mentor: 'Asst. Mentor',
  mentee: 'Mentee',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)

  // Multi-profile state
  const [allStaffProfiles, setAllStaffProfiles] = useState<StaffMember[]>([])
  const [menteeProfile, setMenteeProfile] = useState<Mentee | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [isMenteeMode, setIsMenteeMode] = useState(false)

  async function fetchAllProfiles(userId: string) {
    // Fetch all staff records for this user (and mentee record if exists)
    const [staffRes, menteeRes] = await Promise.all([
      supabase.from('staff').select('*').eq('user_id', userId),
      supabase.from('mentees').select('*').eq('user_id', userId),
    ])

    if (staffRes.error) {
      console.error('Failed to fetch staff profiles:', staffRes.error.message)
      // CRITICAL: if fetch fails, keep existing profile — don't null it out
      return profile
    }

    const staffRecords = (staffRes.data as StaffMember[]) ?? []
    // Filter out archived in JS (archived_at column may not exist yet)
    const activeStaff = staffRecords.filter(s => !s.archived_at)
    const menteeRecords = ((menteeRes.data as Mentee[]) ?? []).filter(m => !m.archived_at)

    // If no staff records found, keep existing profile to prevent null-out
    if (activeStaff.length === 0 && !profile) {
      return null
    }

    setAllStaffProfiles(activeStaff)
    setMenteeProfile(menteeRecords.length > 0 ? menteeRecords[0] : null)

    // Pick the active profile: prefer saved, then admin, then first staff
    const savedActiveId = localStorage.getItem(`mentordesk_active_profile_${userId}`)
    const allIds = [...activeStaff.map(s => s.id), ...menteeRecords.map(m => `mentee:${m.id}`)]
    let activeId = savedActiveId && allIds.includes(savedActiveId) ? savedActiveId : null

    if (!activeId) {
      const adminProfile = activeStaff.find(s => s.role === 'admin')
      activeId = adminProfile?.id ?? activeStaff[0]?.id ?? (menteeRecords.length > 0 ? `mentee:${menteeRecords[0].id}` : null)
    }

    if (activeId) {
      applyProfile(activeId, activeStaff, menteeRecords.length > 0 ? menteeRecords[0] : null, userId)
    }

    return activeStaff[0] ?? profile // Never return null if we have a current profile
  }

  function applyProfile(profileId: string, staffRecords: StaffMember[], menteeRec: Mentee | null, userId?: string) {
    setActiveProfileId(profileId)

    if (profileId.startsWith('mentee:')) {
      // Mentee mode — we still need a staff profile for org_id etc.
      // Use the first staff record as the "base" but mark mentee mode
      setIsMenteeMode(true)
      // Keep the current staff profile for org context
      if (staffRecords.length > 0) {
        setProfile(staffRecords[0])
      }
    } else {
      const staffProfile = staffRecords.find(s => s.id === profileId)
      if (staffProfile) {
        setProfile(staffProfile)
        setIsMenteeMode(false)
      }
    }

    // Persist choice
    if (userId) {
      localStorage.setItem(`mentordesk_active_profile_${userId}`, profileId)
    }
  }

  function switchProfile(profileId: string) {
    applyProfile(profileId, allStaffProfiles, menteeProfile, user?.id)
  }

  // Build the list of available profile options
  const allProfiles: ProfileOption[] = [
    ...allStaffProfiles.map(s => ({
      type: 'staff' as const,
      id: s.id,
      label: ROLE_LABELS[s.role] ?? s.role,
      role: s.role,
      staffRecord: s,
    })),
    ...(menteeProfile ? [{
      type: 'mentee' as const,
      id: `mentee:${menteeProfile.id}`,
      label: 'Mentee',
      role: 'mentee',
      menteeRecord: menteeProfile,
    }] : []),
  ]

  useEffect(() => {
    let didInit = false

    const initTimeout = setTimeout(() => {
      if (!didInit) {
        didInit = true
        console.warn('[AuthContext] Session init timed out — continuing without session')
        setLoading(false)
      }
    }, 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!didInit) {
        didInit = true
        clearTimeout(initTimeout)
      }
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        // On token refresh, don't disrupt the current profile
        // Only do a full profile fetch on initial load or sign-in
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || !profile) {
          const p = await fetchAllProfiles(session.user.id)
          if (p?.organization_id) {
            purgeExpiredArchives(p.organization_id).catch(() => {})
          }
        }
        // TOKEN_REFRESHED: keep existing profile, don't re-fetch
      } else {
        // Only clear on actual sign out
        setProfile(null)
        setAllStaffProfiles([])
        setMenteeProfile(null)
        setActiveProfileId(null)
        setIsMenteeMode(false)
      }
      setLoading(false)
    })

    supabase.auth.getSession().catch((err) => {
      console.error('[AuthContext] getSession failed:', err)
      if (!didInit) {
        didInit = true
        clearTimeout(initTimeout)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(initTimeout)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    if (user) {
      localStorage.removeItem(`mentordesk_active_profile_${user.id}`)
    }
    await supabase.auth.signOut({ scope: 'local' })
    setSession(null)
    setUser(null)
    setProfile(null)
    setAllStaffProfiles([])
    setMenteeProfile(null)
    setActiveProfileId(null)
    setIsMenteeMode(false)
  }

  async function refreshProfile() {
    if (user) {
      await fetchAllProfiles(user.id)
    }
  }

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading,
      allProfiles, activeProfileId, menteeProfile, isMenteeMode,
      switchProfile,
      signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
