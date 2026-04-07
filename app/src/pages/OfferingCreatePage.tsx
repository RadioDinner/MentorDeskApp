import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { OfferingType } from '../types'

interface OfferingCreatePageProps {
  title: string
  offeringType: OfferingType
}

export default function OfferingCreatePage({ title, offeringType }: OfferingCreatePageProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setMsg(null)
    setSaving(true)

    const { data, error } = await supabase
      .from('offerings')
      .insert({
        organization_id: profile.organization_id,
        type: offeringType,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select('id')
      .single()

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    navigate(`/offerings/${data.id}/edit`)
  }

  const backRoute = `/offerings?tab=${offeringType}`

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(backRoute)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {msg && (
            <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              msg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
              {msg.text}
            </div>
          )}

          <div>
            <label htmlFor="offeringName" className="block text-sm font-medium text-gray-700 mb-1.5">
              Name
            </label>
            <input id="offeringName" type="text" required value={name}
              onChange={e => setName(e.target.value)}
              placeholder={offeringType === 'course' ? 'e.g. Leadership Fundamentals' : 'e.g. Weekly 1-on-1 Coaching'}
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

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
              {saving ? 'Creating…' : title}
            </button>
            <button type="button" onClick={() => navigate(backRoute)}
              className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
