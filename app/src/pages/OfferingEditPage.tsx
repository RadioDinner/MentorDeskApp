import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Offering } from '../types'

export default function OfferingEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [offering, setOffering] = useState<Offering | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchOffering() {
      const { data, error } = await supabase
        .from('offerings')
        .select('*')
        .eq('id', id!)
        .single()

      if (error) {
        setFetchError(error.message)
        setLoading(false)
        return
      }

      const o = data as Offering
      setOffering(o)
      setName(o.name)
      setDescription(o.description ?? '')
      setLoading(false)
    }

    fetchOffering()
  }, [id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!offering) return
    setMsg(null)
    setSaving(true)

    const { error } = await supabase
      .from('offerings')
      .update({
        name: name.trim(),
        description: description.trim() || null,
      })
      .eq('id', offering.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    setOffering({ ...offering, name: name.trim(), description: description.trim() || null })
    setMsg({ type: 'success', text: 'Offering has been updated.' })
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>
  }

  if (fetchError || !offering) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-lg border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Offering not found.'}
        </div>
      </div>
    )
  }

  const typeLabel = offering.type === 'course' ? 'Course' : 'Engagement'
  const backRoute = `/offerings?tab=${offering.type}`

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(backRoute)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{offering.name}</h1>
          <p className="text-xs text-gray-500">{typeLabel}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — Details */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-8 py-8">
            <h2 className="text-base font-semibold text-gray-900 mb-6">{typeLabel} Details</h2>

            <form onSubmit={handleSave} className="space-y-5">
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
                <label htmlFor="editName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name
                </label>
                <input id="editName" type="text" required value={name}
                  onChange={e => setName(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label htmlFor="editDesc" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea id="editDesc" rows={4} value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional"
                  className={inputClass + ' resize-none'} />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={saving}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right — Info */}
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Info</h2>

            <div className="space-y-2 text-xs text-gray-500">
              <p>
                Type: <span className="font-medium text-gray-700">{typeLabel}</span>
              </p>
              <p>
                Created: <span className="font-medium text-gray-700">
                  {new Date(offering.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
              <p>
                Last updated: <span className="font-medium text-gray-700">
                  {new Date(offering.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
