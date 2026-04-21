import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import type {
  Automation, AutomationTriggerType, AutomationAction, AutomationActionType,
  AutomationTriggerConfig, Offering,
} from '../types'

const TRIGGERS: { value: AutomationTriggerType; label: string; desc: string }[] = [
  { value: 'manual',             label: 'Manual / linked from a journey', desc: "Doesn't fire on its own. Use from a journey decision or by explicit invocation." },
  { value: 'lesson_completed',   label: 'Lesson completed',   desc: 'Fires each time a mentee completes any lesson.' },
  { value: 'lesson_reached',     label: 'Lesson reached',     desc: 'Fires when a mentee starts a specific lesson.' },
  { value: 'course_completed',   label: 'Course completed',   desc: 'Fires when a mentee finishes every lesson in a course.' },
  { value: 'course_started',     label: 'Course started',     desc: 'Fires when a mentee is assigned to a course.' },
  { value: 'meeting_scheduled',  label: 'Meeting scheduled',  desc: 'Fires when a meeting is booked.' },
  { value: 'meeting_completed',  label: 'Meeting completed',  desc: 'Fires when a meeting is marked complete.' },
  { value: 'meeting_cancelled',  label: 'Meeting cancelled',  desc: 'Fires when a meeting is cancelled.' },
]

const ACTION_TYPES: { value: AutomationActionType; label: string }[] = [
  { value: 'create_task',       label: 'Create task' },
  { value: 'send_notification', label: 'Send notification' },
  { value: 'send_email',        label: 'Send email (coming soon)' },
]

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

function defaultAction(type: AutomationActionType): AutomationAction {
  if (type === 'create_task') return { type, title: '', assignee: 'owner', body: null, due_days_offset: null, urgency: 'normal' }
  if (type === 'send_email')  return { type, to: 'owner', subject: '', body: '' }
  return { type: 'send_notification', to: 'owner', title: '', body: null }
}

