import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Button from './ui/Button'
import { Modal } from './ui'
import DynamicFieldsButton from './DynamicFieldsButton'
import type { Automation, AutomationAction, AutomationActionType } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  /** Called with the newly created automation so the caller can auto-select
   *  it in whatever dropdown triggered this modal. */
  onCreated: (automation: Automation) => void
  /** Default name prefill (e.g. derived from the calling context). */
  defaultName?: string
  /** Controls the first step prefilled in the modal. Defaults to 'send_notification'
   *  which is the common case from the journey "on reach" dropdown. */
  defaultActionType?: AutomationActionType
}

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

function defaultAction(type: AutomationActionType): AutomationAction {
  if (type === 'create_task')       return { type, title: '', assignee: 'owner', body: null, due_days_offset: null, urgency: 'normal' }
  if (type === 'send_notification') return { type, to: 'owner', title: '', body: null }
  return { type: 'send_email', to: 'owner', subject: '', body: '' }
}

export default function QuickCreateAutomationModal({ open, onClose, onCreated, defaultName, defaultActionType = 'send_notification' }: Props) {
  const { profile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(defaultName ?? '')
  const [actions, setActions] = useState<AutomationAction[]>([defaultAction(defaultActionType)])
  const [saving, setSaving] = useState(false)

  // Reset when opened so each invocation starts fresh.
  function handleEnter() {
    setName(defaultName ?? '')
    setActions([defaultAction(defaultActionType)])
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

  async function handleSave() {
    if (!profile) return
    if (!name.trim()) { toast.error('Name is required.'); return }
    if (actions.length === 0) { toast.error('Add at least one action.'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('automations').insert({
        organization_id: profile.organization_id,
        owner_id: profile.id,
        name: name.trim(),
        enabled: true,
        trigger_type: 'manual',
        trigger_config: {},
        actions,
      }).select().single()
      if (error || !data) { toast.error(error?.message ?? 'Failed to create automation'); return }
      toast.success('Automation created.')
      onCreated(data as Automation)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create automation"
      subtitle="Only fires when linked from a journey or called directly. Won't run on any global trigger."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded border border-gray-200 transition-colors">
            Cancel
          </button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
        </div>
      }
    >
      <div onTransitionEnd={handleEnter} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. Notify me when a discovery call finishes" autoFocus />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Actions</label>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => addAction('send_notification')} className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">+ Notification</button>
              <button type="button" onClick={() => addAction('create_task')}       className="px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">+ Task</button>
            </div>
          </div>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <ActionCard key={i} action={a} index={i} onChange={patch => updateAction(i, patch)} onRemove={() => removeAction(i)} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ActionCard({ action, index, onChange, onRemove }: {
  action: AutomationAction
  index: number
  onChange: (patch: Partial<AutomationAction>) => void
  onRemove: () => void
}) {
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2.5 bg-gray-50/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Step {index + 1} ·{' '}
          {action.type === 'create_task' ? 'Create task'
          : action.type === 'send_notification' ? 'Send notification'
          : 'Send email'}
        </span>
        <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-rose-500 transition-colors">Remove</button>
      </div>

      {action.type === 'create_task' && (
        <div className="space-y-2">
          <div className="relative">
            <input ref={titleRef} type="text" placeholder="Task title" value={action.title} onChange={e => onChange({ title: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' pr-20'} />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <DynamicFieldsButton targetRef={titleRef} onInsert={(v) => onChange({ title: v } as Partial<AutomationAction>)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={action.assignee} onChange={e => onChange({ assignee: e.target.value as 'owner' | 'mentor_of_mentee' } as Partial<AutomationAction>)} className={inputClass + ' bg-white'}>
              <option value="owner">Me (automation owner)</option>
              <option value="mentor_of_mentee">Mentee's mentor</option>
            </select>
            <select value={action.urgency ?? 'normal'} onChange={e => onChange({ urgency: e.target.value as 'normal' | 'urgent' } as Partial<AutomationAction>)} className={inputClass + ' bg-white'}>
              <option value="normal">Normal priority</option>
              <option value="urgent">Urgent priority</option>
            </select>
          </div>
        </div>
      )}

      {action.type === 'send_notification' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={action.to} onChange={e => onChange({ to: e.target.value as 'owner' | 'mentee' } as Partial<AutomationAction>)} className={inputClass + ' bg-white'}>
              <option value="owner">Me (automation owner)</option>
              <option value="mentee">The mentee</option>
            </select>
          </div>
          <div className="relative">
            <input ref={titleRef} type="text" placeholder="Notification title" value={action.title} onChange={e => onChange({ title: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' pr-20'} />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <DynamicFieldsButton targetRef={titleRef} onInsert={(v) => onChange({ title: v } as Partial<AutomationAction>)} />
            </div>
          </div>
          <div className="relative">
            <textarea ref={bodyRef} rows={2} placeholder="Body (optional)" value={action.body ?? ''} onChange={e => onChange({ body: e.target.value } as Partial<AutomationAction>)} className={inputClass + ' resize-none pr-20'} />
            <div className="absolute right-1.5 top-1.5">
              <DynamicFieldsButton targetRef={bodyRef} onInsert={(v) => onChange({ body: v } as Partial<AutomationAction>)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
