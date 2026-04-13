import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import TimezoneSelect, { getBrowserTimezone } from '../components/TimezoneSelect'
import Button from '../components/ui/Button'
import type { AvailabilitySchedule, StaffMember } from '../types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Step size (minutes) for the time picker nudge buttons and dropdown options.
const TIME_STEP_MINUTES = 15

export default function AvailabilityPage() {
  const { id: paramId } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [schedules, setSchedules] = useState<AvailabilitySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [targetName, setTargetName] = useState<string | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [savingTz, setSavingTz] = useState(false)

  // The staff member whose availability we're editing
  const targetStaffId = paramId ?? profile?.id
  const isEditingOther = !!paramId && paramId !== profile?.id

  // Add block state
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('17:00')

  // Copy-day menu state: { from: dayIdx } while picking a target
  const [copyFromDay, setCopyFromDay] = useState<number | null>(null)

  useEffect(() => {
    if (!targetStaffId || !profile) return
    async function fetchAll() {
      setLoading(true)
      // Fetch the target staff record (name + timezone) and their availability.
      const [staffRes, schedRes] = await Promise.all([
        supabase.from('staff').select('first_name, last_name, timezone').eq('id', targetStaffId!).single(),
        supabase
          .from('availability_schedules')
          .select('*')
          .eq('staff_id', targetStaffId!)
          .eq('is_active', true)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
      ])

      if (staffRes.data) {
        const s = staffRes.data as Partial<StaffMember>
        if (isEditingOther) setTargetName(`${s.first_name} ${s.last_name}`)
        setTimezone(s.timezone ?? null)
      }
      setSchedules((schedRes.data ?? []) as AvailabilitySchedule[])
      setLoading(false)
    }
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetStaffId, profile?.id])

  async function saveTimezone(tz: string | null) {
    if (!targetStaffId) return
    setSavingTz(true)
    setMsg(null)
    const { error } = await supabase.from('staff').update({ timezone: tz }).eq('id', targetStaffId)
    setSavingTz(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setTimezone(tz)
    setMsg({ type: 'success', text: tz ? `Timezone set to ${tz}.` : 'Timezone cleared (using browser default).' })
  }

  async function addBlock(dayOfWeek: number) {
    if (!profile) return
    setMsg(null)

    if (newEnd <= newStart) {
      setMsg({ type: 'error', text: 'End time must be after start time.' })
      return
    }

    // Check for overlaps
    const dayBlocks = schedules.filter(s => s.day_of_week === dayOfWeek)
    const overlap = dayBlocks.some(s => newStart < s.end_time && newEnd > s.start_time)
    if (overlap) {
      setMsg({ type: 'error', text: 'This block overlaps with an existing block.' })
      return
    }

    const { data, error } = await supabase
      .from('availability_schedules')
      .insert({
        organization_id: profile.organization_id,
        staff_id: targetStaffId!,
        day_of_week: dayOfWeek,
        start_time: newStart + ':00',
        end_time: newEnd + ':00',
      })
      .select()
      .single()

    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setSchedules(prev => [...prev, data as AvailabilitySchedule].sort((a, b) =>
      a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
    ))
    setAddingDay(null)
    setMsg({ type: 'success', text: 'Availability block added.' })
  }

  async function removeBlock(id: string) {
    const { error } = await supabase.from('availability_schedules').delete().eq('id', id)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  // Copy all blocks from one day to another. Skips blocks that would overlap
  // existing ones on the destination day. Performs one insert per block.
  async function copyDay(fromDay: number, toDay: number) {
    if (!profile || fromDay === toDay) return
    setMsg(null)
    const src = schedules.filter(s => s.day_of_week === fromDay)
    if (src.length === 0) {
      setMsg({ type: 'error', text: `${DAY_SHORT[fromDay]} has no blocks to copy.` })
      return
    }
    const dst = schedules.filter(s => s.day_of_week === toDay)

    const toInsert = src.filter(s => {
      return !dst.some(d => s.start_time < d.end_time && s.end_time > d.start_time)
    })

    if (toInsert.length === 0) {
      setMsg({ type: 'error', text: `${DAY_SHORT[toDay]} already has overlapping blocks.` })
      return
    }

    const rows = toInsert.map(s => ({
      organization_id: profile.organization_id,
      staff_id: targetStaffId!,
      day_of_week: toDay,
      start_time: s.start_time,
      end_time: s.end_time,
    }))

    const { data, error } = await supabase
      .from('availability_schedules')
      .insert(rows)
      .select()

    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setSchedules(prev => [...prev, ...(data as AvailabilitySchedule[])].sort((a, b) =>
      a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
    ))
    setCopyFromDay(null)
    const skipped = src.length - toInsert.length
    setMsg({
      type: 'success',
      text: `Copied ${toInsert.length} block${toInsert.length !== 1 ? 's' : ''} to ${DAY_SHORT[toDay]}${skipped > 0 ? ` (${skipped} skipped — would overlap)` : ''}.`,
    })
  }

  async function copyAllWeekdays(fromDay: number) {
    const weekdays = [1, 2, 3, 4, 5].filter(d => d !== fromDay)
    for (const d of weekdays) await copyDay(fromDay, d)
    setCopyFromDay(null)
  }
  async function copyAllOther(fromDay: number) {
    const others = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== fromDay)
    for (const d of others) await copyDay(fromDay, d)
    setCopyFromDay(null)
  }

  function formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  const effectiveTz = timezone ?? getBrowserTimezone()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        {isEditingOther && (
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">&larr; Back</button>
        )}
        <h1 className="text-xl font-semibold text-gray-900">
          {isEditingOther && targetName ? `${targetName}'s Availability` : 'My Availability'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isEditingOther ? 'Manage their recurring weekly schedule for mentee sessions.' : 'Set your recurring weekly schedule. Mentees can book sessions during these times.'}
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${
          msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
          {msg.text}
        </div>
      )}

      {/* Timezone card */}
      <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Timezone</p>
            <p className="text-xs text-gray-500 mt-0.5">
              The weekly times below are in this timezone. Currently using{' '}
              <span className="font-medium text-gray-700">{effectiveTz}</span>
              {!timezone && <span className="text-gray-400"> (from your browser)</span>}.
            </p>
          </div>
          <div className="w-64 shrink-0">
            <TimezoneSelect value={timezone} onChange={saveTimezone} />
            {savingTz && <p className="text-[10px] text-gray-400 mt-1">Saving…</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
        {DAYS.map((day, dayIdx) => {
          const dayBlocks = schedules.filter(s => s.day_of_week === dayIdx)
          const isAdding = addingDay === dayIdx
          const isCopySource = copyFromDay === dayIdx

          return (
            <div key={dayIdx} className={`px-5 py-4 ${dayIdx > 0 ? 'border-t border-gray-100' : ''}`}>
              <div className="flex items-start gap-4">
                {/* Day label */}
                <div className="w-24 shrink-0 pt-0.5">
                  <p className="text-sm font-medium text-gray-900">{DAY_SHORT[dayIdx]}</p>
                  <p className="text-[10px] text-gray-400">{day}</p>
                </div>

                {/* Blocks */}
                <div className="flex-1 min-w-0">
                  {dayBlocks.length === 0 && !isAdding && (
                    <p className="text-xs text-gray-400 py-1">Not available</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {dayBlocks.map(block => (
                      <div
                        key={block.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand-light border border-brand/20 group"
                      >
                        <span className="text-xs font-medium text-brand">
                          {formatTime(block.start_time)} – {formatTime(block.end_time)}
                        </span>
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="opacity-0 group-hover:opacity-100 text-brand/40 hover:text-red-500 transition-all text-xs"
                          title="Remove block"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add block form */}
                  {isAdding && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <TimePicker value={newStart} onChange={setNewStart} label="Start" />
                      <span className="text-xs text-gray-400">to</span>
                      <TimePicker value={newEnd} onChange={setNewEnd} label="End" />
                      <Button size="sm" onClick={() => addBlock(dayIdx)}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingDay(null)}>Cancel</Button>
                    </div>
                  )}

                  {/* Copy-day target picker */}
                  {isCopySource && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 p-2 rounded bg-amber-50 border border-amber-200">
                      <span className="text-xs text-amber-700">
                        Copy {DAY_SHORT[dayIdx]}'s blocks to:
                      </span>
                      {DAYS.map((_, idx) => idx === dayIdx ? null : (
                        <button
                          key={idx}
                          onClick={() => copyDay(dayIdx, idx)}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          {DAY_SHORT[idx]}
                        </button>
                      ))}
                      <button
                        onClick={() => copyAllWeekdays(dayIdx)}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        All weekdays
                      </button>
                      <button
                        onClick={() => copyAllOther(dayIdx)}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        All other days
                      </button>
                      <button
                        onClick={() => setCopyFromDay(null)}
                        className="ml-auto text-[11px] text-amber-600 hover:text-amber-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {!isAdding && (
                    <button
                      onClick={() => { setAddingDay(dayIdx); setNewStart('09:00'); setNewEnd('17:00'); setCopyFromDay(null) }}
                      className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
                    >
                      + Add
                    </button>
                  )}
                  {dayBlocks.length > 0 && !isCopySource && (
                    <button
                      onClick={() => { setCopyFromDay(dayIdx); setAddingDay(null) }}
                      className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy this day's blocks to another day"
                    >
                      Copy to…
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────── Time picker with +/- nudgers ───────────

function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value.split(':').map(Number)

  function bumpMinutes(delta: number) {
    const totalMin = h * 60 + m + delta
    const clamped = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60) // wrap 0..1439
    const nh = Math.floor(clamped / 60)
    const nm = clamped % 60
    onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)
  }

  return (
    <div className="flex items-center">
      <span className="text-[10px] text-gray-400 mr-1.5">{label}</span>
      <div className="flex items-center rounded border border-gray-300 overflow-hidden bg-white">
        <button
          type="button"
          onClick={() => bumpMinutes(-TIME_STEP_MINUTES)}
          className="px-1.5 py-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors border-r border-gray-200"
          title={`−${TIME_STEP_MINUTES} min`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input
          type="time"
          value={value}
          onChange={e => onChange(e.target.value)}
          step={TIME_STEP_MINUTES * 60}
          className="px-2 py-1 text-xs text-gray-900 outline-none w-24 bg-transparent"
        />
        <button
          type="button"
          onClick={() => bumpMinutes(TIME_STEP_MINUTES)}
          className="px-1.5 py-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors border-l border-gray-200"
          title={`+${TIME_STEP_MINUTES} min`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
