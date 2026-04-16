import { useState, useEffect, useRef, useCallback } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { refreshTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import type { Organization, PayType, RoleCategory, PayTypeSettings, FlowStep, MenteeFlow, CancellationPolicy, RoleGroup, ArchiveSettings, ArchiveDeleteUnit, AllocationGrantMode, AllocationRefreshMode, FlowLayoutMode } from '../types'
import CancellationPolicyEditor, { DEFAULT_CANCELLATION_POLICY } from '../components/CancellationPolicyEditor'
import { ALL_MODULES, ALWAYS_VISIBLE, modulesByGroup } from '../lib/modules'

const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'pct_monthly_profit', label: '% of monthly profit' },
  { value: 'pct_engagement_profit', label: '% of a specific engagement' },
  { value: 'pct_course_profit', label: '% of a specific course' },
  { value: 'pct_per_meeting', label: '% of each completed meeting' },
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

// Card sections (no more tabs)

const DEFAULT_ARCHIVE_SETTINGS: ArchiveSettings = {
  auto_delete_enabled: false,
  auto_delete_value: 90,
  auto_delete_unit: 'days',
}

const ARCHIVE_UNITS: { value: ArchiveDeleteUnit; label: string }[] = [
  { value: 'days', label: 'days' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
]

const GROUP_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  People:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  Business: { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400' },
  Finance:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  System:   { bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-400' },
}

export default function CompanySettingsPage() {
  const { profile } = useAuth()
  const toast = useToast()
  // No more tabs — card layout

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  const [enableLessonDueDates, setEnableLessonDueDates] = useState(false)
  const [allowMultiEngagement, setAllowMultiEngagement] = useState(false)
  const [journeyAutoAssign, setJourneyAutoAssign] = useState(false)
  const [flowLayoutMode, setFlowLayoutMode] = useState<FlowLayoutMode>('freeform')
  const [showAllDaysInScheduler, setShowAllDaysInScheduler] = useState(true)
  const [schedulerMaxDaysAhead, setSchedulerMaxDaysAhead] = useState(14)
  const [allocationGrantMode, setAllocationGrantMode] = useState<AllocationGrantMode>('on_open')
  const [allocationRefreshMode, setAllocationRefreshMode] = useState<AllocationRefreshMode>('by_cycle')
  const [payForUncredited, setPayForUncredited] = useState(false)
  const [archiveSettings, setArchiveSettings] = useState<ArchiveSettings>(DEFAULT_ARCHIVE_SETTINGS)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    toast.error('Request timed out. Please refresh the page.')
  }, []))

  useEffect(() => {
    if (!profile?.organization_id) { console.warn('[CompanySettingsPage] No profile.organization_id — profile:', profile); setLoading(false); return }
    async function fetchOrg() {
      try {
        const { data, error } = await supabase.from('organizations').select('*').eq('id', profile!.organization_id).single()
        if (error) { toast.error('Failed to load: ' + error.message); return }
        const o = data as Organization
        setOrg(o)
        setName(o.name); setSlug(o.slug); setLogoUrl(o.logo_url ?? '')
        setPrimaryColor(o.primary_color); setSecondaryColor(o.secondary_color); setTertiaryColor(o.tertiary_color)
        setPaySettings(o.pay_type_settings ?? DEFAULT_PAY_SETTINGS)
        setFlowSteps((o.mentee_flow as MenteeFlow)?.steps ?? [])
        setCancellationPolicy(o.default_cancellation_policy ?? DEFAULT_CANCELLATION_POLICY)
        setRoleGroups(o.role_groups ?? [])
        setEnableLessonDueDates(o.enable_lesson_due_dates ?? false)
        setAllowMultiEngagement(o.allow_multi_engagement ?? false)
        setJourneyAutoAssign(o.journey_auto_assign_offerings ?? false)
        setFlowLayoutMode(o.flow_layout_mode ?? 'freeform')
        setShowAllDaysInScheduler(o.show_all_days_in_scheduler ?? true)
        setSchedulerMaxDaysAhead(o.scheduler_max_days_ahead ?? 14)
        setAllocationGrantMode(o.allocation_grant_mode ?? 'on_open')
        setAllocationRefreshMode(o.allocation_refresh_mode ?? 'by_cycle')
        setPayForUncredited(o.pay_mentors_for_uncredited_meetings ?? false)
        setArchiveSettings(o.archive_settings ?? DEFAULT_ARCHIVE_SETTINGS)
      } catch (err) {
        toast.error('Failed to load: ' + ((err as Error).message || 'Unknown error'))
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchOrg()
  }, [profile?.organization_id])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!org) return
    setSaving(true)
    try {
      const updates = {
        name: name.trim(), slug: slug.trim().toLowerCase(), logo_url: logoUrl.trim() || null,
        primary_color: primaryColor.trim(), secondary_color: secondaryColor.trim(), tertiary_color: tertiaryColor.trim(),
        pay_type_settings: paySettings, mentee_flow: { steps: flowSteps }, default_cancellation_policy: cancellationPolicy,
        role_groups: roleGroups,
        enable_lesson_due_dates: enableLessonDueDates,
        allow_multi_engagement: allowMultiEngagement,
        journey_auto_assign_offerings: journeyAutoAssign,
        flow_layout_mode: flowLayoutMode,
        show_all_days_in_scheduler: showAllDaysInScheduler,
        scheduler_max_days_ahead: schedulerMaxDaysAhead,
        allocation_grant_mode: allocationGrantMode,
        allocation_refresh_mode: allocationRefreshMode,
        pay_mentors_for_uncredited_meetings: payForUncredited,
        archive_settings: archiveSettings,
      }
      const { error } = await supabase.from('organizations').update(updates).eq('id', org.id)
      if (error) { reportSupabaseError(error, { component: 'CompanySettingsPage', action: 'save' }); toast.error(error.message); return }
      const updatedOrg = { ...org, ...updates }
      setOrg(updatedOrg)
      refreshTheme(updatedOrg)
      const oldVals = { name: org.name, slug: org.slug, logo_url: org.logo_url, primary_color: org.primary_color, secondary_color: org.secondary_color, tertiary_color: org.tertiary_color }
      await logAudit({ organization_id: org.id, actor_id: profile!.id, action: 'updated', entity_type: 'organization', entity_id: org.id, details: { section: 'settings' }, old_values: oldVals, new_values: { name: updates.name, slug: updates.slug, logo_url: updates.logo_url, primary_color: updates.primary_color, secondary_color: updates.secondary_color, tertiary_color: updates.tertiary_color } })
      toast.success('Settings saved.')
    } catch (err) {
      reportSupabaseError({ message: (err as Error).message || 'Failed to save settings' }, { component: 'CompanySettingsPage', action: 'save' })
      toast.error((err as Error).message || 'Failed to save settings')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(file: File) {
    if (!org) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const filePath = `${org.id}/logo.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true })
    if (uploadError) { reportSupabaseError(uploadError, { component: 'CompanySettingsPage', action: 'logoUpload' }); toast.error('Upload failed: ' + uploadError.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
    setLogoUrl(urlData.publicUrl); setUploading(false)
    toast.success('Logo uploaded. Click Save to apply.')
  }

  if (loading) return <Skeleton count={5} className="h-11 w-full" gap="gap-3" />

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  const toggleClass = (on: boolean) => `relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${on ? 'bg-brand' : 'bg-gray-200'}`
  const dotClass = (on: boolean) => `inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${on ? 'translate-x-[22px]' : 'translate-x-[3px]'}`

  return (
    <div className="max-w-4xl">
      <form onSubmit={handleSave}>
        {/* Header with save */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-gray-900">Company Settings</h1>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>


        <div className="space-y-5">

          {/* ── Branding ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Branding</h2>
              <p className="text-xs text-gray-400 mt-0.5">Company identity, logo, and brand colors.</p>
            </div>
            <div className="px-6 py-5 space-y-5">
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
          </div>

          {/* ── Offerings ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Offerings</h2>
              <p className="text-xs text-gray-400 mt-0.5">Settings for courses and engagements.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Per-lesson due dates</p>
                  <p className="text-xs text-gray-500 mt-0.5">Allow courses to have individual due dates for each lesson, calculated as days from enrollment.</p>
                </div>
                <button type="button" onClick={() => setEnableLessonDueDates(!enableLessonDueDates)} className={toggleClass(enableLessonDueDates)}>
                  <span className={dotClass(enableLessonDueDates)} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Multiple open engagements</p>
                  <p className="text-xs text-gray-500 mt-0.5">Allow a mentee to have more than one active engagement at the same time.</p>
                </div>
                <button type="button" onClick={() => setAllowMultiEngagement(!allowMultiEngagement)} className={toggleClass(allowMultiEngagement)}>
                  <span className={dotClass(allowMultiEngagement)} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
                <div className="pr-4">
                  <p className="text-sm font-medium text-gray-900">Auto-assign offerings from Journeys</p>
                  <p className="text-xs text-gray-500 mt-0.5">When a mentee's journey reaches an offering node, automatically create the course or engagement assignment. When off, the journey pauses and a mentor must manually confirm the assignment.</p>
                </div>
                <button type="button" onClick={() => setJourneyAutoAssign(!journeyAutoAssign)} className={toggleClass(journeyAutoAssign)}>
                  <span className={dotClass(journeyAutoAssign)} />
                </button>
              </div>
              <div className="rounded-lg border border-gray-200 px-4 py-4">
                <p className="text-sm font-medium text-gray-900">Journey flow layout</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">How nodes are arranged in the journey flow editor.</p>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${flowLayoutMode === 'auto' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="flowLayoutMode" value="auto"
                      checked={flowLayoutMode === 'auto'}
                      onChange={() => setFlowLayoutMode('auto')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Automatic layout</p>
                      <p className="text-xs text-gray-500">Nodes arrange themselves in rows by graph depth. Drag to reorder within a row. The layout stays clean automatically.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${flowLayoutMode === 'freeform' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="flowLayoutMode" value="freeform"
                      checked={flowLayoutMode === 'freeform'}
                      onChange={() => setFlowLayoutMode('freeform')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Freeform with grid snap</p>
                      <p className="text-xs text-gray-500">Drag nodes freely on a snapping grid. Use the Auto-arrange button to organize by graph depth when needed.</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
                <div className="pr-4">
                  <p className="text-sm font-medium text-gray-900">Show all days in mentee scheduler</p>
                  <p className="text-xs text-gray-500 mt-0.5">When on, the mentee "Schedule a Meeting" date dropdown lists all upcoming dates (days with no availability appear disabled). When off, only days that have availability on the assigned mentor's schedule are shown.</p>
                </div>
                <button type="button" onClick={() => setShowAllDaysInScheduler(!showAllDaysInScheduler)} className={toggleClass(showAllDaysInScheduler)}>
                  <span className={dotClass(showAllDaysInScheduler)} />
                </button>
              </div>

              {/* Scheduler max days ahead */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
                <div className="pr-4">
                  <p className="text-sm font-medium text-gray-900">Max scheduling window</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    How many days in the future a mentee can schedule meetings from their engagement detail page.
                    Increase this if you want mentees to be able to book months of meetings at once (up to 365).
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={schedulerMaxDaysAhead}
                    onChange={e => {
                      const n = parseInt(e.target.value)
                      if (!isNaN(n)) setSchedulerMaxDaysAhead(Math.max(1, Math.min(365, n)))
                    }}
                    className="w-20 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 text-right outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                  />
                  <span className="text-xs text-gray-500">days</span>
                </div>
              </div>

              {/* Allocation grant mode */}
              <div className="rounded-lg border border-gray-200 px-4 py-4">
                <p className="text-sm font-medium text-gray-900">Initial meeting allocation</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">When a mentee first receives their meeting credits for a new engagement.</p>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${allocationGrantMode === 'on_open' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="allocGrantMode" value="on_open"
                      checked={allocationGrantMode === 'on_open'}
                      onChange={() => setAllocationGrantMode('on_open')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Allocate as soon as the engagement is opened</p>
                      <p className="text-xs text-gray-500">The mentee can start scheduling meetings the moment the engagement is assigned, before paying the first invoice.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${allocationGrantMode === 'on_first_payment' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="allocGrantMode" value="on_first_payment"
                      checked={allocationGrantMode === 'on_first_payment'}
                      onChange={() => setAllocationGrantMode('on_first_payment')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Allocate once the first invoice is paid</p>
                      <p className="text-xs text-gray-500">Credits stay locked until the mentee's first invoice for the engagement is marked paid.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Allocation refresh mode */}
              <div className="rounded-lg border border-gray-200 px-4 py-4">
                <p className="text-sm font-medium text-gray-900">Additional allocations</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">How the mentee earns each subsequent batch of meeting credits.</p>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${allocationRefreshMode === 'by_cycle' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="allocRefreshMode" value="by_cycle"
                      checked={allocationRefreshMode === 'by_cycle'}
                      onChange={() => setAllocationRefreshMode('by_cycle')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">By cycle</p>
                      <p className="text-xs text-gray-500">Additional batches are granted every weekly/monthly cycle based on the engagement's allocation period.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${allocationRefreshMode === 'by_payment' ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="allocRefreshMode" value="by_payment"
                      checked={allocationRefreshMode === 'by_payment'}
                      onChange={() => setAllocationRefreshMode('by_payment')}
                      className="mt-0.5 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">By invoice payment</p>
                      <p className="text-xs text-gray-500">Each time a new invoice for the engagement is paid, the mentee unlocks another batch of credits.</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ── Payroll ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Payroll</h2>
              <p className="text-xs text-gray-400 mt-0.5">Compensation methods available for each role.</p>
            </div>
            <div className="px-6 py-5">
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

              {/* Uncredited meeting toggle */}
              <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-gray-200 px-4 py-4">
                <div className="pr-4">
                  <p className="text-sm font-medium text-gray-900">Pay staff for uncredited meetings</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    When a meeting is cancelled or no-showed AND the cancellation policy kept the mentee charged,
                    should the staff member (on % of completed meetings) still be paid for it?
                    When off, uncredited meetings are unpaid and the value stays with the org.
                  </p>
                </div>
                <button type="button" onClick={() => setPayForUncredited(!payForUncredited)} className={toggleClass(payForUncredited)}>
                  <span className={dotClass(payForUncredited)} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Mentee Flow ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Mentee Flow</h2>
              <p className="text-xs text-gray-400 mt-0.5">Define the expected progression of mentees through your program.</p>
            </div>
            <div className="px-6 py-5">
              <MenteeFlowEditor flowSteps={flowSteps} setFlowSteps={setFlowSteps} newStepName={newStepName} setNewStepName={setNewStepName} inputClass={inputClass} />
            </div>
          </div>

          {/* ── Cancellation Policy ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Cancellation Policy</h2>
              <p className="text-xs text-gray-400 mt-0.5">Default cancellation policy for engagements. Individual engagements can override.</p>
            </div>
            <div className="px-6 py-5">
              <CancellationPolicyEditor policy={cancellationPolicy} onChange={setCancellationPolicy} />
            </div>
          </div>

          {/* ── Permissions ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Permissions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Permission groups for staff module access.</p>
            </div>
            <div className="px-6 py-5 space-y-5">
              {roleGroups.length > 0 && (
                <div className="space-y-3">
                  {roleGroups.map(group => {
                    const isEditing = editingGroup?.id === group.id
                    const current = isEditing ? editingGroup! : group
                    const allGroups = modulesByGroup().filter(g => g.group !== 'Main')
                    const moduleCount = ALL_MODULES.filter(m => !ALWAYS_VISIBLE.includes(m.key) && current.module_groups.includes(m.group)).length
                    return (
                      <div key={group.id} className={`rounded-lg border transition-all ${isEditing ? 'border-brand shadow-sm' : 'border-gray-200'}`}>
                        <div className={`flex items-center justify-between px-4 py-3 ${isEditing ? 'bg-brand-light/30' : 'bg-gray-50/50'} rounded-t-lg`}>
                          {isEditing ? (
                            <input type="text" value={current.name} onChange={e => setEditingGroup({ ...current, name: e.target.value })}
                              className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20" autoFocus />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{moduleCount} modules</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button type="button" onClick={() => { setRoleGroups(gs => gs.map(g => g.id === current.id ? current : g)); setEditingGroup(null) }} className="px-2.5 py-1 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover transition">Save</button>
                                <button type="button" onClick={() => setEditingGroup(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => setEditingGroup({ ...group })} className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-brand transition">Edit</button>
                                <button type="button" onClick={() => setRoleGroups(gs => gs.filter(g => g.id !== group.id))} className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-red-500 transition">Remove</button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-2">
                            {allGroups.map(mg => {
                              const active = current.module_groups.includes(mg.group)
                              const style = GROUP_COLORS[mg.group] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }
                              return (
                                <button key={mg.group} type="button" disabled={!isEditing} onClick={() => {
                                  if (!isEditing) return
                                  const next = active ? current.module_groups.filter(g => g !== mg.group) : [...current.module_groups, mg.group]
                                  setEditingGroup({ ...current, module_groups: next })
                                }} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-all ${active ? `${style.bg} border-current/10 ${style.text}` : 'bg-white border-gray-200 text-gray-400'} ${isEditing ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}>
                                  <span className={`w-2.5 h-2.5 rounded-full transition-colors ${active ? style.dot : 'bg-gray-200'}`} />
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-semibold block ${active ? style.text : 'text-gray-400'}`}>{mg.group}</span>
                                    <span className="text-[10px] text-gray-400">{mg.modules.map(m => m.label).join(', ')}</span>
                                  </div>
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${active ? 'bg-brand border-brand' : 'border-gray-300 bg-white'}`}>
                                    {active && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
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
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name (e.g. Operations, Course Builder)" className={inputClass + ' flex-1'}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!newGroupName.trim()) return; const ng: RoleGroup = { id: `rg-${crypto.randomUUID().slice(0, 8)}`, name: newGroupName.trim(), module_groups: [] }; setRoleGroups(gs => [...gs, ng]); setEditingGroup(ng); setNewGroupName('') } }} />
                <Button type="button" onClick={() => { if (!newGroupName.trim()) return; const ng: RoleGroup = { id: `rg-${crypto.randomUUID().slice(0, 8)}`, name: newGroupName.trim(), module_groups: [] }; setRoleGroups(gs => [...gs, ng]); setEditingGroup(ng); setNewGroupName('') }}>Add Group</Button>
              </div>
              {roleGroups.length === 0 && (
                <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 px-6 py-8 text-center">
                  <p className="text-sm text-gray-500 mb-1">No permission groups yet</p>
                  <p className="text-xs text-gray-400">Create groups like "Operations", "Finance Team", or "Course Builder" to quickly assign module access to staff.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Archives ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Archives</h2>
              <p className="text-xs text-gray-400 mt-0.5">Manage how archived staff and mentees are handled.</p>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-lg border border-gray-200 px-5 py-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Automatic deletion</p>
                    <p className="text-xs text-gray-500 mt-0.5">Permanently delete archived people after a set period. This cannot be undone.</p>
                  </div>
                  <button type="button" onClick={() => setArchiveSettings(s => ({ ...s, auto_delete_enabled: !s.auto_delete_enabled }))} className={toggleClass(archiveSettings.auto_delete_enabled)}>
                    <span className={dotClass(archiveSettings.auto_delete_enabled)} />
                  </button>
                </div>
                {archiveSettings.auto_delete_enabled && (
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <span className="text-sm text-gray-700">Delete after</span>
                    <input type="number" min="1" value={archiveSettings.auto_delete_value} onChange={e => setArchiveSettings(s => ({ ...s, auto_delete_value: parseInt(e.target.value) || 1 }))}
                      className="w-20 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition" />
                    <select value={archiveSettings.auto_delete_unit} onChange={e => setArchiveSettings(s => ({ ...s, auto_delete_unit: e.target.value as ArchiveDeleteUnit }))}
                      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white">
                      {ARCHIVE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    <span className="text-sm text-gray-500">of being archived</span>
                  </div>
                )}
                {!archiveSettings.auto_delete_enabled && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs text-gray-500">Archived people will be kept indefinitely until manually deleted.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Notifications ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
              <p className="text-xs text-gray-400 mt-0.5">Email and in-app notification preferences.</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-400">Coming soon.</p>
            </div>
          </div>

          {/* ── Integrations ── */}
          <div className="bg-white rounded-lg border border-gray-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Integrations</h2>
              <p className="text-xs text-gray-400 mt-0.5">Third-party connections and calendar sync.</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-400">Coming soon.</p>
            </div>
          </div>

          {/* Save button at bottom too */}
          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

// --- Mentee Flow Editor with drag-and-drop + up/down buttons ---

function MenteeFlowEditor({
  flowSteps,
  setFlowSteps,
  newStepName,
  setNewStepName,
  inputClass,
}: {
  flowSteps: FlowStep[]
  setFlowSteps: React.Dispatch<React.SetStateAction<FlowStep[]>>
  newStepName: string
  setNewStepName: (v: string) => void
  inputClass: string
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const sorted = [...flowSteps].sort((a, b) => {
    if (a.in_flow && !b.in_flow) return -1
    if (!a.in_flow && b.in_flow) return 1
    return a.order - b.order
  })
  const flowItems = sorted.filter(s => s.in_flow)

  function moveStep(stepId: string, direction: -1 | 1) {
    const idx = flowItems.findIndex(s => s.id === stepId)
    if (idx < 0) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= flowItems.length) return
    const target = flowItems[targetIdx]
    const current = flowItems[idx]
    setFlowSteps(s => s.map(x =>
      x.id === current.id ? { ...x, order: target.order } :
      x.id === target.id ? { ...x, order: current.order } : x
    ))
  }

  function handleDragStart(stepId: string) {
    setDragId(stepId)
  }

  function handleDragOver(e: React.DragEvent, stepId: string) {
    e.preventDefault()
    if (dragId && dragId !== stepId) setDragOverId(stepId)
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }

    // Only reorder within flow items
    const fromIdx = flowItems.findIndex(s => s.id === dragId)
    const toIdx = flowItems.findIndex(s => s.id === targetId)
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null)
      setDragOverId(null)
      return
    }

    const reordered = [...flowItems]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    // Reassign order indices
    setFlowSteps(prev => {
      const orderMap = new Map<string, number>()
      reordered.forEach((s, i) => orderMap.set(s.id, i))
      return prev.map(s => orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s)
    })

    setDragId(null)
    setDragOverId(null)
  }

  function addStep() {
    if (!newStepName.trim()) return
    setFlowSteps(s => [...s, {
      id: crypto.randomUUID(),
      name: newStepName.trim(),
      type: 'status' as const,
      offering_id: null,
      in_flow: true,
      order: flowSteps.length,
    }])
    setNewStepName('')
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Define the expected progression of mentees through your program. Drag items or use the arrow buttons to reorder.</p>

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((step) => {
            const flowIdx = step.in_flow ? flowItems.indexOf(step) : -1
            const isFirst = flowIdx === 0
            const isLast = flowIdx === flowItems.length - 1
            const isDragTarget = dragOverId === step.id

            return (
              <div
                key={step.id}
                draggable={step.in_flow}
                onDragStart={() => step.in_flow && handleDragStart(step.id)}
                onDragOver={e => step.in_flow && handleDragOver(e, step.id)}
                onDrop={() => handleDrop(step.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  isDragTarget
                    ? 'border-brand bg-brand-light/60 shadow-sm'
                    : step.in_flow
                      ? 'border-brand/30 bg-brand-light'
                      : 'border-gray-200 bg-gray-50'
                } ${step.in_flow ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {/* Order number */}
                {step.in_flow && (
                  <span className="w-7 h-7 rounded-full bg-brand/10 text-brand font-bold text-sm flex items-center justify-center shrink-0">
                    {flowIdx + 1}
                  </span>
                )}
                {!step.in_flow && <div className="w-7" />}

                {/* Up/down buttons */}
                {step.in_flow ? (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => moveStep(step.id, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-brand hover:border-brand disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-gray-200 transition-colors"
                      title="Move up"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => moveStep(step.id, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-brand hover:border-brand disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-gray-200 transition-colors"
                      title="Move down"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                ) : <div className="w-6" />}

                {/* Drag handle */}
                {step.in_flow && (
                  <div className="shrink-0 text-gray-300" title="Drag to reorder">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                    </svg>
                  </div>
                )}

                {/* Name + type */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">{step.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    step.type === 'course' ? 'bg-violet-50 text-violet-600' :
                    step.type === 'engagement' ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{step.type}</span>
                </div>

                {/* Toggle in-flow */}
                <button type="button" onClick={() => setFlowSteps(s => s.map(x => x.id === step.id ? { ...x, in_flow: !x.in_flow } : x))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${step.in_flow ? 'bg-brand' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${step.in_flow ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>

                {/* Delete */}
                <button type="button" onClick={() => setFlowSteps(s => s.filter(x => x.id !== step.id))} className="text-gray-300 hover:text-red-500 transition-colors text-sm">&times;</button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="text" value={newStepName} onChange={e => setNewStepName(e.target.value)}
          placeholder="Add a status (e.g. Lead, Graduated)" className={inputClass + ' flex-1'}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }} />
        <Button type="button" onClick={addStep}>Add</Button>
      </div>
    </div>
  )
}
