import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type FontSize = 'normal' | 'large' | 'xlarge'

interface AccessibilityPrefs {
  fontSize: FontSize
  highContrast: boolean
}

interface AccessibilityCtx extends AccessibilityPrefs {
  setFontSize: (s: FontSize) => void
  setHighContrast: (v: boolean) => void
}

const STORAGE_KEY = 'mentordesk.accessibility'
const DEFAULTS: AccessibilityPrefs = { fontSize: 'normal', highContrast: false }

function loadPrefs(): AccessibilityPrefs {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>
    return {
      fontSize: parsed.fontSize === 'large' || parsed.fontSize === 'xlarge' ? parsed.fontSize : 'normal',
      highContrast: !!parsed.highContrast,
    }
  } catch {
    return DEFAULTS
  }
}

function applyToDocument(prefs: AccessibilityPrefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge')
  root.classList.add(`font-size-${prefs.fontSize}`)
  root.classList.toggle('high-contrast', prefs.highContrast)
}

const Context = createContext<AccessibilityCtx | null>(null)

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() => loadPrefs())

  useEffect(() => {
    applyToDocument(prefs)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore quota/denied */ }
  }, [prefs])

  const setFontSize = useCallback((fontSize: FontSize) => setPrefs(p => ({ ...p, fontSize })), [])
  const setHighContrast = useCallback((highContrast: boolean) => setPrefs(p => ({ ...p, highContrast })), [])

  return (
    <Context.Provider value={{ ...prefs, setFontSize, setHighContrast }}>
      {children}
    </Context.Provider>
  )
}

export function useAccessibility(): AccessibilityCtx {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider')
  return ctx
}
