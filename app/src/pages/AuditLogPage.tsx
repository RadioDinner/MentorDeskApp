import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit, revertAuditEntry } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'

interface AuditRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown> | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
  actor: { id: string; first_name: string; last_name: string } | null
}

interface StaffOption {
  id: string
  first_name: string
  last_name: string
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  staff: 'Staff',
  mentee: 'Mentee',
  offering: 'Offering',
  pairing: 'Pairing',
  organization: 'Organization',
}

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  created: { bg: 'bg-green-50', text: 'text-green-700', label: 'Created' },
  updated: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Updated' },
  deleted: { bg: 'bg-red-50', text: 'text-red-700', label: 'Deleted' },
  archived: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Archived' },
  unarchived: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Restored' },
  deactivated: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'De-activated' },
  reactivated: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Re-activated' },
  reverted: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Reverted' },
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('Cents', '')
    .replace('Url', 'URL')
    .replace('Id', 'ID')
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'number') return String(val)
  const s = String(val)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return ''
  const parts: string[] = []
  if (details.name) parts.push(String(details.name))
  if (details.type) parts.push(String(details.type))
  if (details.role) parts.push(`role: ${details.role}`)
  if (details.fields) parts.push(`fields: ${details.fields}`)
  if (details.section) parts.push(`section: ${details.section}`)
  if (details.mentor) parts.push(`mentor: ${details.mentor}`)
  if (details.mentee) parts.push(`mentee: ${details.mentee}`)
  if (details.self) parts.push('self-update')
  return parts.join(' · ')
}