export default function AutomationEditPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [courses, setCourses] = useState<Offering[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('course_completed')
  const [triggerConfig, setTriggerConfig] = useState<AutomationTriggerConfig>({})
  const [actions, setActions] = useState<AutomationAction[]>([defaultAction('create_task')])

  useLoadingGuard(loading, useCallback(() => setLoading(false), []))

  // Load courses for the course-scoped trigger pickers.
  useEffect(() => {
    if (!profile) return
    supabase
      .from('offerings')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('type', 'course')
      .order('name', { ascending: true })
      .limit(500)
      .then(({ data }) => setCourses((data ?? []) as Offering[]))
  }, [profile?.organization_id])

  // Load existing automation.
  useEffect(() => {
    if (isNew || !profile) return
    supabase.from('automations').select('*').eq('id', id!).single().then(({ data, error }) => {
      if (error || !data) { toast.error(error?.message ?? 'Not found'); setLoading(false); return }
      const a = data as Automation
      setName(a.name)
      setDescription(a.description ?? '')
      setEnabled(a.enabled)
      setTriggerType(a.trigger_type)
      setTriggerConfig(a.trigger_config ?? {})
      setActions((a.actions ?? []).length > 0 ? a.actions : [defaultAction('create_task')])
      setLoading(false)
    })
  }, [id, isNew, profile?.organization_id])

  const isCourseScoped = triggerType.startsWith('course_') || triggerType.startsWith('lesson_')

  async function save() {
    if (!profile) return
    if (!name.trim()) { toast.error('Name is required.'); return }
    if (actions.length === 0) { toast.error('Add at least one action.'); return }
    setSaving(true)
    try {
      const payload = {
        organization_id: profile.organization_id,
        owner_id: profile.id,
        name: name.trim(),
        description: description.trim() || null,
        enabled,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        actions,
        updated_at: new Date().toISOString(),
      }

      if (isNew) {
        const { data, error } = await supabase.from('automations').insert(payload).select().single()
        if (error) { toast.error(error.message); return }
        toast.success('Automation created.')
        navigate(`/automations/${(data as Automation).id}`, { replace: true })
      } else {
        const { error } = await supabase.from('automations').update(payload).eq('id', id!)
        if (error) { toast.error(error.message); return }
        toast.success('Automation saved.')
      }
    } finally { setSaving(false) }
  }

  function addAction(type: AutomationActionType) {
    setActions(prev => [...prev, defaultAction(type)])
  }
  function updateAction(i: number, patch: Partial<AutomationAction>) {
    setActions(prev => prev.map((a, idx) => idx === i ? ({ ...a, ...patch } as AutomationAction) : a))
  }
  function removeAction(i: number) {
    setActions(prev => prev.filter((_, idx) => idx !== i))
  }
  function moveAction(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= actions.length) return
    setActions(prev => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  if (loading) return <Skeleton count={5} className="h-11 w-full" gap="gap-3" />

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/automations')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back</button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{isNew ? 'New automation' : name || 'Automation'}</h1>
          <p className="text-xs text-gray-500">Fire actions when something happens.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basics */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. Follow up after Onboarding" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className={inputClass + ' resize-none'} placeholder="Note for other staff about what this automation does." />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-gray-700">Enabled</span>
            </label>
          </div>
        </div>

        {/* Trigger */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">When this happens</h2>
          <select
            value={triggerType}
            onChange={e => { setTriggerType(e.target.value as AutomationTriggerType); setTriggerConfig({}) }}
            className={inputClass + ' bg-white'}
          >
            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-2">{TRIGGERS.find(t => t.value === triggerType)?.desc}</p>

          {isCourseScoped && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">For course (optional)</label>
              <select
                value={triggerConfig.course_id ?? ''}
                onChange={e => setTriggerConfig(c => ({ ...c, course_id: e.target.value || null }))}
                className={inputClass + ' bg-white'}
              >
                <option value="">Any course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Leave as "Any course" to fire for every course.</p>
            </div>
          )}

          {triggerType === 'lesson_reached' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Lesson number (1-based)</label>
              <input
                type="number" min="1"
                value={triggerConfig.lesson_index != null ? String(triggerConfig.lesson_index + 1) : ''}
                onChange={e => {
                  const n = parseInt(e.target.value)
                  setTriggerConfig(c => ({ ...c, lesson_index: Number.isInteger(n) && n > 0 ? n - 1 : null }))
                }}
                className={inputClass + ' max-w-28'}
                placeholder="e.g. 5"
              />
              <p className="text-[11px] text-gray-400 mt-1">Counting from 1. Fires when the mentee opens this lesson.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Do this</h2>
            <div className="flex items-center gap-1.5">
              {ACTION_TYPES.map(at => (
                <button
                  key={at.value}
                  type="button"
                  onClick={() => addAction(at.value)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  + {at.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {actions.map((a, i) => (
              <ActionStep
                key={i}
                action={a}
                index={i}
                isLast={i === actions.length - 1}
                onChange={patch => updateAction(i, patch)}
                onRemove={() => removeAction(i)}
                onMoveUp={() => moveAction(i, -1)}
                onMoveDown={() => moveAction(i, 1)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : (isNew ? 'Create automation' : 'Save changes')}</Button>
        </div>
      </div>
    </div>
  )
}

function ActionStep({
  action, index, isLast, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  action: AutomationAction
  index: number
  isLast: boolean
  onChange: (patch: Partial<AutomationAction>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="rounded-md border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wider">Step {index + 1}</span>
        <span className="text-sm font-medium text-gray-900">
          {action.type === 'create_task' && 'Create task'}
          {action.type === 'send_email' && 'Send email'}
          {action.type === 'send_notification' && 'Send notification'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={index === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default">↑</button>
          <button type="button" onClick={onMoveDown} disabled={isLast} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default">↓</button>
          <button type="button" onClick={onRemove} className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors ml-2">Remove</button>
        </div>
      </div>

      {action.type === 'create_task' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task title</label>
            <input type="text" value={action.title} onChange={e => onChange({ title: e.target.value } as Partial<AutomationAction>)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea rows={2} value={action.body ?? ''} onChange={e => onChange({ body: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' resize-none'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assign to</label>
              <select value={action.assignee} onChange={e => onChange({ assignee: e.target.value as 'owner' | 'mentor_of_mentee' } as Partial<AutomationAction>)} className={inputClass + ' bg-white'}>
                <option value="owner">Me (automation owner)</option>
                <option value="mentor_of_mentee">Mentee's current mentor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due in (days)</label>
              <input type="number" min="0" value={action.due_days_offset ?? ''} onChange={e => {
                const n = parseInt(e.target.value)
                onChange({ due_days_offset: Number.isInteger(n) && n >= 0 ? n : null } as Partial<AutomationAction>)
              }} className={inputClass} placeholder="—" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select value={action.urgency ?? 'normal'} onChange={e => onChange({ urgency: e.target.value as 'normal' | 'urgent' } as Partial<AutomationAction>)} className={inputClass + ' bg-white'}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {action.type === 'send_email' && (
        <div className="space-y-3">
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Email delivery isn't configured yet, so this step will be saved and logged as "skipped" when fired.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
            <input type="text" value={action.subject} onChange={e => onChange({ subject: e.target.value } as Partial<AutomationAction>)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
            <textarea rows={3} value={action.body} onChange={e => onChange({ body: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' resize-none'} />
          </div>
        </div>
      )}

      {action.type === 'send_notification' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Send to</label>
              <select
                value={action.to}
                onChange={e => onChange({ to: e.target.value as 'owner' | 'mentee' } as Partial<AutomationAction>)}
                className={inputClass + ' bg-white'}
              >
                <option value="owner">Me (automation owner)</option>
                <option value="mentee">The mentee</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input type="text" value={action.title} onChange={e => onChange({ title: e.target.value } as Partial<AutomationAction>)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Body (optional)</label>
            <textarea rows={2} value={action.body ?? ''} onChange={e => onChange({ body: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' resize-none'} />
          </div>
          <p className="text-[11px] text-gray-400">The recipient sees this on their dashboard as a clickable notification card.</p>
        </div>
      )}
    </div>
  )
}
