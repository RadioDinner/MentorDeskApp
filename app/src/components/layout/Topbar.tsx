import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  admin:             { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  staff:             { bg: 'bg-slate-50',  text: 'text-slate-700',  dot: 'bg-slate-400' },
  mentor:            { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  assistant_mentor:  { bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-400' },
  mentee:            { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400' },
}

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }
}

interface TopbarProps {
  onMenuClick?: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { profile, signOut, allProfiles, activeProfileId, isMenteeMode, switchProfile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!profile) return <header className="h-12 shrink-0 bg-white border-b border-gray-200" />

  const activeProfile = allProfiles.find(p => p.id === activeProfileId)
  const activeRole = activeProfile?.role ?? profile.role
  const activeLabel = activeProfile?.label ?? profile.role
  const roleStyle = getRoleStyle(activeRole)
  const hasMultipleProfiles = allProfiles.length > 1

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 lg:px-6 bg-white border-b border-gray-200">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Open navigation"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-semibold text-brand">
            {profile.first_name[0]}{profile.last_name[0]}
          </div>
          <span className="text-sm text-gray-700">{profile.first_name} {profile.last_name}</span>
          {/* Active role badge */}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleStyle.bg} ${roleStyle.text}`}>
            {isMenteeMode ? 'Mentee' : activeLabel}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            {/* Account switcher — only show if multiple profiles */}
            {hasMultipleProfiles && (
              <>
                <div className="px-3 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Switch Account</p>
                </div>
                {allProfiles.map(p => {
                  const isActive = p.id === activeProfileId
                  const style = getRoleStyle(p.role)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        switchProfile(p.id)
                        setOpen(false)
                        navigate('/dashboard')
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        isActive ? 'bg-brand-light' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                      <span className={`text-sm flex-1 ${isActive ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                        {p.label}
                      </span>
                      {isActive && (
                        <svg className="w-3.5 h-3.5 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
                <hr className="my-1 border-gray-100" />
              </>
            )}

            <button
              onClick={() => { setOpen(false); navigate('/profile') }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Profile Settings
            </button>
            <hr className="my-1 border-gray-100" />
            <button
              onClick={() => { setOpen(false); signOut() }}
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
