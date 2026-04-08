import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function DebugPanel() {
  const { session, user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [supabaseError, setSupabaseError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  function addLog(msg: string) {
    setLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()} ${msg}`])
  }

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from('organizations').select('id').limit(1)
        if (error) {
          setSupabaseStatus('error')
          setSupabaseError(error.message)
          addLog(`Supabase error: ${error.message}`)
        } else {
          setSupabaseStatus('connected')
          addLog('Supabase connected')
        }
      } catch (err) {
        setSupabaseStatus('error')
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setSupabaseError(msg)
        addLog(`Supabase exception: ${msg}`)
      }
    }
    checkConnection()
  }, [])

  useEffect(() => {
    if (session) addLog(`Session active: ${user?.email}`)
    else addLog('No active session')
  }, [session])

  useEffect(() => {
    if (profile) addLog(`Profile loaded: ${profile.first_name} ${profile.last_name} (${profile.role})`)
  }, [profile])

  // Keyboard shortcut: Ctrl+Shift+D to toggle
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  if (!open) return null

  const statusColor = {
    checking: 'text-yellow-600 bg-yellow-50',
    connected: 'text-green-600 bg-green-50',
    error: 'text-red-600 bg-red-50',
  }[supabaseStatus]

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white border border-gray-300 rounded-md shadow-2xl z-[100] text-xs font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <span className="font-semibold text-gray-700">Debug Panel</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>

      <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
        {/* Connection status */}
        <div>
          <p className="text-gray-500 mb-1">Supabase</p>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
            {supabaseStatus}
          </span>
          {supabaseError && <p className="mt-1 text-red-500">{supabaseError}</p>}
        </div>

        {/* Auth state */}
        <div>
          <p className="text-gray-500 mb-1">Auth</p>
          <p>{session ? `Signed in as ${user?.email}` : 'Not signed in'}</p>
          {session && <p className="text-gray-400">Token expires: {new Date((session.expires_at ?? 0) * 1000).toLocaleString()}</p>}
        </div>

        {/* Profile */}
        <div>
          <p className="text-gray-500 mb-1">Profile</p>
          {profile ? (
            <div className="text-gray-600">
              <p>{profile.first_name} {profile.last_name}</p>
              <p>Role: {profile.role} | Org: {profile.organization_id.slice(0, 8)}…</p>
              <p>Staff ID: {profile.id.slice(0, 8)}…</p>
              <p>User ID: {profile.user_id?.slice(0, 8) ?? 'null'}…</p>
            </div>
          ) : (
            <p className="text-gray-400">No profile loaded</p>
          )}
        </div>

        {/* Log */}
        <div>
          <p className="text-gray-500 mb-1">Log</p>
          <div className="bg-gray-900 text-green-400 rounded p-2 max-h-32 overflow-y-auto">
            {logs.length === 0 && <p className="text-gray-600">No logs yet</p>}
            {logs.map((log, i) => (
              <p key={i}>{log}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 rounded-b-xl text-gray-400">
        Ctrl+Shift+D to close
      </div>
    </div>
  )
}
