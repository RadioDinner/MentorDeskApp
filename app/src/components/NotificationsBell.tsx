import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchRecentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from '../lib/notifications'
import type { Notification } from '../types'

const CATEGORY_DOT: Record<string, string> = {
  automation: 'bg-orange-400',
  task:       'bg-amber-400',
  meeting:    'bg-rose-400',
  billing:    'bg-sky-400',
  system:     'bg-gray-400',
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60)  return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Topbar bell: unread badge + popover panel. One instance app-wide.
 *  Auto-refreshes on open and polls every 60s while mounted so the badge
 *  stays fresh even when the user is working elsewhere. */
export default function NotificationsBell() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user?.id ?? null

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setNotifications(await fetchRecentNotifications(userId, 30))
    setLoading(false)
  }, [userId])

  // Initial fetch + polling.
  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Refresh when the panel opens so unread count is current.
  useEffect(() => { if (open) load() }, [open, load])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleClick(n: Notification) {
    if (!n.read_at) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      await markNotificationRead(n.id)
    }
    if (n.link) {
      setOpen(false)
      navigate(n.link)
    }
  }

  async function handleMarkAllRead() {
    if (!userId) return
    setBusy(true)
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    await markAllNotificationsRead(userId)
    setBusy(false)
  }

  async function handleDismiss(e: React.MouseEvent, n: Notification) {
    e.stopPropagation()
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    await dismissNotification(n.id)
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7A6.75 6.75 0 005.25 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m6.464 0a3.001 3.001 0 01-6.464 0m6.464 0a24.255 24.255 0 01-6.464 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-md shadow-lg border border-gray-200 overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={busy}
                className="text-xs font-medium text-brand hover:text-brand-hover transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">Loading…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">No notifications.</p>
                <p className="text-xs text-gray-400 mt-1">You're all caught up.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map(n => {
                  const dotClass = CATEGORY_DOT[n.category] ?? CATEGORY_DOT.system
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors group ${
                        n.read_at ? 'bg-white hover:bg-gray-50' : 'bg-brand-light/40 hover:bg-brand-light/60'
                      }`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`text-sm truncate ${n.read_at ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{timeAgo(n.created_at)}</span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={e => handleDismiss(e, n)}
                        className="text-gray-300 hover:text-rose-500 shrink-0 text-lg leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Dismiss"
                        aria-label="Dismiss notification"
                      >
                        ×
                      </button>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
