import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Topbar() {
  const { profile, signOut } = useAuth()
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

  return (
    <header className="h-12 shrink-0 flex items-center justify-end px-6 bg-white border-b border-gray-200">
      {profile && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-semibold text-brand">
              {profile.first_name[0]}{profile.last_name[0]}
            </div>
            <span className="text-sm text-gray-700">{profile.first_name} {profile.last_name}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
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
      )}
    </header>
  )
}
