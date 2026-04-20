import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react'
import { useUserPreferences } from './UserPreferencesContext'

export type FontSize = 'normal' | 'large' | 'xlarge'

interface AccessibilityCtx {
  fontSize: FontSize
  highContrast: boolean
  brandTint: boolean
  setFontSize: (s: FontSize) => void
  setHighContrast: (v: boolean) => void
  setBrandTint: (v: boolean) => void
}

const DEFAULTS = { fontSize: 'normal' as FontSize, highContrast: false, brandTint: false }

function applyToDocument(fontSize: FontSize, highContrast: boolean, brandTint: boolean) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge')
  root.classList.add(`font-size-${fontSize}`)
  root.classList.toggle('high-contrast', highContrast)
  root.classList.toggle('brand-tint', brandTint)
}

const Context = createContext<AccessibilityCtx | null>(null)

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { prefs, setSection } = useUserPreferences()
  const fontSize = prefs.accessibility?.fontSize ?? DEFAULTS.fontSize
  const highContrast = prefs.accessibility?.highContrast ?? DEFAULTS.highContrast
  const brandTint = prefs.accessibility?.brandTint ?? DEFAULTS.brandTint

  useEffect(() => { applyToDocument(fontSize, highContrast, brandTint) }, [fontSize, highContrast, brandTint])

  const setFontSize = useCallback((fontSize: FontSize) => setSection('accessibility', { fontSize }), [setSection])
  const setHighContrast = useCallback((highContrast: boolean) => setSection('accessibility', { highContrast }), [setSection])
  const setBrandTint = useCallback((brandTint: boolean) => setSection('accessibility', { brandTint }), [setSection])

  return (
    <Context.Provider value={{ fontSize, highContrast, brandTint, setFontSize, setHighContrast, setBrandTint }}>
      {children}
    </Context.Provider>
  )
}

export function useAccessibility(): AccessibilityCtx {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider')
  return ctx
}
