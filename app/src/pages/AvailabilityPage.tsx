import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { AvailabilitySchedule, StaffMember } from '../types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AvailabilityPage() {
  const { id: paramId } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [schedules, setSchedules] = useState<AvailabilitySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [targetName, setTargetName] = useState<string | null>(null)

  // The staff member whose availability we're editing
  const targetStaffId = paramId ?? profile?.id
  const isEditingOther = !!paramId && paramId !== profile?.id

  // Add block state
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('17:00')

  useEffect(() => {
    if (!targetStaffId || !profile) return
    async function fetchSchedules() {
      setLoading(true)
      // If editing another person, fetch their name
      if (isEditingOther) {
        const { data: staffData } = await supabase
          .from('staff').select('first_name, last_name').eq('id', targetStaffId!).single()
        if (staffData) setTargetName(`${(staffData as StaffMember).first_name} ${(staffData as StaffMember).last_name}`)
      }
      const { data } = await supabase
        .from('availability_schedules')
        .select('*')
        .eq('staff_id', targetStaffId!)
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })
      setSchedules((data ?? []) as AvailabilitySchedule[])
      setLoading(false)
    }
    fetchSchedules()
  }, [targetStaffId, profile?.id])

  async function addBlock(dayOfWeek: number) {
    if (!profile) return
    setMsg(null)

    // Validate: end must be after start
    if (newEnd <= newStart) {
      setMsg({ type: 'error', text: 'End time must be after start time.' })
      return
    }

    // Check for overlaps
    const dayBlocks = schedules.filter(s => s.day_of_week === dayOfWeek)
    const overlap = dayBlocks.some(s =>
      (newStart < s.end_time && newEnd > s.start_time)
    )
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
    await supabase.from('availability_schedules').delete().eq('id', id)
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  function formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

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

      <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
        {DAYS.map((day, dayIdx) => {
          const dayBlocks = schedules.filter(s => s.day_of_week === dayIdx)
          const isAdding = addingDay === dayIdx

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
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="time"
                        value={newStart}
                        onChange={e => setNewStart(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={newEnd}
                        onChange={e => setNewEnd(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => addBlock(dayIdx)}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingDay(null)}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Add button */}
                {!isAdding && (
                  <button
                    onClick={() => { setAddingDay(dayIdx); setNewStart('09:00'); setNewEnd('17:00') }}
                    className="text-xs font-medium text-brand hover:text-brand-hover transition-colors shrink-0"
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
