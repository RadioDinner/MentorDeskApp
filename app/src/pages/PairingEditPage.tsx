import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { PairingStatus } from '../types'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'

interface PairingDetail {
  id: string
  organization_id: string
  status: PairingStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  offering_id: string | null
  mentor: { id: string; first_name: string; last_name: string; email: string }
  mentee: { id: string; first_name: string; last_name: string; email: string }
}

const STATUSES: { value: PairingStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
]

const schema = z.object({
  status: z.enum(['active', 'paused', 'ended']),
  notes:  z.string(),
})

type FormValues = z.infer<typeof schema>

const selectClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'
const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

export default function PairingEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [pairing, setPairing] = useState<PairingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active', notes: '' },
  })

  useEffect(() => {
    if (!id) return

    async function fetchPairing() {
      try {
        const { data, error } = await supabase
          .from('pairings')
          .select(`
            id, organization_id, status, started_at, ended_at, notes, created_at, offering_id,
            mentor:staff!pairings_mentor_id_fkey ( id, first_name, last_name, email ),
            mentee:mentees!pairings_mentee_id_fkey ( id, first_name, last_name, email )
          `)
          .eq('id', id!)
          .single()

        if (error) { setFetchError(error.message); return }

        const a = data as unknown as PairingDetail
        setPairing(a)
        reset({ status: a.status, notes: a.notes ?? '' })
      } catch (err) {
        setFetchError((err as Error).message || 'Failed to load')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPairing()
  }, [id, reset])

  async function onSubmit(values: FormValues) {
    if (!pairing) return

    const updates: Record<string, unknown> = {
      status: values.status,
      notes: values.notes.trim() || null,
    }

    if (values.status === 'ended' && !pairing.ended_at) {
      updates.ended_at = new Date().toISOString()
    }
    if (values.status !== 'ended') {
      updates.ended_at = null
    }

    const { error } = await supabase
      .from('pairings')
      .update(updates)
      .eq('id', pairing.id)

    if (error) {
      reportSupabaseError(error, { component: 'PairingEditPage', action: 'save' })
      toast.error(error.message)
      return
    }

    if (currentUser) {
      await logAudit({
        organization_id: pairing.organization_id,
        actor_id: currentUser.id,
        action: 'updated',
        entity_type: 'pairing',
        entity_id: pairing.id,
        details: {
          status: values.status,
          mentor: `${pairing.mentor.first_name} ${pairing.mentor.last_name}`,
          mentee: `${pairing.mentee.first_name} ${pairing.mentee.last_name}`,
        },
      })
    }
    setPairing({
      ...pairing,
      status: values.status,
      notes: values.notes.trim() || null,
      ended_at: (updates.ended_at as string | null) ?? pairing.ended_at,
    })
    toast.success('Pairing updated.')
  }

  if (loading) return <Skeleton count={5} className="h-11 w-full" gap="gap-3" />

  if (fetchError || !pairing) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Pairing not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/pairings')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Edit Pairing</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Edit */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Pairing Details</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label htmlFor="editStatus" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Status
                </label>
                <select id="editStatus" {...register('status')} className={selectClass}>
                  {STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Notes
                </label>
                <textarea id="editNotes" rows={4} {...register('notes')}
                  placeholder="Optional"
                  className={inputClass + ' resize-none'} />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right — Pairing info */}
        <div className="space-y-6">
          {/* Mentor card */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Mentor</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-600 shrink-0">
                {pairing.mentor.first_name[0]}{pairing.mentor.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {pairing.mentor.first_name} {pairing.mentor.last_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{pairing.mentor.email}</p>
              </div>
            </div>
          </div>

          {/* Mentee card */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Mentee</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-xs font-semibold text-green-600 shrink-0">
                {pairing.mentee.first_name[0]}{pairing.mentee.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {pairing.mentee.first_name} {pairing.mentee.last_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{pairing.mentee.email}</p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Info</p>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p>Started: <span className="font-medium text-gray-700">{formatDate(pairing.started_at)}</span></p>
              {pairing.ended_at && (
                <p>Ended: <span className="font-medium text-gray-700">{formatDate(pairing.ended_at)}</span></p>
              )}
              <p>Created: <span className="font-medium text-gray-700">{formatDate(pairing.created_at)}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
