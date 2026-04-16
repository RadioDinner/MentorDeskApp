import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabaseRestCall } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useToast } from '../context/ToastContext'
import Button from '../components/ui/Button'
import { createStartNode, WORKSPACE_SIZE, GRID_SIZE, snapToGrid } from '../lib/journeyFlow'
import type { JourneyFlow } from '../types'

const schema = z.object({
  name:        z.string().min(1, 'Name is required'),
  description: z.string(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const errorClass = 'mt-1 text-xs text-red-500'

export default function JourneyCreatePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  async function onSubmit(values: FormValues) {
    if (!profile) return

    // Every new flow starts with a single start node in the middle-left
    // of the workspace. Block 7+ renders / drags / connects everything
    // downstream from here.
    const startNode = createStartNode(
      snapToGrid(Math.round(WORKSPACE_SIZE.width / 2) - 70),
      snapToGrid(GRID_SIZE * 2),
    )

    const { data, error: err } = await supabaseRestCall('journey_flows', 'POST', {
      organization_id: profile.organization_id,
      name: values.name.trim(),
      description: values.description.trim() || null,
      content: { nodes: [startNode], connectors: [] },
    })
    if (err) {
      reportSupabaseError(err, { component: 'FlowCreatePage', action: 'create' })
      toast.error(err.message)
      return
    }
    if (!data?.length) return
    const newFlow = data[0] as unknown as JourneyFlow
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'created',
      entity_type: 'journey_flow',
      entity_id: newFlow.id,
      details: { name: newFlow.name },
    })
    toast.success('Journey created')
    navigate(`/journeys/${newFlow.id}`)
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/journeys')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back
      </button>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Create Journey</h1>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              id="name"
              type="text"
              placeholder="e.g. General Journey"
              {...register('name')}
              className={`${inputClass}${errors.name ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`}
            />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
            <textarea
              id="description"
              rows={3}
              placeholder="What is this journey for? Who is it meant to guide?"
              {...register('description')}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Journey'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => navigate('/journeys')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
