import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestCall } from '../lib/supabase'
import { supabaseRestGet } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'
import type { Canvas, Pairing } from '../types'

interface PairingOption extends Pairing {
  mentor_name: string
  mentee_name: string
}

const schema = z.object({
  pairingId:   z.string().min(1, 'Pick a pairing'),
  title:       z.string().min(1, 'Title is required'),
  description: z.string(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const selectClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'
const errorClass = 'mt-1 text-xs text-red-500'

export default function CanvasCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [pairings, setPairings] = useState<PairingOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { pairingId: '', title: '', description: '' },
  })

  useEffect(() => {
    if (!profile?.organization_id) return
    const orgId = profile.organization_id
    async function load() {
      setLoadingOptions(true)
      try {
        const res = await supabaseRestGet<Pairing & {
          mentor: { first_name: string; last_name: string } | null
          mentee: { first_name: string; last_name: string } | null
        }>(
          'pairings',
          `select=*,mentor:staff!pairings_mentor_id_fkey(first_name,last_name),mentee:mentees!pairings_mentee_id_fkey(first_name,last_name)&organization_id=eq.${orgId}&status=eq.active&order=started_at.desc`,
          { label: 'canvas:create:pairings' },
        )
        if (res.error) {
          toast.error(res.error.message)
          return
        }
        setPairings((res.data ?? []).map(p => ({
          ...p,
          mentor_name: p.mentor ? `${p.mentor.first_name} ${p.mentor.last_name}` : '(unknown mentor)',
          mentee_name: p.mentee ? `${p.mentee.first_name} ${p.mentee.last_name}` : '(unknown mentee)',
        })))
      } finally {
        setLoadingOptions(false)
      }
    }
    load()
  }, [profile?.organization_id])

  async function onSubmit(values: FormValues) {
    if (!profile) return
    const pairing = pairings.find(p => p.id === values.pairingId)
    if (!pairing) { toast.error('Pairing not found'); return }

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null

    const { data, error: err } = await supabaseRestCall('canvases', 'POST', {
      organization_id: profile.organization_id,
      mentor_id: pairing.mentor_id,
      mentee_id: pairing.mentee_id,
      title: values.title.trim(),
      description: values.description.trim() || null,
      content: { notes: [], connectors: [] },
      created_by: profile.id,
      updated_by_uid: uid,
    })
    if (err) {
      reportSupabaseError(err, { component: 'CanvasCreatePage', action: 'create' })
      toast.error(err.message)
      return
    }
    if (!data?.length) return
    const newCanvas = data[0] as unknown as Canvas
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'created',
      entity_type: 'canvas',
      entity_id: newCanvas.id,
      details: { title: newCanvas.title, mentor_id: pairing.mentor_id, mentee_id: pairing.mentee_id },
    })
    toast.success('Canvas created')
    navigate(`/canvases/${newCanvas.id}`)
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/canvases')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back
      </button>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Create Canvas</h1>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        {loadingOptions ? (
          <Skeleton count={4} className="h-11 w-full" gap="gap-3" />
        ) : pairings.length === 0 ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-0.5">No active pairings.</p>
            <p className="text-xs">
              A canvas is shared between a mentor and a mentee on an active pairing.
              Create a pairing first, then come back here.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div>
              <label htmlFor="pairingId" className="block text-sm font-medium text-gray-700 mb-1.5">Pairing</label>
              <select
                id="pairingId"
                {...register('pairingId')}
                className={`${selectClass}${errors.pairingId ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
              >
                <option value="">Choose a pairing…</option>
                {pairings.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.mentor_name} &amp; {p.mentee_name}
                  </option>
                ))}
              </select>
              {errors.pairingId && <p className={errorClass}>{errors.pairingId.message}</p>}
              <p className="text-xs text-gray-400 mt-1">
                Both the mentor and the mentee on the selected pairing will be able to edit this canvas.
              </p>
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input
                id="title"
                type="text"
                placeholder="e.g. Goals brainstorm"
                {...register('title')}
                className={`${inputClass}${errors.title ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
              />
              {errors.title && <p className={errorClass}>{errors.title.message}</p>}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <textarea
                id="description"
                rows={3}
                {...register('description')}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create Canvas'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => navigate('/canvases')}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
