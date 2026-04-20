import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import type { Automation, AutomationTriggerType } from '../types'

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  lesson_completed:   'When a lesson is completed',
  lesson_reached:     'When a specific lesson is reached',
  course_completed:   'When a course is completed',
  course_started:     'When a course is started',
  meeting_scheduled:  'When a meeting is scheduled',
  meeting_completed:  'When a meeting is completed',
  meeting_cancelled:  'When a meeting is cancelled',
}

export default function AutomationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)

  useLoadingGuard(loading, useCallback(() => setLoading(false), []))

  useEffect(() => {
    if (!profile) return
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) { toast.error(error.message) }
      else { setAutomations((data ?? []) as Automation[]) }
      setLoading(false)
    }
    load()
  }, [profile?.organization_id])

  async function toggle(automation: Automation) {
    const next = !automation.enabled
    setAutomations(prev => prev.map(a => a.id === automation.id ? { ...a, enabled: next } : a))
    const { error } = await supabase.from('automations').update({ enabled: next, updated_at: new Date().toISOString() }).eq('id', automation.id)
    if (error) {
      toast.error('Failed to update: ' + error.message)
      setAutomations(prev => prev.map(a => a.id === automation.id ? { ...a, enabled: automation.enabled } : a))
    }
  }

  async function remove(automation: Automation) {
    if (!confirm(`Delete automation "${automation.name}"?`)) return
    const { error } = await supabase.from('automations').delete().eq('id', automation.id)
    if (error) { toast.error(error.message); return }
    setAutomations(prev => prev.filter(a => a.id !== automation.id))
    toast.success('Automation deleted.')
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Automations</h1>
          <p className="text-xs text-gray-500 mt-0.5">Trigger tasks, emails, and notifications when things happen with mentees.</p>
        </div>
        <Button onClick={() => navigate('/automations/new')}>+ New automation</Button>
      </div>

      {loading ? (
        <Skeleton count={4} className="h-16 w-full" gap="gap-3" />
      ) : automations.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No automations yet.</p>
          <button onClick={() => navigate('/automations/new')} className="mt-2 text-sm font-medium text-brand hover:text-brand-hover transition-colors">
            Create your first automation
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden divide-y divide-gray-100">
          {automations.map(a => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <button
                type="button"
                onClick={() => toggle(a)}
                aria-pressed={a.enabled}
                aria-label={a.enabled ? 'Disable automation' : 'Enable automation'}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${a.enabled ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${a.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/automations/${a.id}`)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type}
                  {' · '}
                  {a.actions.length} action{a.actions.length !== 1 ? 's' : ''}
                </p>
              </button>
              <button
                type="button"
                onClick={() => remove(a)}
                className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
