import { useState, useEffect } from 'react'
import { BookOpen, Calendar, User, CreditCard, Layout, ChevronRight, X } from 'lucide-react'

const TUTORIAL_STEPS = [
  {
    key: 'welcome',
    icon: Layout,
    title: 'Welcome to your dashboard!',
    body: 'This is your home base. The overview shows a quick snapshot of your courses, meetings, invoices, and program status. Click any card to jump straight to that section.',
    tab: 'overview',
    color: '#6366f1',
  },
  {
    key: 'courses',
    icon: BookOpen,
    title: 'Your courses live here',
    body: 'The "My Courses" tab shows everything you\'re enrolled in. Open a course to see your lessons, track your progress, and complete any whiteboard exercises your mentor has assigned.',
    tab: 'courses',
    color: '#3b82f6',
  },
  {
    key: 'meetings',
    icon: Calendar,
    title: 'Schedule and view meetings',
    body: 'The "Meetings" tab shows your upcoming and past sessions. If you have meeting credits, you can request a new meeting with your mentor right from here.',
    tab: 'meetings',
    color: '#0d9488',
  },
  {
    key: 'profile',
    icon: User,
    title: 'Keep your profile updated',
    body: 'Head to "My Profile" to update your name, phone number, and address. Your email is managed by your organization — reach out to them if it needs changing.',
    tab: 'profile',
    color: '#8b5cf6',
  },
  {
    key: 'billing',
    icon: CreditCard,
    title: 'Invoices and payment',
    body: 'The "Billing" tab shows all your invoices and lets you save a payment method. You\'ll see a notification on the overview if you have anything outstanding.',
    tab: 'billing',
    color: '#f59e0b',
  },
]

export default function MenteeTutorial({ onComplete, onTabChange }) {
  const [step, setStep] = useState(0)
  const current = TUTORIAL_STEPS[step]
  const isLast = step === TUTORIAL_STEPS.length - 1
  const Icon = current.icon

  function next() {
    if (isLast) {
      onComplete()
    } else {
      const nextStep = TUTORIAL_STEPS[step + 1]
      if (nextStep.tab && onTabChange) onTabChange(nextStep.tab)
      setStep(step + 1)
    }
  }

  function skip() {
    onComplete()
  }

  // Navigate to the tab for the current step on mount
  useEffect(() => {
    if (current.tab && onTabChange) onTabChange(current.tab)
  }, [])

  return (
    <>
      {/* Overlay backdrop */}
      <div style={s.backdrop} />

      {/* Tutorial card */}
      <div style={s.card}>
        {/* Close button */}
        <button style={s.closeBtn} onClick={skip} title="Skip tutorial">
          <X size={16} />
        </button>

        {/* Progress dots */}
        <div style={s.dots}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{
              ...s.dot,
              backgroundColor: i === step ? current.color : i < step ? current.color + '60' : '#e5e7eb',
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ ...s.iconWrap, backgroundColor: current.color + '14' }}>
          <Icon size={28} color={current.color} strokeWidth={1.8} />
        </div>

        {/* Content */}
        <h2 style={s.title}>{current.title}</h2>
        <p style={s.body}>{current.body}</p>

        {/* Step counter */}
        <div style={s.stepCount}>Step {step + 1} of {TUTORIAL_STEPS.length}</div>

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.skipBtn} onClick={skip}>
            Skip tour
          </button>
          <button style={{ ...s.nextBtn, backgroundColor: current.color }} onClick={next}>
            {isLast ? 'Get started' : 'Next'}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </>
  )
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 9998,
  },
  card: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '2rem 1.75rem 1.5rem',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.2)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: 4,
  },
  dots: {
    display: 'flex',
    gap: '0.4rem',
    marginBottom: '1.25rem',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    transition: 'background-color 0.2s',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '0.5rem',
    letterSpacing: '-0.01em',
  },
  body: {
    fontSize: '0.88rem',
    color: '#64748b',
    lineHeight: 1.6,
    marginBottom: '0.75rem',
  },
  stepCount: {
    fontSize: '0.72rem',
    color: '#9ca3af',
    fontWeight: 600,
    marginBottom: '1.25rem',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: '0.75rem',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '0.82rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0.5rem 0.75rem',
  },
  nextBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.6rem 1.25rem',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
}
