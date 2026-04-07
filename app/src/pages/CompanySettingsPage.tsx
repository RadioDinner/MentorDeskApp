import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Organization } from '../types'

export default function CompanySettingsPage() {
  const { profile } = useAuth()

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#4F46E5')

  useEffect(() => {
    if (!profile) return

    async function fetchOrg() {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile!.organization_id)
        .single()

      if (error) {
        setMsg({ type: 'error', text: 'Failed to load organization: ' + error.message })
        setLoading(false)
        return
      }

      const o = data as Organization
      setOrg(o)
      setName(o.name)
      setSlug(o.slug)
      setLogoUrl(o.logo_url ?? '')
      setPrimaryColor(o.primary_color)
      setLoading(false)
    }

    fetchOrg()
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!org) return
    setMsg(null)
    setSaving(true)

    const { error } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor.trim(),
      })
      .eq('id', org.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    setOrg({ ...org, name: name.trim(), slug: slug.trim().toLowerCase(), logo_url: logoUrl.trim() || null, primary_color: primaryColor.trim() })
    setMsg({ type: 'success', text: 'Company settings saved.' })
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading…</div>
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition'

  return (
    <div className="max-w-2xl space-y-8">

      <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 px-8 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Company Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {msg && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              msg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {msg.text}
            </div>
          )}

          {/* Company name */}
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1.5">
              Company name
            </label>
            <input id="companyName" type="text" required value={name}
              onChange={e => setName(e.target.value)} className={inputClass} />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1.5">
              URL slug
            </label>
            <input id="slug" type="text" required value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="my-company"
              className={inputClass} />
            <p className="mt-1 text-xs text-gray-400">Used in URLs. Lowercase, no spaces.</p>
          </div>

          {/* Logo URL */}
          <div>
            <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-700 mb-1.5">
              Logo URL
            </label>
            <input id="logoUrl" type="url" value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className={inputClass} />
            {logoUrl && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-10 w-10 rounded-lg object-contain border border-gray-200"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <span className="text-xs text-gray-400">Preview</span>
              </div>
            )}
          </div>

          {/* Brand color */}
          <div>
            <label htmlFor="primaryColor" className="block text-sm font-medium text-gray-700 mb-1.5">
              Brand color
            </label>
            <div className="flex items-center gap-3">
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                placeholder="#4F46E5"
                className={inputClass + ' max-w-32'}
              />
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

    </div>
  )
}
