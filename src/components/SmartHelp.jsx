import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { HelpCircle, X, Lightbulb, MessageCircle, ChevronRight } from 'lucide-react'

// ─── Page-Specific Contextual Tips ──────────────────────────

const PAGE_TIPS = {
  '/admin': {
    title: 'Dashboard Overview',
    tips: [
      'Your dashboard shows key stats at a glance. Click any card to navigate to that section.',
      'Use the sidebar to access different management areas.',
      'Need help? Click the "?" icon or the Help & Docs button in the sidebar.',
    ],
  },
  '/admin/mentors': {
    title: 'Managing Mentors',
    tips: [
      'Click "+ Add Mentor" to create a new mentor and optionally send them a login invite.',
      'Click any mentor row to view their profile, assigned mentees, and pay details.',
      'Mentors will receive an email invite to create their account when you check "Send invite".',
    ],
  },
  '/admin/mentees': {
    title: 'Managing Mentees',
    tips: [
      'Click "+ Add Mentee" to register a new mentee in the system.',
      'Use the search bar to quickly find a mentee by name or email.',
      'Click a mentee to manage their offerings, meetings, and invoices.',
    ],
  },
  '/admin/offerings': {
    title: 'Courses & Arrangements',
    tips: [
      'Offerings come in two types: Courses (structured lessons) and Arrangements (flexible meeting credits).',
      'Courses can be built with lessons, quizzes, and whiteboard exercises using the Course Builder.',
      'Arrangements let you define meeting credits per billing period for flexible scheduling.',
    ],
  },
  '/admin/billing': {
    title: 'Billing & Subscription',
    tips: [
      'This page shows your current plan and usage against plan limits.',
      'If you\'re nearing a limit, consider upgrading your plan or contacting support.',
      'Payment methods and billing address can be managed in the sections below.',
    ],
  },
  '/admin/settings': {
    title: 'Organization Settings',
    tips: [
      'Upload your logo and set brand colors to customize the platform appearance.',
      'Configure custom mentee status types to match your workflow.',
      'The company info section affects what appears on invoices and communications.',
    ],
  },
  '/admin/invoicing': {
    title: 'Invoice Management',
    tips: [
      'Create invoices for mentees linked to their enrolled offerings.',
      'Track payment status — pending, paid, overdue, or cancelled.',
      'Click any invoice row to view details or update its status.',
    ],
  },
  '/admin/staff-roles': {
    title: 'Staff Permissions',
    tips: [
      'Control which admin sections each staff member can access.',
      'Toggle individual module permissions on or off per staff member.',
      'Admins always have full access — these settings only apply to staff role users.',
    ],
  },
  '/mentor': {
    title: 'Mentor Dashboard',
    tips: [
      'Your assigned mentees appear here. Click one to view their progress.',
      'You can schedule meetings, assign offerings, and track lesson completion.',
      'Use the whiteboard feature to assign exercises during mentoring sessions.',
    ],
  },
  '/mentee': {
    title: 'Your Dashboard',
    tips: [
      'Your enrolled programs and upcoming meetings appear here.',
      'Click a course to continue where you left off — lessons unlock as you progress.',
      'Complete whiteboard exercises assigned by your mentor to unlock the next lessons.',
    ],
  },
}

// Frustration trigger thresholds
const RAGE_CLICK_COUNT = 4       // clicks within the time window
const RAGE_CLICK_WINDOW = 2000   // ms
const RAPID_NAV_COUNT = 5        // page changes within the window
const RAPID_NAV_WINDOW = 8000    // ms
const IDLE_THRESHOLD = 45000     // ms of no interaction on a form page
const COOLDOWN = 60000           // ms before showing help again after dismissal

