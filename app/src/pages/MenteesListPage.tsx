import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Mentee } from '../types'

export default function MenteesListPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return

    async function fetchMentees() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('mentees')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('first_name', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setMentees(data as Mentee[])
      setLoading(false)
    }

    fetchMentees()
  }, [profile?.organization_id])

  async function archiveMentee(id: string) {
    if (!profile) return
    const now = new Date().toISOString()
    const { error: e } = await supabase.from('mentees').update({ archived_at: now }).eq('id', id)
    if (e) return
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: now } : m))
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'archived', entity_type: 'mentee', entity_id: id })
  }

  async function unarchiveMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').update({ archived_at: null }).eq('id', id)
    if (e) return
    setMentees(ms => ms.map(m => m.id === id ? { ...m, archived_at: null } : m))
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'unarchived', entity_type: 'mentee', entity_id: id })
  }

  async function deleteMentee(id: string) {
    if (!profile) return
    const { error: e } = await supabase.from('mentees').delete().eq('id', id)
    if (e) return
    setMentees(ms => ms.filter(m => m.id !== id))
    setConfirmDelete(null)
    logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'deleted', entity_type: 'mentee', entity_id: id })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  if (error) {
    return (
      <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load mentees: {error}
      </div>
    )
  }

  const activeMentees = mentees.filter(m => !m.archived_at)
  const archivedMentees = mentees.filter(m => m.archived_at)
  const displayMentees = showArchived ? mentees : activeMentees

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Mentees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeMentees.length} active{archivedMentees.length > 0 ? `, ${archivedMentees.length} archived` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {archivedMentees.length > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                showArchived
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedMentees.length})`}
            </button>
          )}
          <button
            onClick={() => navigate('/mentees/new')}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition"
          >
            + Create Mentee Account
          </button>
        </div>
      </div>

      {displayMentees.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No mentees found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
          {displayMentees.map(mentee => {
            const isArchived = !!mentee.archived_at
            const isConfirming = confirmDelete === mentee.id

            return (
              <div key={mentee.id} className={`flex items-center justify-between px-5 py-4 ${isArchived ? 'bg-gray-50/50' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    isArchived ? 'bg-gray-200 text-gray-400' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {mentee.first_name[0]}{mentee.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
                        {mentee.first_name} {mentee.last_name}
                      </p>
                      {isArchived && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium shrink-0">Archived</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{mentee.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isArchived ? (
                    <>
                      <button
                        onClick={() => unarchiveMentee(mentee.id)}
                        className="px-3 py-1.5 text-xs font-medium text-brand border border-gray-200 rounded hover:bg-brand-light transition-colors"
                      >
                        Restore
                      </button>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => deleteMentee(mentee.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(mentee.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate(`/mentees/${mentee.id}/edit`)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => archiveMentee(mentee.id)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                        title="Archive"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
