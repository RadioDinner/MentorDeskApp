import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, warmUpSupabase } from '../lib/supabase'
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

  // Ref to always hold the latest profile — avoids stale closures in async callbacks
  const profileRef = useRef<StaffMember | null>(null)
  profileRef.current = profile

  async function fetchAllProfiles(userId: string) {
    const [staffRes, menteeRes] = await Promise.all([
      supabase.from('staff').select('*').eq('user_id', userId),
      supabase.from('mentees').select('*').eq('user_id', userId),
    ])

    if (staffRes.error) {
      // If fetch fails, keep existing profile — don't null it out
      return profileRef.current
    }

    const staffRecords = (staffRes.data as StaffMember[]) ?? []
    const activeStaff = staffRecords.filter(s => !s.archived_at)
    const menteeRecords = ((menteeRes.data as Mentee[]) ?? []).filter(m => !m.archived_at)

    // If no staff records found, keep existing profile to prevent null-out
    if (activeStaff.length === 0 && !profileRef.current) {
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
    } else if (activeStaff.length > 0) {
      setProfile(activeStaff[0])
      setIsMenteeMode(false)
    }

    return activeStaff[0] ?? profileRef.current
  }

  function applyProfile(profileId: string, staffRecords: StaffMember[], _menteeRec: Mentee | null, userId?: string) {
    setActiveProfileId(profileId)

    if (profileId.startsWith('mentee:')) {
      setIsMenteeMode(true)
      if (staffRecords.length > 0) {
        setProfile(staffRecords[0])
      }
    } else {
      const staffProfile = staffRecords.find(s => s.id === profileId)
      if (staffProfile) {
        setProfile(staffProfile)
        setIsMenteeMode(false)
      } else if (staffRecords.length > 0) {
        setProfile(staffRecords[0])
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
    let cancelled = false
    let activeSafetyTimeout: ReturnType<typeof setTimeout> | null = null

    const initTimeout = setTimeout(() => {
      if (!didInit) {
        didInit = true
        setLoading(false)
      }
    }, 3000)

    // CRITICAL: The onAuthStateChange callback holds an internal Supabase auth
    // lock. Any `await supabase.*` call made synchronously inside this callback
    // will deadlock against that lock. We MUST defer async work via setTimeout(0)
    // so it runs outside the callback scope.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      setSession(session)
      setUser(session?.user ?? null)

      if (!didInit) {
        didInit = true
        clearTimeout(initTimeout)
      }

      if (activeSafetyTimeout) clearTimeout(activeSafetyTimeout)

      activeSafetyTimeout = setTimeout(() => {
        if (!cancelled) setLoading(false)
      }, 15000)

      setTimeout(async () => {
        if (cancelled) return
        try {
          if (session?.user) {
            warmUpSupabase()

            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || !profileRef.current) {
              const p = await fetchAllProfiles(session.user.id)
              if (!cancelled && p?.organization_id) {
                purgeExpiredArchives(p.organization_id).catch(() => {})
              }
            }
          } else if (!cancelled) {
            setProfile(null)
            setAllStaffProfiles([])
            setMenteeProfile(null)
            setActiveProfileId(null)
            setIsMenteeMode(false)
          }
        } finally {
          if (activeSafetyTimeout) {
            clearTimeout(activeSafetyTimeout)
            activeSafetyTimeout = null
          }
          if (!cancelled) setLoading(false)
        }
      }, 0)
    })

    supabase.auth.getSession().catch(() => {
      if (!didInit) {
        didInit = true
        clearTimeout(initTimeout)
        if (!cancelled) setLoading(false)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(initTimeout)
      if (activeSafetyTimeout) clearTimeout(activeSafetyTimeout)
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