export default function AuditLogPage() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<AuditRow[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reverting, setReverting] = useState<string | null>(null)
  const [revertMsg, setRevertMsg] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. Please refresh the page.')
  }, []))

  // Filters
  const [filterActor, setFilterActor] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    if (!profile) return

    async function loadStaff() {
      try {
        const { data } = await supabase
          .from('staff')
          .select('id, first_name, last_name')
          .eq('organization_id', profile!.organization_id)
          .order('first_name')
        if (data) setStaffOptions(data)
      } catch (err) {
        console.error(err)
      }
    }

    loadStaff()
  }, [profile?.organization_id])

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[AuditLogPage] No profile.organization_id — profile:', profile); setLoading(false); return }

    async function fetchLog() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('audit_log')
          .select(`
            id, action, entity_type, entity_id, details, old_values, new_values, created_at,
            actor:staff!audit_log_actor_id_fkey ( id, first_name, last_name )
          `)
          .eq('organization_id', profile!.organization_id)
          .order('created_at', { ascending: false })
          .limit(200)

        if (filterActor) query = query.eq('actor_id', filterActor)
        if (filterType) query = query.eq('entity_type', filterType)

        const { data, error: fetchError } = await query
        if (fetchError) { setError(fetchError.message); return }
        setEntries(data as unknown as AuditRow[])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchLog()
  }, [profile?.organization_id, filterActor, filterType])

  async function handleRevert(entry: AuditRow) {
    if (!profile || !entry.old_values || !entry.entity_id) return
    setReverting(entry.id)
    setRevertMsg(null)

    const result = await revertAuditEntry({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      old_values: entry.old_values,
    })

    if (result.success) {
      // Log the revert itself
      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: 'reverted',
        entity_type: entry.entity_type as 'staff' | 'mentee' | 'offering' | 'pairing' | 'organization',
        entity_id: entry.entity_id ?? undefined,
        details: { reverted_audit_id: entry.id },
        old_values: entry.new_values,
        new_values: entry.old_values,
      })
      setRevertMsg({ id: entry.id, type: 'success', text: 'Change reverted successfully.' })
    } else {
      setRevertMsg({ id: entry.id, type: 'error', text: result.error || 'Revert failed.' })
    }
    setReverting(null)
  }

  const selectClass =
    'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">User</label>
          <select value={filterActor} onChange={e => setFilterActor(e.target.value)} className={selectClass}>
            <option value="">All users</option>
            {staffOptions.map(s => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectClass}>
            <option value="">All types</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {(filterActor || filterType) && (
          <button onClick={() => { setFilterActor(''); setFilterType('') }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="rounded border bg-red-50 border-red-200 px-3 py-2.5 text-sm text-red-700">
          Failed to load audit log: {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No audit entries found.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => {
            const style = ACTION_STYLES[entry.action] ?? { bg: 'bg-gray-50', text: 'text-gray-700', label: entry.action }
            const isExpanded = expandedId === entry.id
            const hasChanges = entry.old_values || entry.new_values
            const canRevert = isAdmin && entry.action === 'updated' && entry.old_values && entry.entity_id
            const changedKeys = getChangedKeys(entry.old_values, entry.new_values)

            return (
              <div key={entry.id} className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
                {/* Row */}
                <div
                  className={`flex items-center gap-4 px-4 py-3 ${hasChanges ? 'cursor-pointer hover:bg-gray-50/50' : ''}`}
                  onClick={() => hasChanges && setExpandedId(isExpanded ? null : entry.id)}
                >
                  {/* Timestamp */}
                  <div className="text-xs text-gray-400 w-28 shrink-0">
                    {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>

                  {/* Actor */}
                  <div className="text-sm text-gray-900 w-36 truncate shrink-0">
                    {entry.actor ? `${entry.actor.first_name} ${entry.actor.last_name}` : 'System'}
                  </div>

                  {/* Action badge */}
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} shrink-0`}>
                    {style.label}
                  </span>

                  {/* Entity type */}
                  <span className="text-sm text-gray-600 w-24 shrink-0">
                    {ENTITY_TYPE_LABELS[entry.entity_type] ?? entry.entity_type}
                  </span>

                  {/* Summary */}
                  <span className="text-xs text-gray-500 truncate flex-1">
                    {changedKeys.length > 0
                      ? changedKeys.map(k => formatFieldName(k)).join(', ')
                      : formatDetails(entry.details)}
                  </span>

                  {/* Expand indicator */}
                  {hasChanges && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  )}
                </div>

                {/* Expanded diff + undo */}
                {isExpanded && hasChanges && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                    {/* Diff table */}
                    <table className="w-full text-xs mb-3">
                      <thead>
                        <tr className="text-left">
                          <th className="py-1 pr-4 font-semibold text-gray-400 uppercase tracking-wider w-1/4">Field</th>
                          <th className="py-1 pr-4 font-semibold text-red-400 uppercase tracking-wider w-5/16">Old Value</th>
                          <th className="py-1 font-semibold text-green-500 uppercase tracking-wider w-5/16">New Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedKeys.map(key => (
                          <tr key={key} className="border-t border-gray-100">
                            <td className="py-1.5 pr-4 font-medium text-gray-700">{formatFieldName(key)}</td>
                            <td className="py-1.5 pr-4">
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                                {formatValue(entry.old_values?.[key])}
                              </span>
                            </td>
                            <td className="py-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                                {formatValue(entry.new_values?.[key])}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {changedKeys.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-2 text-gray-400 italic">No field-level changes recorded</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Revert message */}
                    {revertMsg && revertMsg.id === entry.id && (
                      <div className={`flex items-center gap-2 rounded border px-3 py-2 text-xs mb-2 ${
                        revertMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        <span>{revertMsg.type === 'success' ? '✓' : '✗'}</span>
                        {revertMsg.text}
                      </div>
                    )}

                    {/* Undo button — admin only, only for updates with old_values */}
                    {canRevert && (
                      <button
                        type="button"
                        disabled={reverting === entry.id}
                        onClick={e => { e.stopPropagation(); handleRevert(entry) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {reverting === entry.id ? 'Reverting…' : '↩ Undo this change'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Get keys where old and new values differ */
function getChangedKeys(
  oldVals: Record<string, unknown> | null,
  newVals: Record<string, unknown> | null
): string[] {
  if (!oldVals && !newVals) return []
  const allKeys = new Set([
    ...Object.keys(oldVals ?? {}),
    ...Object.keys(newVals ?? {}),
  ])
  const changed: string[] = []
  for (const key of allKeys) {
    const o = oldVals?.[key]
    const n = newVals?.[key]
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      changed.push(key)
    }
  }
  return changed
}
