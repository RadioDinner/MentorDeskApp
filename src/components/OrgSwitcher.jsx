import { useState, useRef, useEffect } from 'react'
import { useRole } from '../context/RoleContext'
import { ChevronDown, Building2 } from 'lucide-react'

export default function OrgSwitcher() {
  const { organizationId, allUserOrgs, switchOrg } = useRole()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Only show if user belongs to 2+ organizations
  if (!allUserOrgs || allUserOrgs.length < 2) return null

  const currentOrg = allUserOrgs.find(o => o.id === organizationId)

  function handleSwitch(orgId) {
    switchOrg(orgId)
    setOpen(false)
  }

  return (
    <div ref={ref} style={s.wrapper}>
      <button style={s.trigger} onClick={() => setOpen(v => !v)}>
        <Building2 size={13} color="#6366f1" />
        <span style={s.label}>{currentOrg?.name || 'Select org'}</span>
        <ChevronDown size={13} color="#6b7280" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={s.dropdown}>
          <div style={s.dropdownHeader}>Switch Organization</div>
          {allUserOrgs.map(org => {
            const isActive = org.id === organizationId
            return (
              <button
                key={org.id}
                style={{ ...s.option, ...(isActive ? s.optionActive : {}) }}
                onClick={() => handleSwitch(org.id)}
              >
                <Building2 size={14} color={isActive ? '#6366f1' : '#9ca3af'} />
                <span style={{ ...s.optionLabel, color: isActive ? '#111827' : '#6b7280', fontWeight: isActive ? 600 : 500 }}>
                  {org.name}
                </span>
                {isActive && <div style={s.activeDot} />}
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
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.35rem 0.7rem', borderRadius: 6,
    border: '1.5px solid #e5e7eb', background: '#fff',
    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#374151',
    width: '100%',
  },
  label: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' },
  dropdown: {
    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 9,
    border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 200, overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '0.55rem 0.85rem', fontSize: '0.68rem', fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid #f3f4f6',
  },
  option: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
    padding: '0.6rem 0.85rem', border: 'none', background: 'none',
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
  },
  optionActive: { backgroundColor: '#f9fafb' },
  optionLabel: { flex: 1, fontSize: '0.85rem' },
  activeDot: { width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 },
}
