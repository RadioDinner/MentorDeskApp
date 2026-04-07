import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

interface AuditRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown> | null
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

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return ''
  const parts: string[] = []
  if (details.name) parts.push(String(details.name))
  if (details.type) parts.push(String(details.type))
  if (details.role) parts.push(`role: ${details.role}`)
  if (details.fields) parts.push(`fields: ${details.fields}`)
  if (details.pay_type) parts.push(`pay: ${details.pay_type}`)
  if (details.status) parts.push(`status: ${details.status}`)
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

  // Filters
  const [filterActor, setFilterActor] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    if (!profile) return

    async function loadStaff() {
      const { data } = await supabase
        .from('staff')
        .select('id, first_name, last_name')
        .eq('organization_id', profile!.organization_id)
        .order('first_name')
      if (data) setStaffOptions(data)
    }

    loadStaff()
  }, [profile])

  useEffect(() => {
    if (!profile) return

    async function fetchLog() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('audit_log')
        .select(`
          id, action, entity_type, entity_id, details, created_at,
          actor:staff!audit_log_actor_id_fkey ( id, first_name, last_name )
        `)
        .eq('organization_id', profile!.organization_id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterActor) {
        query = query.eq('actor_id', filterActor)
      }
      if (filterType) {
        query = query.eq('entity_type', filterType)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setEntries(data as unknown as AuditRow[])
      setLoading(false)
    }

    fetchLog()
  }, [profile, filterActor, filterType])

  const selectClass =
    'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">User</label>
          <select
            value={filterActor}
            onChange={e => setFilterActor(e.target.value)}
            className={selectClass}
          >
            <option value="">All users</option>
            {staffOptions.map(s => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Type</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {(filterActor || filterType) && (
          <button
            onClick={() => { setFilterActor(''); setFilterType('') }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
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
        <div className="bg-white rounded-md border border-gray-200/80">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">When</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Who</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Action</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.id} className={i < entries.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {entry.actor ? `${entry.actor.first_name} ${entry.actor.last_name}` : 'System'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      entry.action === 'created' ? 'bg-green-50 text-green-700' :
                      entry.action === 'deleted' ? 'bg-red-50 text-red-700' :
                      'bg-blue-50 text-blue-700'
                    }`}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ENTITY_TYPE_LABELS[entry.entity_type] ?? entry.entity_type}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                    {formatDetails(entry.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
