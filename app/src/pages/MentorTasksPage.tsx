import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import { migrateContent } from '../lib/journeyFlow'
import { fireAutomationById } from '../lib/automations'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import type {
  MentorTask,
  Mentee,
  MenteeJourney,
  JourneyNode,
  JourneyConnector,
  Offering,
} from '../types'

// ── Enriched task with joined data ────────────────────────────────────
interface TaskWithContext extends MentorTask {
  mentee?: Pick<Mentee, 'id' | 'first_name' | 'last_name' | 'email'>
  journey?: MenteeJourney
  // For decision tasks: outgoing connectors from the decision node
  decisionOptions?: { connector: JourneyConnector; targetNode: JourneyNode }[]
}

type Filter = 'pending' | 'done' | 'all'

export default function MentorTasksPage() {
  const { profile } = useAuth()
  const toast = useToast()

  const [tasks, setTasks] = useState<TaskWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('pending')
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)

  // Offerings cache for resolving journey offering node names
  const [offerings, setOfferings] = useState<Offering[]>([])

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    toast.error('Request timed out. Please try again.')
  }, []))

  useEffect(() => {
    if (!profile) return
    loadTasks()
  }, [profile?.id])

  async function loadTasks() {
    if (!profile) return
    setLoading(true)
    try {
      // Fetch tasks, mentees, journeys, and offerings in parallel
      const [tasksRes, menteesRes, journeysRes, offeringsRes] = await Promise.all([
        supabase
          .from('mentor_tasks')
          .select('*')
          .eq('mentor_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('mentees')
          .select('id, first_name, last_name, email')
          .eq('organization_id', profile.organization_id),
        supabase
          .from('mentee_journeys')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .in('status', ['active', 'completed']),
        supabase
          .from('offerings')
          .select('id, name, type')
          .eq('organization_id', profile.organization_id),
      ])

      const allMentees = (menteesRes.data ?? []) as Pick<Mentee, 'id' | 'first_name' | 'last_name' | 'email'>[]
      const menteeMap = new Map(allMentees.map(m => [m.id, m]))

      const allJourneys = (journeysRes.data ?? []).map(j => ({
        ...(j as MenteeJourney),
        content: migrateContent((j as { content: unknown }).content),
      })) as MenteeJourney[]
      const journeyMap = new Map(allJourneys.map(j => [j.id, j]))

      setOfferings((offeringsRes.data ?? []) as Offering[])

      const enriched: TaskWithContext[] = ((tasksRes.data ?? []) as MentorTask[]).map(t => {
        const mentee = t.mentee_id ? menteeMap.get(t.mentee_id) : undefined
        const journey = t.mentee_journey_id ? journeyMap.get(t.mentee_journey_id) : undefined

        let decisionOptions: TaskWithContext['decisionOptions']
        if (t.source === 'journey_decision' && journey && t.decision_node_id) {
          const decNode = journey.content.nodes.find(n => n.id === t.decision_node_id)
          if (decNode) {
            const outgoing = journey.content.connectors.filter(c => c.fromNodeId === decNode.id)
            decisionOptions = outgoing.map(c => ({
              connector: c,
              targetNode: journey.content.nodes.find(n => n.id === c.toNodeId)!,
            })).filter(o => o.targetNode)
          }
        }

        return { ...t, mentee, journey, decisionOptions }
      })

      setTasks(enriched)
    } catch (err) {
      toast.error('Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }

  // ── Complete a task manually ────────────────────────────────────────
  async function completeTask(taskId: string) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mentor_tasks')
      .update({ status: 'done', completed_at: now, updated_at: now })
      .eq('id', taskId)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'done', completed_at: now, updated_at: now } : t,
    ))
    toast.success('Task completed.')
  }

  // ── Reopen a completed task ─────────────────────────────────────────
  async function reopenTask(taskId: string) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mentor_tasks')
      .update({ status: 'pending', completed_at: null, updated_at: now })
      .eq('id', taskId)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'pending', completed_at: null, updated_at: now } : t,
    ))
  }

  // ── Delete a task ───────────────────────────────────────────────────
  async function deleteTask(taskId: string) {
    const { error } = await supabase.from('mentor_tasks').delete().eq('id', taskId)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // ── Advance journey from a decision task ────────────────────────────
  async function advanceFromTask(task: TaskWithContext, targetNodeId: string, connectorLabel: string) {
    if (!task.journey || !profile) return
    setBusy(true)
    try {
      const journey = task.journey
      const targetNode = journey.content.nodes.find(n => n.id === targetNodeId)
      if (!targetNode) { toast.error('Target node not found.'); return }

      // If the decision node has a pinned automation, run it BEFORE the
      // journey advances so the automation's actions see the pre-advance
      // state (mentee still at the decision).
      if (task.decision_node_id) {
        const decisionNode = journey.content.nodes.find(n => n.id === task.decision_node_id)
        const automationId = (decisionNode as { automationId?: string | null } | undefined)?.automationId
        if (automationId) {
          await fireAutomationById(profile.organization_id, automationId, {
            mentee_id: journey.mentee_id,
          })
        }
      }

      const now = new Date().toISOString()
      const journeyUpdates: Record<string, unknown> = { current_node_id: targetNodeId }

      if (targetNode.type === 'end' || targetNode.isEnd) {
        journeyUpdates.status = 'completed'
        journeyUpdates.completed_at = now
        journeyUpdates.pending_assignment_node_id = null
      } else if (targetNode.type === 'offering') {
        // Check if mentee already has this offering active
        const { data: existing } = await supabase
          .from('mentee_offerings')
          .select('id')
          .eq('mentee_id', journey.mentee_id)
          .eq('offering_id', targetNode.offeringId)
          .eq('status', 'active')
          .limit(1)

        if (existing && existing.length > 0) {
          journeyUpdates.pending_assignment_node_id = null
        } else {
          // Check org setting for auto-assign
          const { data: orgData } = await supabase
            .from('organizations')
            .select('journey_auto_assign_offerings')
            .eq('id', profile.organization_id)
            .single()
          const autoAssign = orgData?.journey_auto_assign_offerings ?? true

          if (autoAssign) {
            // Auto-create the offering assignment
            const { data: template } = await supabase
              .from('offerings')
              .select('*')
              .eq('id', targetNode.offeringId)
              .single()

            const { error: insertErr } = await supabase
              .from('mentee_offerings')
              .insert({
                organization_id: profile.organization_id,
                mentee_id: journey.mentee_id,
                offering_id: targetNode.offeringId,
                assigned_by: profile.id,
                recurring_price_cents: (template as Offering | null)?.recurring_price_cents ?? 0,
                setup_fee_cents: (template as Offering | null)?.setup_fee_cents ?? 0,
                meeting_count: (template as Offering | null)?.meeting_count ?? null,
                allocation_period: (template as Offering | null)?.allocation_period ?? 'monthly',
              })
            if (insertErr) { toast.error(insertErr.message); return }
            journeyUpdates.pending_assignment_node_id = null
          } else {
            journeyUpdates.pending_assignment_node_id = targetNodeId
          }
        }
      } else {
        journeyUpdates.pending_assignment_node_id = null
      }

      // Update journey
      const { error: jErr } = await supabase
        .from('mentee_journeys')
        .update(journeyUpdates)
        .eq('id', journey.id)
      if (jErr) { toast.error(jErr.message); return }

      // Complete the task
      await supabase
        .from('mentor_tasks')
        .update({ status: 'done', completed_at: now, updated_at: now })
        .eq('id', task.id)

      // Update local state
      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, status: 'done', completed_at: now, updated_at: now }
          : t,
      ))

      const menteeName = task.mentee
        ? `${task.mentee.first_name} ${task.mentee.last_name}`
        : 'Mentee'

      if (targetNode.type === 'end' || targetNode.isEnd) {
        toast.success(`Journey completed for ${menteeName}.`)
      } else {
        toast.success(`Advanced ${menteeName} to ${connectorLabel || 'next step'}.`)
      }

      await logAudit({
        organization_id: profile.organization_id,
        actor_id: profile.id,
        action: journeyUpdates.status === 'completed' ? 'completed' : 'advanced',
        entity_type: 'mentee_journey',
        entity_id: journey.id,
        details: {
          mentee: menteeName,
          connector_label: connectorLabel || null,
          target_node_type: targetNode.type,
          target_node_id: targetNodeId,
          via: 'mentor_task',
        },
      })

      // If the target is a decision node, create a new task for it
      if (targetNode.type === 'decision') {
        await createDecisionTask(journey.id, targetNodeId, journey.mentee_id)
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to advance journey.')
    } finally {
      setBusy(false)
    }
  }

  /** Create a new auto-task when a journey reaches a decision node. */
  async function createDecisionTask(journeyId: string, nodeId: string, menteeId: string) {
    if (!profile) return
    // Fetch updated journey to get the node label
    const { data: jData } = await supabase
      .from('mentee_journeys')
      .select('content')
      .eq('id', journeyId)
      .single()
    if (!jData) return
    const content = migrateContent((jData as { content: unknown }).content)
    const node = content.nodes.find((n: JourneyNode) => n.id === nodeId)
    const label = node && 'label' in node ? (node as { label?: string }).label : 'Decision'

    // Look up mentee name
    const mentee = tasks.find(t => t.mentee_id === menteeId)?.mentee
    const menteeName = mentee
      ? `${mentee.first_name} ${mentee.last_name}`
      : 'Mentee'

    await supabase.from('mentor_tasks').insert({
      organization_id: profile.organization_id,
      mentor_id: profile.id,
      title: `Decision needed: ${menteeName} — ${label}`,
      mentee_id: menteeId,
      mentee_journey_id: journeyId,
      decision_node_id: nodeId,
      source: 'journey_decision',
      priority: 'urgent',
    })

    // If this decision node pins an on-reach automation, fire it now.
    // Typical use: send the mentor a notification that a decision is due.
    const reachAutomationId = (node as { reachAutomationId?: string | null } | undefined)?.reachAutomationId
    if (reachAutomationId) {
      await fireAutomationById(profile.organization_id, reachAutomationId, {
        mentee_id: menteeId,
      })
    }

    // Reload to pick it up
    await loadTasks()
  }

  // Helper: resolve offering node name
  function offeringName(node: JourneyNode): string {
    if (node.type !== 'offering') return node.type === 'end' || node.isEnd ? 'End' : ('label' in node ? (node as { label: string }).label : node.type)
    const o = offerings.find(off => off.id === node.offeringId)
    return o?.name ?? 'Unknown offering'
  }

  const filtered = tasks.filter(t =>
    filter === 'all' ? true : t.status === filter,
  )

  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const urgentCount = tasks.filter(t => t.status === 'pending' && t.priority === 'urgent').length

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingCount} pending{urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded overflow-hidden">
            {(['pending', 'done', 'all'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? 'bg-brand text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreate(true)}>+ New Task</Button>
        </div>
      </div>

      {showCreate && (
        <CreateTaskForm
          profile={profile!}
          onCreated={(t) => { setTasks(prev => [t, ...prev]); setShowCreate(false) }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <Skeleton count={5} className="h-20 w-full" gap="gap-3" />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            {filter === 'pending' ? 'No pending tasks.' : filter === 'done' ? 'No completed tasks.' : 'No tasks yet.'}
          </p>
          {filter === 'pending' && tasks.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Tasks will appear here when mentees reach decision points in their journeys, or you can create them manually.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              busy={busy}
              offeringName={offeringName}
              onComplete={completeTask}
              onReopen={reopenTask}
              onDelete={deleteTask}
              onAdvance={advanceFromTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────

function TaskCard({
  task,
  busy,
  offeringName,
  onComplete,
  onReopen,
  onDelete,
  onAdvance,
}: {
  task: TaskWithContext
  busy: boolean
  offeringName: (node: JourneyNode) => string
  onComplete: (id: string) => void
  onReopen: (id: string) => void
  onDelete: (id: string) => void
  onAdvance: (task: TaskWithContext, targetNodeId: string, label: string) => void
}) {
  const isDone = task.status === 'done'
  const isDecision = task.source === 'journey_decision' && task.decisionOptions && task.decisionOptions.length > 0

  // Is the journey still on the decision node? If not, the task is stale.
  const journeyStillAtDecision = task.journey
    && task.journey.status === 'active'
    && task.journey.current_node_id === task.decision_node_id

  return (
    <div className={`bg-white rounded-md border px-5 py-4 transition-all ${
      isDone ? 'border-gray-200/60 opacity-60' : task.priority === 'urgent' ? 'border-amber-300 shadow-sm' : 'border-gray-200/80'
    }`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => isDone ? onReopen(task.id) : onComplete(task.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            isDone
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-brand'
          }`}
        >
          {isDone && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {task.title}
            </p>
            {task.priority === 'urgent' && !isDone && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                Urgent
              </span>
            )}
            {task.source === 'journey_decision' && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                Journey
              </span>
            )}
          </div>

          {task.notes && (
            <p className="text-xs text-gray-500 mb-2">{task.notes}</p>
          )}

          {/* Mentee context line */}
          {task.mentee && (
            <p className="text-[11px] text-gray-400 mb-1">
              {task.mentee.first_name} {task.mentee.last_name}
              {task.mentee.email && <span className="ml-1">· {task.mentee.email}</span>}
            </p>
          )}

          {/* Decision buttons — only if pending and journey is still at this node */}
          {isDecision && !isDone && journeyStillAtDecision && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Choose next step</p>
              <div className="flex flex-wrap gap-2">
                {task.decisionOptions!.map(opt => {
                  const label = opt.connector.label || offeringName(opt.targetNode)
                  const colorClass = (opt.targetNode.type === 'end' || opt.targetNode.isEnd)
                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                    : opt.targetNode.type === 'offering'
                      ? 'border-violet-200 text-violet-600 hover:bg-violet-50'
                      : opt.targetNode.type === 'decision'
                        ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  return (
                    <button
                      key={opt.connector.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onAdvance(task, opt.connector.toNodeId, opt.connector.label)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border disabled:opacity-50 transition-colors ${colorClass}`}
                    >
                      <span className="truncate max-w-[180px]">{label}</span>
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stale decision notice */}
          {isDecision && !isDone && !journeyStillAtDecision && (
            <p className="mt-2 text-[10px] text-gray-400 italic">
              This journey has already been advanced past this decision.
            </p>
          )}

          {/* Footer meta */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
            {task.due_date && (
              <span className={!isDone && task.due_date <= new Date().toISOString().slice(0, 10) ? 'text-red-500 font-medium' : ''}>
                Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString()}
              </span>
            )}
            <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
            {isDone && task.completed_at && (
              <span>Completed {new Date(task.completed_at).toLocaleDateString()}</span>
            )}
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create Task Form ──────────────────────────────────────────────────

function CreateTaskForm({
  profile,
  onCreated,
  onCancel,
}: {
  profile: { id: string; organization_id: string }
  onCreated: (task: TaskWithContext) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('mentor_tasks')
        .insert({
          organization_id: profile.organization_id,
          mentor_id: profile.id,
          title: title.trim(),
          notes: notes.trim() || null,
          due_date: dueDate || null,
          priority,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) { toast.error(error.message); return }
      onCreated(data as TaskWithContext)
      toast.success('Task created.')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create task.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="bg-white rounded-md border border-brand/30 px-5 py-4 mb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          autoFocus
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className={inputClass}
        />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className={`${inputClass} resize-none`}
        />
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={`${inputClass} w-40`}
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={priority === 'urgent'}
              onChange={e => setPriority(e.target.checked ? 'urgent' : 'normal')}
              className="rounded accent-amber-500"
            />
            Urgent
          </label>
          <div className="flex-1" />
          <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
  )
}
