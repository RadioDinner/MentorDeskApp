import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { ChevronDown, Shield, UserCheck, HeartHandshake, Users, Users2, BookOpen, ArrowRightLeft } from 'lucide-react'

const ROLE_META = {
  admin:         { label: 'Admin',              icon: Shield,          color: '#a5b4fc', dest: '/admin' },
  staff:         { label: 'Staff',              icon: Users2,          color: '#fcd34d', dest: '/admin' },
  mentor:        { label: 'Mentor',             icon: UserCheck,       color: '#a5b4fc', dest: '/mentor' },
  assistantmentor: { label: 'Assistant Mentor',   icon: HeartHandshake,  color: '#6ee7b7', dest: '/assistant-mentor' },
  mentee:        { label: 'Mentee',             icon: Users,           color: '#93c5fd', dest: '/mentee' },
  trainee:       { label: 'Trainee',            icon: BookOpen,        color: '#c4b5fd', dest: '/mentee' },
}

export default function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useRole()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!roles || roles.length === 0) return null

  const current = ROLE_META[activeRole] || ROLE_META.mentee
  const CurrentIcon = current.icon
  const hasMultiple = roles.length > 1

  function switchTo(role) {
    setActiveRole(role)
    setOpen(false)
    const dest = ROLE_META[role]?.dest || '/'
    navigate(dest)
  }

  return (
    <div ref={ref} style={s.wrapper}>
      <button
        style={{ ...s.trigger, ...(hasMultiple ? {} : s.triggerSingle) }}
        onClick={() => hasMultiple && setOpen(v => !v)}
      >
        <CurrentIcon size={14} color={current.color} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={s.label}>
          {current.label}
          {hasMultiple && <span style={s.switchHint}> — Switch</span>}
        </span>
        {hasMultiple && (
          <ChevronDown size={13} color="rgba(156,163,175,0.7)" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 'auto', flexShrink: 0 }} />
        )}
      </button>

      {open && hasMultiple && (
        <div style={s.dropdown}>
          <div style={s.dropdownHeader}>
            <ArrowRightLeft size={11} color="#9ca3af" />
            Switch Dashboard
          </div>
          {roles.map(role => {
            const meta = ROLE_META[role] || { label: role, icon: Shield, color: '#9ca3af', dest: '/' }
            const Icon = meta.icon
            const isActive = role === activeRole
            return (
              <button
                key={role}
                style={{ ...s.option, ...(isActive ? s.optionActive : {}) }}
                onClick={() => switchTo(role)}
              >
                <div style={{ ...s.optionIcon, backgroundColor: isActive ? meta.color + '22' : 'transparent' }}>
                  <Icon size={15} color={isActive ? meta.color : '#9ca3af'} strokeWidth={isActive ? 2.2 : 1.8} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: isActive ? '#111827' : '#6b7280', fontWeight: isActive ? 600 : 500 }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                    {meta.dest === '/admin' ? 'Admin Portal' : meta.dest === '/mentor' ? 'Mentor Dashboard' : meta.dest === '/assistant-mentor' ? 'Assistant Dashboard' : 'Mentee Portal'}
                  </div>
                </div>
                {isActive && <div style={{ ...s.activeDot, backgroundColor: meta.color }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  wrapper: { position: 'relative' },
  trigger: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
    padding: '0.5rem 0.75rem', borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0',
    transition: 'background 0.12s',
  },
  triggerSingle: {
    cursor: 'default',
  },
  label: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  switchHint: { fontWeight: 400, fontSize: '0.75rem', color: 'rgba(156,163,175,0.7)' },
  dropdown: {
    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 9,
    border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    zIndex: 200, overflow: 'hidden',
  },
  dropdownHeader: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 0.85rem', fontSize: '0.68rem', fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid #f3f4f6',
  },
  option: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
    padding: '0.55rem 0.85rem', border: 'none', background: 'none',
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
  },
  optionActive: { backgroundColor: '#f9fafb' },
  optionIcon: { width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activeDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
}
