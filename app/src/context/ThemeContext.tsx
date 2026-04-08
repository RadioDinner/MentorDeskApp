import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import type { Organization } from '../types'

// Convert hex to RGB for Tailwind opacity support
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `${r} ${g} ${b}`
}

// Generate lighter/darker shades from a hex color
function adjustBrightness(hex: string, factor: number): string {
  const h = hex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)

  if (factor > 0) {
    // Lighten: mix with white
    r = Math.round(r + (255 - r) * factor)
    g = Math.round(g + (255 - g) * factor)
    b = Math.round(b + (255 - b) * factor)
  } else {
    // Darken: mix with black
    const f = 1 + factor
    r = Math.round(r * f)
    g = Math.round(g * f)
    b = Math.round(b * f)
  }

  return `${r} ${g} ${b}`
}

function applyTheme(org: Organization) {
  const root = document.documentElement

  // Primary color and shades
  root.style.setProperty('--brand-primary', hexToRgb(org.primary_color))
  root.style.setProperty('--brand-primary-hover', adjustBrightness(org.primary_color, -0.15))
  root.style.setProperty('--brand-primary-light', adjustBrightness(org.primary_color, 0.9))
  root.style.setProperty('--brand-primary-ring', adjustBrightness(org.primary_color, 0.2))

  // Secondary
  root.style.setProperty('--brand-secondary', hexToRgb(org.secondary_color))
  root.style.setProperty('--brand-secondary-hover', adjustBrightness(org.secondary_color, -0.15))
  root.style.setProperty('--brand-secondary-light', adjustBrightness(org.secondary_color, 0.9))

  // Tertiary
  root.style.setProperty('--brand-tertiary', hexToRgb(org.tertiary_color))
  root.style.setProperty('--brand-tertiary-light', adjustBrightness(org.tertiary_color, 0.9))
}

const DEFAULTS: Pick<Organization, 'primary_color' | 'secondary_color' | 'tertiary_color'> = {
  primary_color: '#4F46E5',
  secondary_color: '#6366F1',
  tertiary_color: '#818CF8',
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!profile) {
      // Apply defaults when not logged in
      applyTheme({ ...DEFAULTS } as Organization)
      setReady(true)
      return
    }

    async function loadTheme() {
      const { data } = await supabase
        .from('organizations')
        .select('primary_color, secondary_color, tertiary_color')
        .eq('id', profile!.organization_id)
        .single()

      if (data) {
        applyTheme(data as Organization)
      } else {
        applyTheme({ ...DEFAULTS } as Organization)
      }
      setReady(true)
    }

    loadTheme()
  }, [profile])

  if (!ready) return null

  return <>{children}</>
}

// Re-apply theme after settings change
export function refreshTheme(org: Organization) {
  applyTheme(org)
}
