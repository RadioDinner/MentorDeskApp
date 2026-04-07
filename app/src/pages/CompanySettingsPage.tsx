import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { refreshTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import type { Organization, PayType, RoleCategory, PayTypeSettings } from '../types'

const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'pct_monthly_profit', label: 'Percentage of monthly profit' },
  { value: 'pct_engagement_profit', label: 'Percentage of assigned engagement profit' },
]

const ROLE_CATEGORIES: { value: RoleCategory; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'mentor', label: 'Mentors' },
  { value: 'assistant_mentor', label: 'Asst. Mentors' },
]

const DEFAULT_PAY_SETTINGS: PayTypeSettings = {
  staff: ['hourly', 'salary'],
  mentor: ['hourly', 'salary', 'pct_monthly_profit', 'pct_engagement_profit'],
  assistant_mentor: ['hourly', 'salary', 'pct_monthly_profit', 'pct_engagement_profit'],
}

function CollapseCard({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200/80">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-8 py-5 text-left"
      >
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-8 pb-8 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}

export default function CompanySettingsPage() {
  const { profile } = useAuth()

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#4F46E5')
  const [secondaryColor, setSecondaryColor] = useState('#6366F1')
  const [tertiaryColor, setTertiaryColor] = useState('#818CF8')
  const [paySettings, setPaySettings] = useState<PayTypeSettings>(DEFAULT_PAY_SETTINGS)

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
      setSecondaryColor(o.secondary_color)
      setTertiaryColor(o.tertiary_color)
      setPaySettings(o.pay_type_settings ?? DEFAULT_PAY_SETTINGS)
      setLoading(false)
    }

    fetchOrg()
  }, [profile])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!org) return
    setMsg(null)
    setSaving(true)

    const updates = {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      logo_url: logoUrl.trim() || null,
      primary_color: primaryColor.trim(),
      secondary_color: secondaryColor.trim(),
      tertiary_color: tertiaryColor.trim(),
      pay_type_settings: paySettings,
    }

    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', org.id)

    setSaving(false)

    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }

    const updatedOrg = { ...org, ...updates }
    setOrg(updatedOrg)
    refreshTheme(updatedOrg)
    setMsg({ type: 'success', text: 'Settings saved.' })
  }

  async function handleLogoUpload(file: File) {
    if (!org) return
    setUploading(true)
    setMsg(null)

    const fileExt = file.name.split('.').pop()
    const filePath = `${org.id}/logo.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setMsg({ type: 'error', text: 'Upload failed: ' + uploadError.message })
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('logos')
      .getPublicUrl(filePath)

    setLogoUrl(urlData.publicUrl)
    setUploading(false)
    setMsg({ type: 'success', text: 'Logo uploaded. Click "Save changes" to apply.' })
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading…</div>
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Company Settings</h1>

      <form onSubmit={handleSave} className="space-y-4">
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

        {/* Branding card */}
        <CollapseCard title="Branding" defaultOpen={true}>
          <div className="space-y-5">
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

            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Logo
              </label>

              {/* Preview */}
              {logoUrl && (
                <div className="mb-3 flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="h-12 w-12 rounded-lg object-contain border border-gray-200"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="text-xs text-gray-400">Current logo</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleLogoUpload(file)
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </button>
                <span className="text-xs text-gray-400">or</span>
              </div>

              {/* URL input */}
              <input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className={inputClass + ' mt-2'}
              />
            </div>

            {/* Brand colors */}
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-3">Brand colors</p>
              <div className="space-y-3">
                {/* Primary */}
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="h-10 w-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className={inputClass + ' max-w-32'}
                  />
                  <span className="text-xs text-gray-400">Primary</span>
                </div>
                {/* Secondary */}
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className="h-10 w-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className={inputClass + ' max-w-32'}
                  />
                  <span className="text-xs text-gray-400">Secondary</span>
                </div>
                {/* Tertiary */}
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={tertiaryColor}
                    onChange={e => setTertiaryColor(e.target.value)}
                    className="h-10 w-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={tertiaryColor}
                    onChange={e => setTertiaryColor(e.target.value)}
                    className={inputClass + ' max-w-32'}
                  />
                  <span className="text-xs text-gray-400">Tertiary</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">Primary is used for buttons and active states. Secondary and tertiary are used for accents.</p>
            </div>
          </div>
        </CollapseCard>

        {/* Payroll Settings */}
        <CollapseCard title="Payroll Settings" defaultOpen={false}>
          <div>
            <p className="text-sm text-gray-500 mb-4">Select which pay types are available for each role.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-700">Pay Type</th>
                    {ROLE_CATEGORIES.map(rc => (
                      <th key={rc.value} className="text-center py-2 px-3 font-medium text-gray-700">{rc.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PAY_TYPES.map(pt => (
                    <tr key={pt.value} className="border-b border-gray-100">
                      <td className="py-3 pr-4 text-gray-900">{pt.label}</td>
                      {ROLE_CATEGORIES.map(rc => {
                        const checked = paySettings[rc.value]?.includes(pt.value) ?? false
                        return (
                          <td key={rc.value} className="text-center py-3 px-3">
                            <button
                              type="button"
                              onClick={() => {
                                setPaySettings(prev => {
                                  const current = prev[rc.value] ?? []
                                  const next = checked
                                    ? current.filter(t => t !== pt.value)
                                    : [...current, pt.value]
                                  return { ...prev, [rc.value]: next }
                                })
                              }}
                              className={`w-8 h-8 rounded-lg border-2 transition-colors flex items-center justify-center ${
                                checked
                                  ? 'bg-brand border-brand text-white'
                                  : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
                              }`}
                            >
                              {checked && '\u2713'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CollapseCard>

        {/* Placeholder cards for future settings */}
        <CollapseCard title="Notifications">
          <p className="text-sm text-gray-500">Notification preferences coming soon.</p>
        </CollapseCard>

        <CollapseCard title="Integrations">
          <p className="text-sm text-gray-500">Third-party integrations coming soon.</p>
        </CollapseCard>

        {/* Save button outside cards */}
        <div className="pt-2">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
