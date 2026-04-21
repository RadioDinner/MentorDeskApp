import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Shape of the prefs blob. Add new sections here; JSON-safe only.
// Components that consume a section should treat it as optional and
// fall back to their own defaults for forward compatibility.
export interface UserPreferences {
  accessibility?: {
    fontSize?: 'normal' | 'large' | 'xlarge'
    highContrast?: boolean
    brandTint?: boolean
  }
  /** Per-event per-channel notification toggles. Unlisted events fall
   *  back to the defaults declared in lib/notificationEvents.ts, so
   *  adding new events doesn't require updating stored prefs. */
  notifications?: Record<string, Partial<{ inApp: boolean; email: boolean; sms: boolean }>>
  // Future sections land here: display, defaults, etc.
  [key: string]: unknown
}

interface UserPreferencesCtx {
  prefs: UserPreferences
  /** Merge-update a top-level section (e.g. "accessibility"). */
  setSection: <K extends keyof UserPreferences>(key: K, patch: Partial<NonNullable<UserPreferences[K]>>) => void
  /** True once the DB fetch has completed (or we've given up waiting). */
  loaded: boolean
}

const STORAGE_KEY = 'mentordesk.userPreferences'

function loadLocal(): UserPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserPreferences) : {}
  } catch { return {} }
}

function saveLocal(prefs: UserPreferences) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* quota / denied */ }
}

const Context = createContext<UserPreferencesCtx | null>(null)

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  // Bootstrap instantly from localStorage so UI renders with prefs before
  // the DB round-trip lands.
  const [prefs, setPrefs] = useState<UserPreferences>(() => loadLocal())
  const [loaded, setLoaded] = useState(false)
  const lastLoadedUserRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch from DB on login / user swap.
  useEffect(() => {
    if (!userId) { setLoaded(true); return }
    if (lastLoadedUserRef.current === userId) return
    lastLoadedUserRef.current = userId

    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle()
      if (cancelled) return

      if (!error && data?.preferences) {
        const dbPrefs = data.preferences as UserPreferences
        setPrefs(dbPrefs)
        saveLocal(dbPrefs)
      } else if (!error && !data) {
        // First time on this device for this user: push whatever's in
        // localStorage up as their starting row so it follows them.
        const local = loadLocal()
        if (Object.keys(local).length > 0) {
          await supabase.from('user_preferences').insert({ user_id: userId, preferences: local })
        }
      }
      setLoaded(true)
    })()

    return () => { cancelled = true }
  }, [userId])

  // Persist any change to localStorage immediately and to DB debounced.
  useEffect(() => {
    saveLocal(prefs)
    if (!userId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await supabase.from('user_preferences').upsert(
        { user_id: userId, preferences: prefs, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [prefs, userId])

  const setSection = useCallback(<K extends keyof UserPreferences>(
    key: K,
    patch: Partial<NonNullable<UserPreferences[K]>>,
  ) => {
    setPrefs(prev => ({
      ...prev,
      [key]: { ...((prev[key] as object | undefined) ?? {}), ...patch },
    }))
  }, [])

  return (
    <Context.Provider value={{ prefs, setSection, loaded }}>
      {children}
    </Context.Provider>
  )
}

export function useUserPreferences(): UserPreferencesCtx {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider')
  return ctx
}
