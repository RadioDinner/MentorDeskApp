import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'

interface PersonOption {
  id: string
  first_name: string
  last_name: string
  email: string
}

const schema = z.object({
  mentorId: z.string().min(1, 'Please select a mentor'),
  menteeId: z.string().min(1, 'Please select a mentee'),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

const selectClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

const errorClass = 'mt-1 text-xs text-red-500'

export default function PairingCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mentors, setMentors] = useState<PersonOption[]>([])
  const [mentees, setMentees] = useState<PersonOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mentorId: '', menteeId: '', notes: '' },
  })

  useEffect(() => {
    if (!profile) return

    async function fetchOptions() {
      try {
        const [mentorRes, menteeRes] = await Promise.all([
          supabase
            .from('staff')
            .select('id, first_name, last_name, email')
            .eq('organization_id', profile!.organization_id)
            .eq('role', 'mentor')
            .order('first_name'),
          supabase
            .from('mentees')
            .select('id, first_name, last_name, email')
            .eq('organization_id', profile!.organization_id)
            .order('first_name'),
        ])

        if (mentorRes.data) setMentors(mentorRes.data)
        if (menteeRes.data) setMentees(menteeRes.data)
      } catch (err) {
      } finally {
        setLoadingOptions(false)
      }
    }

    fetchOptions()
  }, [profile?.organization_id])

  async function onSubmit(values: FormValues) {
    if (!profile) return

    try {
      const { data: inserted, error } = await supabase
        .from('pairings')
        .insert({
          organization_id: profile.organization_id,
          mentor_id: values.mentorId,
          mentee_id: values.menteeId,
          notes: values.notes.trim() || null,
        })
        .select('id')
        .single()

      if (error) { reportSupabaseError(error, { component: 'PairingCreatePage', action: 'create' }); toast.error(error.message); return }

      const mentor = mentors.find(m => m.id === values.mentorId)
      const mentee = mentees.find(m => m.id === values.menteeId)
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'pairing', entity_id: inserted?.id, details: { mentor: mentor ? `${mentor.first_name} ${mentor.last_name}` : values.mentorId, mentee: mentee ? `${mentee.first_name} ${mentee.last_name}` : values.menteeId } })
      navigate('/pairings')
    } catch (err) {
      reportSupabaseError({ message: (err as Error).message || 'Failed to create pairing' }, { component: 'PairingCreatePage', action: 'create' })
      toast.error((err as Error).message || 'Failed to create pairing')
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/pairings')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Pair Mentee to Mentor</h1>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        {loadingOptions ? (
          <Skeleton count={4} className="h-10 w-full" gap="gap-2" />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Mentor select */}
            <div>
              <label htmlFor="mentorSelect" className="block text-sm font-medium text-gray-700 mb-1.5">
                Mentor
              </label>
              {mentors.length === 0 ? (
                <p className="text-sm text-gray-500">No mentors available. <button type="button" onClick={() => navigate('/mentors/new')} className="text-brand hover:underline">Create one first.</button></p>
              ) : (
                <>
                  <select id="mentorSelect" {...register('mentorId')}
                    className={`${selectClass}${errors.mentorId ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}>
                    <option value="">Select a mentor...</option>
                    {mentors.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} ({m.email})
                      </option>
                    ))}
                  </select>
                  {errors.mentorId && <p className={errorClass}>{errors.mentorId.message}</p>}
                </>
              )}
            </div>

            {/* Mentee select */}
            <div>
              <label htmlFor="menteeSelect" className="block text-sm font-medium text-gray-700 mb-1.5">
                Mentee
              </label>
              {mentees.length === 0 ? (
                <p className="text-sm text-gray-500">No mentees available. <button type="button" onClick={() => navigate('/mentees/new')} className="text-brand hover:underline">Create one first.</button></p>
              ) : (
                <>
                  <select id="menteeSelect" {...register('menteeId')}
                    className={`${selectClass}${errors.menteeId ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}>
                    <option value="">Select a mentee...</option>
                    {mentees.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} ({m.email})
                      </option>
                    ))}
                  </select>
                  {errors.menteeId && <p className={errorClass}>{errors.menteeId.message}</p>}
                </>
              )}
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="assignNotes" className="block text-sm font-medium text-gray-700 mb-1.5">
                Notes
              </label>
              <textarea id="assignNotes" rows={3} {...register('notes')}
                placeholder="Optional — any context about this pairing"
                className={inputClass + ' resize-none'} />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting || mentors.length === 0 || mentees.length === 0}>
                {isSubmitting ? 'Pairing…' : 'Create Pairing'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => navigate('/pairings')}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
