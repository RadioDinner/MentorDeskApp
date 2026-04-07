import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { refreshTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Organization, PayType, RoleCategory, PayTypeSettings, FlowStep, MenteeFlow, CancellationPolicy, RoleGroup } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../lib/modules'

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

type SettingsTab = 'branding' | 'payroll' | 'mentee_flow' | 'cancellation' | 'permissions' | 'notifications' | 'integrations'

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'branding', label: 'Branding' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'mentee_flow', label: 'Mentee Flow' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
]

const GROUP_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  People:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  Business: { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400' },
  Finance:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  System:   { bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-400' },
}

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
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([])
  const [editingGroup, setEditingGroup] = useState<RoleGroup | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

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
      setRoleGroups(o.role_groups ?? [])
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
      role_groups: roleGroups,
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

          {/* ====== PERMISSIONS ====== */}
          {activeTab === 'permissions' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Create permission groups to quickly assign module access to staff. These appear as presets in the staff module access dropdown.
              </p>

              {/* Existing groups */}
              {roleGroups.length > 0 && (
                <div className="space-y-3">
                  {roleGroups.map(group => {
                    const isEditing = editingGroup?.id === group.id
                    const current = isEditing ? editingGroup! : group
                    const allGroups = modulesByGroup().filter(g => g.group !== 'Main')
                    const moduleCount = ALL_MODULES.filter(m => !ALWAYS_VISIBLE.includes(m.key) && current.module_groups.includes(m.group)).length

                    return (
                      <div key={group.id} className={`rounded-lg border transition-all ${isEditing ? 'border-brand shadow-sm' : 'border-gray-200'}`}>
                        {/* Group header */}
                        <div className={`flex items-center justify-between px-4 py-3 ${isEditing ? 'bg-brand-light/30' : 'bg-gray-50/50'} rounded-t-lg`}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={current.name}
                              onChange={e => setEditingGroup({ ...current, name: e.target.value })}
                              className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
                              autoFocus
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{moduleCount} modules</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button type="button" onClick={() => {
                                  setRoleGroups(gs => gs.map(g => g.id === current.id ? current : g))
                                  setEditingGroup(null)
                                }} className="px-2.5 py-1 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition">
                                  Save
                                </button>
                                <button type="button" onClick={() => setEditingGroup(null)}
                                  className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition">
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => setEditingGroup({ ...group })}
                                  className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-brand transition">
                                  Edit
                                </button>
                                <button type="button" onClick={() => setRoleGroups(gs => gs.filter(g => g.id !== group.id))}
                                  className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-red-500 transition">
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Module group toggles */}
                        <div className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-2">
                            {allGroups.map(mg => {
                              const active = current.module_groups.includes(mg.group)
                              const style = GROUP_COLORS[mg.group] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }
                              return (
                                <button
                                  key={mg.group}
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => {
                                    if (!isEditing) return
                                    const next = active
                                      ? current.module_groups.filter(g => g !== mg.group)
                                      : [...current.module_groups, mg.group]
                                    setEditingGroup({ ...current, module_groups: next })
                                  }}
                                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-all ${
                                    active
                                      ? `${style.bg} border-current/10 ${style.text}`
                                      : 'bg-white border-gray-200 text-gray-400'
                                  } ${isEditing ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
                                >
                                  <span className={`w-2.5 h-2.5 rounded-full transition-colors ${active ? style.dot : 'bg-gray-200'}`} />
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-semibold block ${active ? style.text : 'text-gray-400'}`}>{mg.group}</span>
                                    <span className="text-[10px] text-gray-400">
                                      {mg.modules.map(m => m.label).join(', ')}
                                    </span>
                                  </div>
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                    active ? 'bg-brand border-brand' : 'border-gray-300 bg-white'
                                  }`}>
                                    {active && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add new group */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="New group name (e.g. Operations, Course Builder)"
                  className={inputClass + ' flex-1'}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!newGroupName.trim()) return
                      const newGroup: RoleGroup = { id: `rg-${crypto.randomUUID().slice(0, 8)}`, name: newGroupName.trim(), module_groups: [] }
                      setRoleGroups(gs => [...gs, newGroup])
                      setEditingGroup(newGroup)
                      setNewGroupName('')
                    }
                  }}
                />
                <button type="button" onClick={() => {
                  if (!newGroupName.trim()) return
                  const newGroup: RoleGroup = { id: `rg-${crypto.randomUUID().slice(0, 8)}`, name: newGroupName.trim(), module_groups: [] }
                  setRoleGroups(gs => [...gs, newGroup])
                  setEditingGroup(newGroup)
                  setNewGroupName('')
                }}
                  className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover transition">
                  Add Group
                </button>
              </div>

              {roleGroups.length === 0 && (
                <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 px-6 py-8 text-center">
                  <p className="text-sm text-gray-500 mb-1">No permission groups yet</p>
                  <p className="text-xs text-gray-400">Create groups like "Operations", "Finance Team", or "Course Builder" to quickly assign module access to staff.</p>
                </div>
              )}
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