export default function SmartHelp() {
  const location = useLocation()
  const { session, activeRole, organizationId } = useRole()
  const [visible, setVisible] = useState(false)
  const [tip, setTip] = useState(null)
  const [trigger, setTrigger] = useState(null) // what triggered the help popup
  const [dismissed, setDismissed] = useState(false)
  const lastDismiss = useRef(0)

  // Track clicks for rage detection
  const clickTimestamps = useRef([])
  // Track navigations for rapid nav detection
  const navTimestamps = useRef([])
  // Idle timer
  const idleTimer = useRef(null)
  // Current page ref
  const currentPage = useRef(location.pathname)

  const showHelp = useCallback((triggerType, pagePath) => {
    // Don't show if recently dismissed or already visible
    if (Date.now() - lastDismiss.current < COOLDOWN) return
    if (visible) return
    // Don't show for super admins — they know what they're doing
    if (activeRole === 'super_admin') return

    const path = pagePath || currentPage.current
    const matchedTip = findTipForPath(path)
    if (!matchedTip) return

    setTip(matchedTip)
    setTrigger(triggerType)
    setVisible(true)
    setDismissed(false)

    // Log the event
    logBehaviorEvent(triggerType, path)
  }, [visible, activeRole])

  const dismissHelp = useCallback(() => {
    setVisible(false)
    setDismissed(true)
    lastDismiss.current = Date.now()
    logBehaviorEvent('help_dismissed', currentPage.current)
  }, [])

  // Log behavior event to DB
  function logBehaviorEvent(eventType, pageUrl) {
    if (!session?.user?.id) return
    supabase.from('user_behavior_events').insert({
      user_id: session.user.id,
      organization_id: organizationId || null,
      event_type: eventType,
      page_url: pageUrl,
      metadata: { role: activeRole, trigger },
    }).then(() => {})
  }

  // 1. Rage click detection
  useEffect(() => {
    function handleClick() {
      const now = Date.now()
      clickTimestamps.current.push(now)
      // Keep only recent clicks
      clickTimestamps.current = clickTimestamps.current.filter(t => now - t < RAGE_CLICK_WINDOW)

      if (clickTimestamps.current.length >= RAGE_CLICK_COUNT) {
        showHelp('rage_click')
        clickTimestamps.current = []
      }

      // Reset idle timer on any interaction
      resetIdleTimer()
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showHelp])

  // 2. Rapid navigation detection
  useEffect(() => {
    const now = Date.now()
    navTimestamps.current.push(now)
    navTimestamps.current = navTimestamps.current.filter(t => now - t < RAPID_NAV_WINDOW)
    currentPage.current = location.pathname

    if (navTimestamps.current.length >= RAPID_NAV_COUNT) {
      showHelp('rapid_nav', location.pathname)
      navTimestamps.current = []
    }

    // Hide current tip on navigation
    if (visible) {
      setVisible(false)
    }

    // Start idle timer for new page
    resetIdleTimer()
  }, [location.pathname])

  // 3. Idle detection on form pages
  function resetIdleTimer() {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    // Only monitor idle on pages that likely have forms
    const formPages = ['/admin/mentors', '/admin/mentees', '/admin/offerings', '/admin/settings', '/admin/invoicing', '/admin/staff']
    const isFormPage = formPages.some(p => currentPage.current.startsWith(p))
    if (isFormPage) {
      idleTimer.current = setTimeout(() => {
        showHelp('idle_on_form')
      }, IDLE_THRESHOLD)
    }
  }

  useEffect(() => {
    // Reset idle on keypress too
    function handleKeypress() { resetIdleTimer() }
    document.addEventListener('keydown', handleKeypress)
    return () => {
      document.removeEventListener('keydown', handleKeypress)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  // 4. Error encounter — listen for error log inserts via global event
  useEffect(() => {
    function handleErrorEncounter() {
      showHelp('error_encounter')
    }
    window.addEventListener('smarthelp:error', handleErrorEncounter)
    return () => window.removeEventListener('smarthelp:error', handleErrorEncounter)
  }, [showHelp])

  if (!visible || !tip) return null

  const triggerMessage = {
    rage_click: 'Having trouble? Here are some tips for this page.',
    rapid_nav: 'Looks like you\'re looking for something. Can we help?',
    idle_on_form: 'Need a hand? Here\'s some guidance for this section.',
    error_encounter: 'Ran into an issue? These tips might help.',
  }

  return (
    <div style={s.overlay} onClick={dismissHelp}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={s.headerIcon}>
              <Lightbulb size={16} color="#f59e0b" />
            </div>
            <span style={s.headerTitle}>Quick Help</span>
          </div>
          <button style={s.closeBtn} onClick={dismissHelp}>
            <X size={16} />
          </button>
        </div>

        {/* Trigger context */}
        <div style={s.triggerMsg}>
          <MessageCircle size={13} color="#6366f1" />
          <span>{triggerMessage[trigger] || 'Here are some tips for this page.'}</span>
        </div>

        {/* Tips */}
        <div style={s.tipSection}>
          <div style={s.tipTitle}>{tip.title}</div>
          {tip.tips.map((t, i) => (
            <div key={i} style={s.tipItem}>
              <ChevronRight size={12} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.footerBtn} onClick={dismissHelp}>
            Got it
          </button>
          <span style={s.footerHint}>
            <HelpCircle size={11} /> Tip: You can always access help from the sidebar
          </span>
        </div>
      </div>
    </div>
  )
}

function findTipForPath(path) {
  // Exact match first
  if (PAGE_TIPS[path]) return PAGE_TIPS[path]
  // Prefix match (e.g. /admin/mentors/123 matches /admin/mentors)
  const segments = path.split('/').filter(Boolean)
  while (segments.length > 1) {
    segments.pop()
    const prefix = '/' + segments.join('/')
    if (PAGE_TIPS[prefix]) return PAGE_TIPS[prefix]
  }
  // Root match
  if (PAGE_TIPS['/' + (segments[0] || '')]) return PAGE_TIPS['/' + segments[0]]
  return null
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)',
    zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
    padding: '1.5rem',
    animation: 'smarthelp-fadein 0.2s ease',
  },
  panel: {
    width: 360, maxHeight: '70vh', background: '#fff',
    borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    animation: 'smarthelp-slideup 0.25s ease',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9',
  },
  headerIcon: {
    width: 30, height: 30, borderRadius: 8, background: '#fffbeb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' },
  closeBtn: {
    width: 28, height: 28, borderRadius: 6, border: 'none',
    background: '#f1f5f9', color: '#64748b', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  triggerMsg: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.7rem 1.25rem', background: '#f8fafc',
    fontSize: '0.8rem', color: '#475569', fontStyle: 'italic',
    borderBottom: '1px solid #f1f5f9',
  },
  tipSection: {
    padding: '1rem 1.25rem', flex: 1, overflowY: 'auto',
  },
  tipTitle: {
    fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem',
  },
  tipItem: {
    display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
    marginBottom: '0.6rem', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45,
  },
  footer: {
    padding: '0.85rem 1.25rem', borderTop: '1px solid #f1f5f9',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  footerBtn: {
    padding: '0.45rem 1rem', background: '#6366f1', color: '#fff',
    border: 'none', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
  },
  footerHint: {
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: '0.68rem', color: '#94a3b8',
  },
}
