/**
 * Applies company brand colors to CSS custom properties on :root
 * so all components using var(--primary), var(--primary-gradient), etc. update instantly.
 */
export function applyTheme({ primary, secondary, highlight } = {}) {
  const root = document.documentElement
  const p = primary || '#6366f1'
  const s = secondary || '#8b5cf6'
  const h = highlight || '#f59e0b'

  root.style.setProperty('--primary', p)
  root.style.setProperty('--primary-light', lighten(p))
  root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${p} 0%, ${s} 100%)`)
  root.style.setProperty('--accent', h)
  root.style.setProperty('--warning', h)
  root.style.setProperty('--nav-active-bg', `rgba(${hexToRGB(p)}, 0.12)`)

  // Dynamic styles that can't use static CSS variables (focus ring, nav active bg)
  const id = 'cc-theme'
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  const pr = hexToRGB(p)
  const hr = hexToRGB(h)
  el.textContent = `
    input:focus, select:focus, textarea:focus {
      border-color: ${p} !important;
      box-shadow: 0 0 0 3px rgba(${pr}, 0.12) !important;
    }
    .nav-active {
      background: rgba(${pr}, 0.12) !important;
      color: ${lighten(p)} !important;
    }
    .nav-active-bar {
      background: linear-gradient(135deg, ${p} 0%, ${s} 100%) !important;
    }
    [data-accent] {
      color: ${h} !important;
    }
  `
}

/** Convert #rrggbb → "r, g, b" string for use in rgba() */
function hexToRGB(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/** Lighten a hex color by mixing with white */
function lighten(hex, amount = 0.35) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const r = Math.round(parseInt(full.slice(0, 2), 16) + (255 - parseInt(full.slice(0, 2), 16)) * amount)
  const g = Math.round(parseInt(full.slice(2, 4), 16) + (255 - parseInt(full.slice(2, 4), 16)) * amount)
  const b = Math.round(parseInt(full.slice(4, 6), 16) + (255 - parseInt(full.slice(4, 6), 16)) * amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
