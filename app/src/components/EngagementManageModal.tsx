import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { computeCredits } from '../lib/credits'
import { getAvailableSlots, hasConflict, formatTimeDisplay } from '../lib/scheduling'
import type { Mentee, Offering, MenteeOffering, StaffMember, EngagementSession, AllocationPeriod, Invoice, InvoiceStatus, Meeting, AvailabilitySchedule } from '../types'
import Button from './ui/Button'

interface Props {
  assignment: MenteeOffering & { offering?: Offering }
  profile: StaffMember
  mentee: Mentee
  onClose: () => void
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>
}

export default function EngagementManageModal({ assignment, profile, mentee, onClose, onUpdate }: Props) {
  const offering = assignment.offering
  const isCompleted = assignment.status === 'completed'

  // Data state
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sessions, setSessions] = useState<EngagementSession[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [availability, setAvailability] = useState<AvailabilitySchedule[]>([])
  const [loading, setLoading] = useState(true)

  // Edit settings state
  const [editing, setEditing] = useState(false)
  const [editPrice, setEditPrice] = useState(((assignment.recurring_price_cents ?? 0) / 100).toFixed(2))
  const [editSetupFee, setEditSetupFee] = useState(((assignment.setup_fee_cents ?? 0) / 100).toFixed(2))
  const [editMeetings, setEditMeetings] = useState(assignment.meeting_count ? String(assignment.meeting_count) : '')
  const [editPeriod, setEditPeriod] = useState<AllocationPeriod>(assignment.allocation_period ?? offering?.allocation_period ?? 'monthly')
  const [editNotes, setEditNotes] = useState(assignment.notes ?? '')
  const [editEndsAt, setEditEndsAt] = useState(assignment.ends_at ? assignment.ends_at.slice(0, 10) : '')
  const [editIndefinite, setEditIndefinite] = useState(!assignment.ends_at)
  const [saving, setSaving] = useState(false)

  // Invoice creation
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [newInvoiceAmount, setNewInvoiceAmount] = useState('')
  const [newInvoiceDesc, setNewInvoiceDesc] = useState('')
  const [newInvoiceDue, setNewInvoiceDue] = useState('')
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editInvoiceAmount, setEditInvoiceAmount] = useState('')

  // Schedule meeting
  const [showScheduler, setShowScheduler] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [schedStart, setSchedStart] = useState('')
  const [schedEnd, setSchedEnd] = useState('')
  const [schedTitle, setSchedTitle] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // Session logging
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [logNotes, setLogNotes] = useState('')
  const [logging, setLogging] = useState(false)

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Credit computation
  const totalCredits = assignment.meeting_count ?? offering?.meeting_count ?? 0
  const credits = computeCredits(meetings, totalCredits)
  const period = assignment.allocation_period ?? offering?.allocation_period ?? 'per_cycle'
  const periodLabel = period === 'monthly' ? '/month' : period === 'weekly' ? '/week' : '/cycle'
  const priceCents = assignment.recurring_price_cents ?? offering?.recurring_price_cents ?? 0

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Load data
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [meetingsRes, sessionsRes, invoicesRes, availRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('mentee_offering_id', assignment.id).order('starts_at', { ascending: false }),
        supabase.from('engagement_sessions').select('*').eq('mentee_offering_id', assignment.id).order('session_date', { ascending: false }),
        supabase.from('invoices').select('*').eq('mentee_offering_id', assignment.id).order('created_at', { ascending: false }),
        supabase.from('availability_schedules').select('*').eq('staff_id', profile.id).eq('is_active', true).order('day_of_week').order('start_time'),
      ])
      setMeetings((meetingsRes.data ?? []) as Meeting[])
      setSessions((sessionsRes.data ?? []) as EngagementSession[])
      setInvoices((invoicesRes.data ?? []) as Invoice[])
      setAvailability((availRes.data ?? []) as AvailabilitySchedule[])
      setLoading(false)
    }
    load()
  }, [assignment.id])

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const endsAtValue = editIndefinite ? null : (editEndsAt ? new Date(editEndsAt + 'T23:59:59Z').toISOString() : null)
      await onUpdate(assignment.id, {
        recurring_price_cents: editPrice ? Math.round(parseFloat(editPrice) * 100) : 0,
        setup_fee_cents: editSetupFee ? Math.round(parseFloat(editSetupFee) * 100) : 0,
        meeting_count: editMeetings ? parseInt(editMeetings) : null,
        allocation_period: editPeriod,
        notes: editNotes.trim() || null,
        ends_at: endsAtValue,
      })
      setEditing(false)
      setMsg({ type: 'success', text: 'Settings saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  async function logSession() {
    if (!logDate) return
    setLogging(true)
    const { data, error } = await supabase.from('engagement_sessions').insert({
      organization_id: profile.organization_id, mentee_offering_id: assignment.id,
      mentee_id: mentee.id, logged_by: profile.id, session_date: logDate, notes: logNotes.trim() || null,
    }).select().single()
    if (!error && data) { setSessions(prev => [data as EngagementSession, ...prev]); setLogNotes(''); setLogDate(new Date().toISOString().slice(0, 10)) }
    setLogging(false)
  }

  async function deleteSession(sessionId: string) {
    await supabase.from('engagement_sessions').delete().eq('id', sessionId)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
  }

  async function createInvoice() {
    if (!newInvoiceAmount) return
    setCreatingInvoice(true)
    const { data, error } = await supabase.from('invoices').insert({
      organization_id: profile.organization_id, mentee_id: mentee.id, mentee_offering_id: assignment.id,
      status: 'draft' as InvoiceStatus, amount_cents: Math.round(parseFloat(newInvoiceAmount) * 100),
      currency: offering?.currency ?? 'USD', line_description: newInvoiceDesc.trim() || `${offering?.name ?? 'Engagement'}`,
      due_date: newInvoiceDue || null,
    }).select().single()
    if (!error && data) { setInvoices(prev => [data as Invoice, ...prev]); setShowCreateInvoice(false); setNewInvoiceAmount(''); setNewInvoiceDesc(''); setNewInvoiceDue('') }
    setCreatingInvoice(false)
  }

  async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    const updates: Record<string, unknown> = { status }
    if (status === 'paid') updates.paid_at = new Date().toISOString()
    if (status !== 'paid') updates.paid_at = null
    await supabase.from('invoices').update(updates).eq('id', invoiceId)
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, ...updates } as Invoice : inv))
  }

  async function saveInvoiceAmount(invoiceId: string) {
    const amountCents = Math.round(parseFloat(editInvoiceAmount) * 100)
    await supabase.from('invoices').update({ amount_cents: amountCents }).eq('id', invoiceId)
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, amount_cents: amountCents } : inv))
    setEditingInvoiceId(null)
  }



  function getBlocksForDate(date: string) {
    if (!date) return []
    return availability.filter(a => a.day_of_week === new Date(date + 'T00:00:00').getDay())
  }

  async function scheduleMeeting() {
    if (!schedDate || !schedStart || !schedEnd) return
    // Check for conflicts with all existing meetings for this mentor
    if (hasConflict(schedDate, schedStart, schedEnd, meetings)) {
      setMsg({ type: 'error', text: 'This time conflicts with another meeting.' })
      return
    }
    setScheduling(true)
    const startsAt = `${schedDate}T${schedStart}:00`
    const endsAt = `${schedDate}T${schedEnd}:00`
    const durationMinutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
    const { data } = await supabase.from('meetings').insert({
      organization_id: profile.organization_id, mentee_offering_id: assignment.id,
      mentee_id: mentee.id, mentor_id: profile.id,
      title: schedTitle.trim() || `Meeting with ${mentee.first_name}`,
      starts_at: startsAt, ends_at: endsAt, duration_minutes: durationMinutes, status: 'scheduled',
    }).select().single()
    if (data) setMeetings(prev => [data as Meeting, ...prev])
    setShowScheduler(false); setSchedDate(''); setSchedStart(''); setSchedEnd(''); setSchedTitle('')
    setScheduling(false)
  }

  // Available slots for selected date (accounts for existing bookings)
  const schedAvailableSlots = schedDate ? getAvailableSlots(schedDate, availability, meetings) : []

  // Invoice projection
  function getProjectedInvoices() {
    if (priceCents <= 0 || isCompleted) return []
    const startDate = new Date(assignment.assigned_at)
    const endDate = assignment.ends_at ? new Date(assignment.ends_at) : null
    const isIndefinite = !endDate
    const intervalDays = period === 'weekly' ? 7 : 30
    const projections: { date: string; amount: number; label: string }[] = []
    const existingMonths = new Set(invoices.map(inv => inv.due_date?.slice(0, 7) ?? inv.created_at.slice(0, 7)))

    let cursor = new Date(startDate)
    // If indefinite: only show next 1 upcoming invoice
    // If has end date: show all invoices until end date
    const maxProjections = isIndefinite ? 1 : 24
    const now = new Date()

    // Advance past existing invoice periods
    while (cursor <= now) cursor = new Date(cursor.getTime() + intervalDays * 86400000)

    for (let i = 0; i < maxProjections; i++) {
      if (endDate && cursor > endDate) break
      const dateStr = cursor.toISOString().slice(0, 10)
      const monthKey = dateStr.slice(0, 7)
      if (!existingMonths.has(monthKey)) {
        projections.push({
          date: dateStr,
          amount: priceCents,
          label: `${offering?.name ?? 'Engagement'} — ${cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        })
      }
      cursor = new Date(cursor.getTime() + intervalDays * 86400000)
    }
    return projections
  }

  // Date options for scheduler (next 14 days)
  const dateOptions: string[] = []
  const now = new Date()
  for (let i = 1; i <= 14; i++) dateOptions.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10))

  const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-50 text-blue-700',
    paid: 'bg-green-50 text-green-700', overdue: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[92%] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 px-8 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-600">
              {mentee.first_name[0]}{mentee.last_name[0]}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{offering?.name ?? 'Engagement'}</h2>
              <p className="text-sm text-gray-500">{mentee.first_name} {mentee.last_name} · {mentee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-rose-50 text-rose-700'}`}>
              {isCompleted ? 'Completed' : 'Active'}
            </span>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Status message */}
        {msg && (
          <div className={`shrink-0 px-8 py-2.5 text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <span>{msg.type === 'success' ? '\u2713' : '\u2717'}</span>{msg.text}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? <p className="text-sm text-gray-400 text-center py-8">Loading...</p> : (
            <div className="grid grid-cols-3 gap-6">
              {/* LEFT COLUMN: Credits + Meetings + Sessions */}
              <div className="col-span-2 space-y-6">
                {/* Credits summary */}
                <div className="bg-gray-50 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Session Credits</h3>
                  {totalCredits > 0 ? (
                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-gray-900 tabular-nums">{totalCredits}</p>
                        <p className="text-sm text-gray-500 mt-1">Allocated{periodLabel}</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">{credits.used} completed</span>
                          <span className={`text-sm font-semibold ${(credits.remaining ?? 0) <= 1 && !isCompleted ? 'text-amber-600' : 'text-gray-900'}`}>
                            {credits.remaining} remaining
                          </span>
                        </div>
                        <div className="h-3 bg-white rounded-full overflow-hidden border border-gray-200">
                          <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-400' : (credits.remaining ?? 0) <= 1 ? 'bg-amber-400' : 'bg-brand'}`}
                            style={{ width: `${totalCredits > 0 ? Math.round((credits.used / totalCredits) * 100) : 0}%` }} />
                        </div>
                        {credits.reserved > 0 && (
                          <p className="text-xs text-blue-600 mt-2">{credits.reserved} upcoming meeting{credits.reserved !== 1 ? 's' : ''} scheduled</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Unlimited sessions · {credits.used} completed</p>
                  )}
                </div>

                {/* Meetings */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Meetings ({meetings.length})</h3>
                    <button onClick={() => setShowScheduler(!showScheduler)} className="text-sm font-medium text-brand hover:text-brand-hover transition-colors">
                      {showScheduler ? 'Cancel' : '+ Schedule Meeting'}
                    </button>
                  </div>

                  {showScheduler && (
                    <div className="bg-brand-light/30 border border-brand/20 rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                          <select value={schedDate} onChange={e => { setSchedDate(e.target.value); setSchedStart(''); setSchedEnd('') }} className={inputClass}>
                            <option value="">Select...</option>
                            {dateOptions.map(d => {
                              const blocks = getBlocksForDate(d)
                              return <option key={d} value={d} disabled={blocks.length === 0}>{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{blocks.length === 0 ? ' (no avail.)' : ''}</option>
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                          <input type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">End</label>
                          <input type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                      {schedDate && schedAvailableSlots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {schedAvailableSlots.map((slot, i) => (
                            <span key={i} className="px-2 py-1 rounded bg-green-50 border border-green-200 text-xs text-green-700">
                              {formatTimeDisplay(slot.start)}–{formatTimeDisplay(slot.end)}
                            </span>
                          ))}
                        </div>
                      )}
                      {schedDate && schedAvailableSlots.length === 0 && getBlocksForDate(schedDate).length > 0 && (
                        <p className="text-xs text-amber-600">All available time on this date is booked.</p>
                      )}
                      <input type="text" value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="Meeting title (optional)" className={inputClass} />
                      <Button onClick={scheduleMeeting} disabled={scheduling || !schedDate || !schedStart || !schedEnd}>
                        {scheduling ? 'Scheduling...' : 'Book Meeting'}
                      </Button>
                    </div>
                  )}

                  {meetings.length === 0 ? (
                    <p className="text-sm text-gray-400">No meetings scheduled yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {meetings.map(m => {
                        const isPast = new Date(m.ends_at) <= new Date()
                        const mStatusColors: Record<string, string> = { scheduled: 'text-blue-600', completed: 'text-green-600', cancelled: 'text-gray-400', no_show: 'text-red-600' }
                        return (
                          <div key={m.id} className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${isPast ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                            <div className="w-12 text-center shrink-0">
                              <p className="text-xl font-bold text-gray-900 tabular-nums leading-none">{new Date(m.starts_at).getDate()}</p>
                              <p className="text-[10px] text-gray-500 uppercase mt-0.5">{new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short' })}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{m.title || 'Meeting'}</p>
                              <p className="text-xs text-gray-500">{new Date(m.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {new Date(m.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {m.duration_minutes}min</p>
                            </div>
                            <span className={`text-xs font-medium capitalize ${mStatusColors[m.status] ?? ''}`}>{m.status}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Session History */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Session Log ({sessions.length})</h3>
                  </div>
                  <div className="flex items-end gap-3 mb-3">
                    <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">Date</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className={inputClass} /></div>
                    <div className="flex-[2]"><label className="block text-xs text-gray-500 mb-1">Notes</label><input type="text" value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="Session notes..." className={inputClass} /></div>
                    <Button onClick={logSession} disabled={logging || !logDate} className="shrink-0">
                      {logging ? '...' : '+ Log'}
                    </Button>
                  </div>
                  {sessions.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-50 group">
                          <span className="text-sm text-gray-700 tabular-nums w-28 shrink-0">{new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="text-sm text-gray-500 flex-1 truncate">{s.notes || '—'}</span>
                          <button onClick={() => deleteSession(s.id)} className="opacity-0 group-hover:opacity-100 text-sm text-gray-400 hover:text-red-500 transition-all">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Settings + Invoices */}
              <div className="space-y-6">
                {/* Settings */}
                <div className="bg-gray-50 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Settings</h3>
                    {!editing && <button onClick={() => setEditing(true)} className="text-sm text-brand hover:text-brand-hover transition-colors">Edit</button>}
                  </div>

                  {editing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Recurring price</label>
                        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                          <input type="number" step="0.01" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} className={inputClass + ' pl-7'} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Setup fee</label>
                        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                          <input type="number" step="0.01" min="0" value={editSetupFee} onChange={e => setEditSetupFee(e.target.value)} className={inputClass + ' pl-7'} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Sessions / cycle</label>
                          <input type="number" min="1" value={editMeetings} onChange={e => setEditMeetings(e.target.value)} placeholder="Unlimited" className={inputClass} />
                        </div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Period</label>
                          <select value={editPeriod} onChange={e => setEditPeriod(e.target.value as AllocationPeriod)} className={inputClass}>
                            <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="per_cycle">Per Cycle</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Close-out date</label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
                          <input type="checkbox" checked={editIndefinite} onChange={e => { setEditIndefinite(e.target.checked); if (e.target.checked) setEditEndsAt('') }} className="rounded border-gray-300 text-brand focus:ring-brand/20" />
                          Runs indefinitely (manual close-out)
                        </label>
                        {!editIndefinite && <input type="date" value={editEndsAt} onChange={e => setEditEndsAt(e.target.value)} className={inputClass} />}
                      </div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Internal notes..." className={inputClass + ' resize-none'} />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                        <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Price</span><span className="font-medium text-gray-900">{priceCents > 0 ? `$${(priceCents / 100).toFixed(2)}${periodLabel}` : 'Free'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Setup fee</span><span className="font-medium text-gray-900">{(assignment.setup_fee_cents ?? 0) > 0 ? `$${((assignment.setup_fee_cents ?? 0) / 100).toFixed(2)}` : 'None'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Sessions</span><span className="font-medium text-gray-900">{totalCredits > 0 ? `${totalCredits}${periodLabel}` : 'Unlimited'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Close-out</span><span className="font-medium text-gray-900">{assignment.ends_at ? new Date(assignment.ends_at).toLocaleDateString() : 'Indefinite'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Opened</span><span className="font-medium text-gray-900">{new Date(assignment.assigned_at).toLocaleDateString()}</span></div>
                      {assignment.notes && <p className="text-sm text-gray-500 italic pt-1">{assignment.notes}</p>}
                    </div>
                  )}
                </div>

                {/* Invoices */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Invoices ({invoices.length})</h3>
                    <button onClick={() => { setShowCreateInvoice(!showCreateInvoice); setNewInvoiceAmount(priceCents > 0 ? (priceCents / 100).toFixed(2) : ''); setNewInvoiceDesc(''); setNewInvoiceDue('') }}
                      className="text-sm text-brand hover:text-brand-hover transition-colors">
                      {showCreateInvoice ? 'Cancel' : '+ Create'}
                    </button>
                  </div>

                  {showCreateInvoice && (
                    <div className="bg-brand-light/30 border border-brand/20 rounded-lg p-4 mb-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-gray-600 mb-1">Amount</label>
                          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                            <input type="number" step="0.01" min="0" value={newInvoiceAmount} onChange={e => setNewInvoiceAmount(e.target.value)} className={inputClass + ' pl-7'} />
                          </div>
                        </div>
                        <div><label className="block text-xs text-gray-600 mb-1">Due date</label><input type="date" value={newInvoiceDue} onChange={e => setNewInvoiceDue(e.target.value)} className={inputClass} /></div>
                      </div>
                      <div><label className="block text-xs text-gray-600 mb-1">Description</label><input type="text" value={newInvoiceDesc} onChange={e => setNewInvoiceDesc(e.target.value)} placeholder={offering?.name ?? 'Engagement'} className={inputClass} /></div>
                      <Button onClick={createInvoice} disabled={creatingInvoice || !newInvoiceAmount}>
                        {creatingInvoice ? 'Creating...' : 'Create Draft'}
                      </Button>
                    </div>
                  )}

                  {/* Existing invoices */}
                  {invoices.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {invoices.map(inv => {
                        const isEditingAmt = editingInvoiceId === inv.id
                        return (
                          <div key={inv.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white">
                            <div className="flex-1 min-w-0">
                              {isEditingAmt ? (
                                <div className="flex items-center gap-2">
                                  <div className="relative w-24"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                    <input type="number" step="0.01" value={editInvoiceAmount} onChange={e => setEditInvoiceAmount(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveInvoiceAmount(inv.id); if (e.key === 'Escape') setEditingInvoiceId(null) }}
                                      className="w-full rounded border border-gray-300 pl-5 pr-2 py-1 text-sm outline-none focus:border-brand" autoFocus />
                                  </div>
                                  <button onClick={() => saveInvoiceAmount(inv.id)} className="text-xs text-brand">Save</button>
                                  <button onClick={() => setEditingInvoiceId(null)} className="text-xs text-gray-400">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => { setEditingInvoiceId(inv.id); setEditInvoiceAmount((inv.amount_cents / 100).toFixed(2)) }}
                                  className="text-base font-semibold text-gray-900 tabular-nums hover:text-brand transition-colors" title="Click to edit">
                                  ${(inv.amount_cents / 100).toFixed(2)}
                                </button>
                              )}
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {inv.line_description ?? 'Invoice'}
                                {inv.due_date && ` · Due ${new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[inv.status] ?? ''}`}>{inv.status}</span>
                              <select value={inv.status} onChange={e => updateInvoiceStatus(inv.id, e.target.value as InvoiceStatus)}
                                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 outline-none focus:border-brand bg-white">
                                <option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option>
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Projected invoices */}
                  {(() => {
                    const projections = getProjectedInvoices()
                    if (projections.length === 0) return null
                    return (
                      <div>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Upcoming (projected)</p>
                        <div className="space-y-1.5">
                          {projections.map((p, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                              <span className="text-sm text-gray-500">{new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="text-sm font-medium text-gray-700 tabular-nums">${(p.amount / 100).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
