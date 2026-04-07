import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { OfferingType, DispenseMode, PreviewMode } from '../types'

interface OfferingCreatePageProps {
  title: string
  offeringType: OfferingType
}

const DISPENSE_OPTIONS: { value: DispenseMode; label: string; desc: string }[] = [
  { value: 'completion', label: 'After completion', desc: 'Next lesson unlocks when the previous one is completed' },
  { value: 'interval', label: 'On a schedule', desc: 'Dispense a new lesson every X days' },
  { value: 'all_at_once', label: 'All at once', desc: 'All lessons are available immediately — set a due date for the course' },
]

const PREVIEW_OPTIONS: { value: PreviewMode; label: string; desc: string }[] = [
  { value: 'hidden', label: 'Hidden', desc: 'Mentees cannot see upcoming lessons at all' },
  { value: 'titles_only', label: 'Titles visible', desc: 'Mentees can see lesson titles but cannot access content until unlocked' },
  { value: 'full_preview', label: 'Full preview', desc: 'Mentees can view lesson content but cannot submit work until unlocked' },
]

export default function OfferingCreatePage({ title, offeringType }: OfferingCreatePageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isCourse = offeringType === 'course'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [dispenseMode, setDispenseMode] = useState<DispenseMode>('completion')
  const [intervalDays, setIntervalDays] = useState('')
  const [lessonCount, setLessonCount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('titles_only')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setMsg(null)
    setSaving(true)

    const record: Record<string, unknown> = {
      organization_id: profile.organization_id,
      type: offeringType,
      name: name.trim(),
      description: description.trim() || null,
    }

    if (isCourse) {
      record.price_cents = price ? Math.round(parseFloat(price) * 100) : 0
      record.setup_fee_cents = setupFee ? Math.round(parseFloat(setupFee) * 100) : 0
      record.dispense_mode = dispenseMode
      record.dispense_interval_days = dispenseMode === 'interval' && intervalDays ? parseInt(intervalDays) : null
      record.lesson_count = lessonCount ? parseInt(lessonCount) : null
      record.course_due_date = dispenseMode === 'all_at_once' && dueDate ? dueDate : null
      record.preview_mode = previewMode
    }

    const { data, error } = await supabase
      .from('offerings')
      .insert(record)
      .select('id')

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    if (data && data.length > 0) {
      logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'offering', entity_id: data[0].id, details: { type: offeringType, name: name.trim() } })
      navigate(`/offerings/${data[0].id}/edit`)
    } else {
      navigate(`/offerings?tab=${offeringType}`)
    }
  }

  const backRoute = `/offerings?tab=${offeringType}`

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const selectClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(backRoute)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {msg && (
          <div className={`flex items-start gap-3 rounded border px-3 py-2.5 text-sm ${
            msg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {msg.text}
          </div>
        )}

        {/* Basic info */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="offeringName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Name
              </label>
              <input id="offeringName" type="text" required value={name}
                onChange={e => setName(e.target.value)}
                placeholder={isCourse ? 'e.g. Leadership Fundamentals' : 'e.g. Weekly 1-on-1 Coaching'}
                className={inputClass} />
            </div>

            <div>
              <label htmlFor="offeringDesc" className="block text-sm font-medium text-gray-700 mb-1.5">
                Description
              </label>
              <textarea id="offeringDesc" rows={3} value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional"
                className={inputClass + ' resize-none'} />
            </div>
          </div>
        </div>

        {/* Pricing — courses only */}
        {isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Pricing</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Course price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="price" type="number" step="0.01" min="0" value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
              <div>
                <label htmlFor="setupFee" className="block text-sm font-medium text-gray-700 mb-1.5">
                  One-time setup fee
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input id="setupFee" type="number" step="0.01" min="0" value={setupFee}
                    onChange={e => setSetupFee(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Course Plan — courses only */}
        {isCourse && (
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Course Plan</h2>
            <p className="text-xs text-gray-400 mb-4">Control how and when lessons become available to mentees.</p>

            <div className="space-y-4">
              {/* Lesson count */}
              <div>
                <label htmlFor="lessonCount" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Number of lessons
                </label>
                <input id="lessonCount" type="number" min="1" value={lessonCount}
                  onChange={e => setLessonCount(e.target.value)}
                  placeholder="e.g. 12"
                  className={inputClass + ' max-w-32'} />
              </div>

              {/* Dispense mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lesson release method
                </label>
                <div className="space-y-2">
                  {DISPENSE_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        dispenseMode === opt.value
                          ? 'border-brand bg-brand-light'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <input
                        type="radio"
                        name="dispenseMode"
                        value={opt.value}
                        checked={dispenseMode === opt.value}
                        onChange={e => setDispenseMode(e.target.value as DispenseMode)}
                        className="mt-0.5 accent-brand"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Interval days — only for interval mode */}
              {dispenseMode === 'interval' && (
                <div>
                  <label htmlFor="intervalDays" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Days between lessons
                  </label>
                  <input id="intervalDays" type="number" min="1" value={intervalDays}
                    onChange={e => setIntervalDays(e.target.value)}
                    placeholder="e.g. 7"
                    className={inputClass + ' max-w-32'} />
                </div>
              )}

              {/* Due date — only for all_at_once mode */}
              {dispenseMode === 'all_at_once' && (
                <div>
                  <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Course due date
                  </label>
                  <input id="dueDate" type="date" value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={inputClass + ' max-w-48'} />
                  <p className="text-xs text-gray-400 mt-1">Optional. When all work should be completed by.</p>
                </div>
              )}

              {/* Preview mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upcoming lesson visibility
                </label>
                <select value={previewMode}
                  onChange={e => setPreviewMode(e.target.value as PreviewMode)}
                  className={selectClass}>
                  {PREVIEW_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
            {saving ? 'Creating…' : title}
          </button>
          <button type="button" onClick={() => navigate(backRoute)}
            className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
