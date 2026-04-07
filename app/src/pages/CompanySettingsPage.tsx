import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { refreshTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Organization, PayType, RoleCategory, PayTypeSettings, FlowStep, MenteeFlow, CancellationPolicy } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'

const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'pct_monthly_profit', label: '% of monthly profit' },
  { value: 'pct_engagement_profit', label: '% of engagement profit' },
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

type SettingsTab = 'branding' | 'payroll' | 'mentee_flow' | 'cancellation' | 'notifications' | 'integrations'

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'branding', label: 'Branding' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'mentee_flow', label: 'Mentee Flow' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
]

export default function CompanySettingsPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding')

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#4F46E5')
  const [secondaryColor, setSecondaryColor] = useState('#6366F1')
  const [tertiaryColor, setTertiaryColor] = useState('#818CF8')
  const [paySettings, setPaySettings] = useState<PayTypeSettings>(DEFAULT_PAY_SETTINGS)
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [newStepName, setNewStepName] = useState('')
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)

  useEffect(() => {
    if (!profile) return
    async function fetchOrg() {
      const { data, error } = await supabase.from('organizations').select('*').eq('id', profile!.organization_id).single()
      if (error) { setMsg({ type: 'error', text: 'Failed to load: ' + error.message }); setLoading(false); return }
      const o = data as Organization
      setOrg(o)
      setName(o.name); setSlug(o.slug); setLogoUrl(o.logo_url ?? '')
      setPrimaryColor(o.primary_color); setSecondaryColor(o.secondary_color); setTertiaryColor(o.tertiary_color)
      setPaySettings(o.pay_type_settings ?? DEFAULT_PAY_SETTINGS)
      setFlowSteps((o.mentee_flow as MenteeFlow)?.steps ?? [])
      setCancellationPolicy(o.default_cancellation_policy ?? DEFAULT_CANCELLATION_POLICY)
      setLoading(false)
    }
    fetchOrg()
  }, [profile])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!org) return
    setMsg(null); setSaving(true)
    const updates = {
      name: name.trim(), slug: slug.trim().toLowerCase(), logo_url: logoUrl.trim() || null,
      primary_color: primaryColor.trim(), secondary_color: secondaryColor.trim(), tertiary_color: tertiaryColor.trim(),
      pay_type_settings: paySettings, mentee_flow: { steps: flowSteps }, default_cancellation_policy: cancellationPolicy,
    }
    const { error } = await supabase.from('organizations').update(updates).eq('id', org.id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    const updatedOrg = { ...org, ...updates }
    setOrg(updatedOrg)
    refreshTheme(updatedOrg)
    logAudit({ organization_id: org.id, actor_id: profile!.id, action: 'updated', entity_type: 'organization', entity_id: org.id, details: { section: activeTab } })
    setMsg({ type: 'success', text: 'Settings saved.' })
  }

  async function handleLogoUpload(file: File) {
    if (!org) return
    setUploading(true); setMsg(null)
    const fileExt = file.name.split('.').pop()
    const filePath = `${org.id}/logo.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true })
    if (uploadError) { setMsg({ type: 'error', text: 'Upload failed: ' + uploadError.message }); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
    setLogoUrl(urlData.publicUrl); setUploading(false)
    setMsg({ type: 'success', text: 'Logo uploaded. Click Save to apply.' })
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-4xl">
      <form onSubmit={handleSave}>
        {/* Header with save */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Company Settings</h1>
          <button type="submit" disabled={saving}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {msg && (
          <div className={`flex items-start gap-3 rounded border px-3 py-2 text-sm mb-4 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <span className="mt-0.5">{msg.type === 'success' ? '\u2713' : '\u2717'}</span>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-5">
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-6">

          {/* ====== BRANDING ====== */}
          {activeTab === 'branding' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">URL slug</label>
                  <input type="text" required value={slug} onChange={e => setSlug(e.target.value)} placeholder="my-company" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Logo</label>
                <div className="flex items-center gap-3">
                  {logoUrl && (
                    <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded object-contain border border-gray-200"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }} />
                  <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}
                    className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                  <span className="text-xs text-gray-400">or</span>
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Brand colors</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Primary', value: primaryColor, set: setPrimaryColor },
                    { label: 'Secondary', value: secondaryColor, set: setSecondaryColor },
                    { label: 'Tertiary', value: tertiaryColor, set: setTertiaryColor },
                  ].map(c => (
                    <div key={c.label} className="flex items-center gap-2">
                      <input type="color" value={c.value} onChange={e => c.set(e.target.value)}
                        className="h-8 w-8 rounded border border-gray-300 cursor-pointer p-0.5 shrink-0" />
                      <div>
                        <input type="text" value={c.value} onChange={e => c.set(e.target.value)}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand transition" />
                        <p className="text-[10px] text-gray-400 mt-0.5">{c.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ====== PAYROLL ====== */}
          {activeTab === 'payroll' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Configure which compensation methods are available for each role.</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-3 pr-6 text-xs font-semibold uppercase tracking-wider text-gray-400">Type</th>
                    {ROLE_CATEGORIES.map(rc => (
                      <th key={rc.value} className="pb-3 px-4 text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">{rc.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PAY_TYPES.map((pt, i) => (
                    <tr key={pt.value} className={i < PAY_TYPES.length - 1 ? 'border-b border-gray-100' : ''}>
                      <td className="py-3 pr-6 text-sm text-gray-900">{pt.label}</td>
                      {ROLE_CATEGORIES.map(rc => {
                        const checked = paySettings[rc.value]?.includes(pt.value) ?? false
                        return (
                          <td key={rc.value} className="py-3 px-4 text-center">
                            <button type="button" onClick={() => {
                              setPaySettings(prev => {
                                const current = prev[rc.value] ?? []
                                const next = checked ? current.filter(t => t !== pt.value) : [...current, pt.value]
                                return { ...prev, [rc.value]: next }
                              })
                            }} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-gray-200'}`}>
                              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ====== MENTEE FLOW ====== */}
          {activeTab === 'mentee_flow' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Define the expected progression of mentees through your program.</p>

              {flowSteps.length > 0 && (
                <div className="space-y-1">
                  {flowSteps
                    .sort((a, b) => { if (a.in_flow && !b.in_flow) return -1; if (!a.in_flow && b.in_flow) return 1; return a.order - b.order })
                    .map((_step, _idx, sorted) => {
                      const step = _step
                      const flowItems = sorted.filter(s => s.in_flow)
                      const flowIdx = step.in_flow ? flowItems.indexOf(step) : -1
                      return (
                        <div key={step.id} className={`flex items-center gap-3 px-3 py-2 rounded border ${step.in_flow ? 'border-brand/30 bg-brand-light' : 'border-gray-200 bg-gray-50'}`}>
                          {step.in_flow ? (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button type="button" disabled={flowIdx === 0} onClick={() => {
                                const prev = flowItems[flowIdx - 1]
                                setFlowSteps(s => s.map(x => x.id === step.id ? { ...x, order: prev.order } : x.id === prev.id ? { ...x, order: step.order } : x))
                              }} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">&uarr;</button>
                              <button type="button" disabled={flowIdx === flowItems.length - 1} onClick={() => {
                                const next = flowItems[flowIdx + 1]
                                setFlowSteps(s => s.map(x => x.id === step.id ? { ...x, order: next.order } : x.id === next.id ? { ...x, order: step.order } : x))
                              }} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">&darr;</button>
                            </div>
                          ) : <div className="w-3" />}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-900 truncate">{step.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${step.type === 'course' ? 'bg-violet-50 text-violet-600' : step.type === 'engagement' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{step.type}</span>
                          </div>
                          <button type="button" onClick={() => setFlowSteps(s => s.map(x => x.id === step.id ? { ...x, in_flow: !x.in_flow } : x))}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${step.in_flow ? 'bg-brand' : 'bg-gray-200'}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${step.in_flow ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                          </button>
                          <button type="button" onClick={() => setFlowSteps(s => s.filter(x => x.id !== step.id))} className="text-gray-300 hover:text-red-500 transition-colors text-sm">&times;</button>
                        </div>
                      )
                    })}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="text" value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="Add a status (e.g. Lead, Graduated)" className={inputClass + ' flex-1'}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!newStepName.trim()) return; setFlowSteps(s => [...s, { id: crypto.randomUUID(), name: newStepName.trim(), type: 'status', offering_id: null, in_flow: true, order: flowSteps.length }]); setNewStepName('') } }} />
                <button type="button" onClick={() => { if (!newStepName.trim()) return; setFlowSteps(s => [...s, { id: crypto.randomUUID(), name: newStepName.trim(), type: 'status', offering_id: null, in_flow: true, order: flowSteps.length }]); setNewStepName('') }}
                  className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover transition">Add</button>
              </div>
            </div>
          )}

          {/* ====== CANCELLATION ====== */}
          {activeTab === 'cancellation' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Default cancellation policy for engagements. Individual engagements can override.</p>
              <CancellationPolicyEditor policy={cancellationPolicy} onChange={setCancellationPolicy} />
            </div>
          )}

          {/* ====== NOTIFICATIONS ====== */}
          {activeTab === 'notifications' && (
            <p className="text-sm text-gray-500">Notification preferences coming soon.</p>
          )}

          {/* ====== INTEGRATIONS ====== */}
          {activeTab === 'integrations' && (
            <p className="text-sm text-gray-500">Third-party integrations coming soon.</p>
          )}

        </div>
      </form>
    </div>
  )
}
