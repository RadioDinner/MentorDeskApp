import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchRecentNotifications, markNotificationRead, markAllNotificationsRead, dismissNotification } from '../lib/notifications'
import type { Notification } from '../types'

interface Props {
  /** Max number of notifications to show inline. Extras are hidden. */
  limit?: number
}

const CATEGORY_DOT: Record<string, string> = {
  automation: 'bg-orange-400',
  task:       'bg-amber-400',
  meeting:    'bg-rose-400',
  billing:    'bg-sky-400',
  system:     'bg-gray-400',
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60)        return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)        return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)         return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)         return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationsWidget({ limit = 5 }: Props) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user?.id ?? null

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setNotifications(await fetchRecentNotifications(userId, 20))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleClick(n: Notification) {
    if (!n.read_at) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      await markNotificationRead(n.id)
    }
    if (n.link) navigate(n.link)
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
  const visible = notifications.slice(0, limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notifications</h3>
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

      {loading ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-xs text-gray-400">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-6 text-center">
          <p className="text-sm text-gray-500">No notifications.</p>
          <p className="text-xs text-gray-400 mt-1">You're all caught up.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100 overflow-hidden">
          {visible.map(n => {
            const dotClass = CATEGORY_DOT[n.category] ?? CATEGORY_DOT.system
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors group ${
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
          {notifications.length > limit && (
            <div className="px-5 py-2 text-center">
              <p className="text-[11px] text-gray-400">
                + {notifications.length - limit} more
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
