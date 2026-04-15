import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import TimezoneSelect from '../components/TimezoneSelect'
import type { StaffMember, PayType, PayTypeSettings, RoleCategory, StaffRole, Offering, PayFrequency } from '../types'
import { STAFF_ROLE_LABELS, STAFF_UMBRELLA_ROLES, PERCENTAGE_PAY_TYPES, OFFERING_LINKED_PAY_TYPES, PAY_FREQUENCY_LABELS } from '../types'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import { useToast } from '../context/ToastContext'
import { reportSupabaseError } from '../lib/errorReporter'

const personalSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name:  z.string().min(1, 'Last name is required'),
  email:      z.string().email('Enter a valid email'),
  phone:      z.string(),
  role:       z.string(),   // StaffRole at runtime; looser here
  street:     z.string(),
  city:       z.string(),
  state:      z.string(),
  zip:        z.string(),
  country:    z.string(),
})

type PersonalFormValues = z.infer<typeof personalSchema>

const compensationSchema = z.object({
  pay_type:           z.string(),
  pay_rate:           z.string(),
  pay_offering_id:    z.string(),
  pay_frequency:      z.string(),
  max_active_mentees: z.string(),
})

type CompensationFormValues = z.infer<typeof compensationSchema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'
const errorClass = 'mt-1 text-xs text-red-500'

const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: 'Hourly',
  salary: 'Salary',
  pct_monthly_profit: '% of monthly profit',
  pct_engagement_profit: '% of a specific engagement',
  pct_course_profit: '% of a specific course',
  pct_per_meeting: '% of each completed meeting',
}

const PAY_TYPE_HINTS: Record<PayType, string> = {
  hourly: 'Paid per hour worked.',
  salary: 'Fixed recurring amount.',
  pct_monthly_profit: 'A share of total monthly profit across all courses and engagements.',
  pct_engagement_profit: 'A share of the profit from one specific engagement. Select which engagement below.',
  pct_course_profit: 'A share of the profit from one specific course. Select which course below.',
  pct_per_meeting: 'A share of the per-meeting value (engagement price ÷ meetings per cycle) paid for every meeting the staff member completes with their paired mentees.',
}

function getRoleCategory(role: string): RoleCategory {
  if (role === 'mentor') return 'mentor'
  if (role === 'assistant_mentor') return 'assistant_mentor'
  // admin, operations, course_creator, and legacy 'staff' all fall under the
  // staff pay category.
  return 'staff'
}

export default function PersonEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile: currentUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [person, setPerson] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  // Timezone is edited via the custom TimezoneSelect (value/onChange props),
  // so it stays in local state rather than the RHF form.
  const [timezone, setTimezone] = useState<string | null>(null)

  const [orgOfferings, setOrgOfferings] = useState<Offering[]>([])
  const [availablePayTypes, setAvailablePayTypes] = useState<PayType[]>([])

  // System actions
  const [sendingReset, setSendingReset] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)

  // Archive / Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const personalForm = useForm<PersonalFormValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      first_name: '', last_name: '', email: '', phone: '',
      role: 'staff',
      street: '', city: '', state: '', zip: '', country: '',
    },
  })

  const compForm = useForm<CompensationFormValues>({
    resolver: zodResolver(compensationSchema),
    defaultValues: {
      pay_type: '',
      pay_rate: '',
      pay_offering_id: '',
      pay_frequency: '',
      max_active_mentees: '',
    },
  })

  const payType = compForm.watch('pay_type') as PayType | ''

  useEffect(() => {
    if (!id) return

    async function fetchPerson() {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('id', id!)
        .single()

      if (error) {
        setFetchError(error.message)
        setLoading(false)
        return
      }

      const p = data as StaffMember
      setPerson(p)
      setTimezone(p.timezone ?? null)

      personalForm.reset({
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        phone: p.phone ?? '',
        role: p.role,
        street: p.street ?? '',
        city: p.city ?? '',
        state: p.state ?? '',
        zip: p.zip ?? '',
        country: p.country ?? '',
      })
      compForm.reset({
        pay_type: p.pay_type ?? '',
        pay_rate: p.pay_rate != null ? String(p.pay_rate) : '',
        pay_offering_id: p.pay_offering_id ?? '',
        pay_frequency: p.pay_frequency ?? '',
        max_active_mentees: p.max_active_mentees != null ? String(p.max_active_mentees) : '',
      })

      // Fetch org pay settings + offerings (for pay_offering_id dropdown) in parallel
      const [orgRes, offeringsRes] = await Promise.all([
        supabase.from('organizations').select('pay_type_settings').eq('id', p.organization_id).single(),
        supabase.from('offerings').select('*').eq('organization_id', p.organization_id).order('name'),
      ])
      setOrgOfferings((offeringsRes.data ?? []) as Offering[])

      const orgData = orgRes.data
      if (orgData?.pay_type_settings) {
        const settings = orgData.pay_type_settings as PayTypeSettings
        const category = getRoleCategory(p.role)
        setAvailablePayTypes(settings[category] ?? [])
      }

      setLoading(false)
    }

    fetchPerson()
  }, [id, personalForm, compForm])

  async function onSavePersonal(values: PersonalFormValues) {
    if (!person) return

    const newVals = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      street: values.street.trim() || null,
      city: values.city.trim() || null,
      state: values.state.trim() || null,
      zip: values.zip.trim() || null,
      country: values.country.trim() || null,
    }

    const { error } = await supabase
      .from('staff')
      .update({
        ...newVals,
        timezone: timezone,
        role: values.role as StaffRole,
      })
      .eq('id', person.id)

    if (error) {
      reportSupabaseError(error, { component: 'PersonEditPage', action: 'saveProfile' })
      toast.error(error.message)
      return
    }

    const oldVals = {
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      phone: person.phone,
      street: person.street,
      city: person.city,
      state: person.state,
      zip: person.zip,
      country: person.country,
    }
    setPerson({ ...person, ...newVals, role: values.role as StaffRole, timezone })
    if (currentUser) {
      await logAudit({
        organization_id: person.organization_id,
        actor_id: currentUser.id,
        action: 'updated',
        entity_type: 'staff',
        entity_id: person.id,
        details: { name: `${newVals.first_name} ${newVals.last_name}`, fields: 'personal_info' },
        old_values: oldVals,
        new_values: newVals,
      })
    }
    toast.success('Personal information has been updated.')
  }

  async function onSaveCompensation(values: CompensationFormValues) {
    if (!person) return

    const rateNum = values.pay_rate ? parseFloat(values.pay_rate) : null
    const maxMentees = values.max_active_mentees ? parseInt(values.max_active_mentees) : null
    const pt = values.pay_type as PayType | ''
    // Only persist pay_offering_id when the selected pay type actually uses it.
    const offeringIdToSave = pt && OFFERING_LINKED_PAY_TYPES.includes(pt)
      ? (values.pay_offering_id || null)
      : null
    // Only persist pay_frequency when the pay type is salary.
    const frequencyToSave: PayFrequency | null = pt === 'salary'
      ? ((values.pay_frequency as PayFrequency) || null)
      : null

    const { error } = await supabase
      .from('staff')
      .update({
        pay_type: pt || null,
        pay_rate: rateNum,
        pay_offering_id: offeringIdToSave,
        pay_frequency: frequencyToSave,
        max_active_mentees: maxMentees,
      })
      .eq('id', person.id)

    if (error) {
      reportSupabaseError(error, { component: 'PersonEditPage', action: 'saveCompensation' })
      toast.error(error.message)
      return
    }

    const oldComp = {
      pay_type: person.pay_type,
      pay_rate: person.pay_rate,
      pay_offering_id: person.pay_offering_id,
      pay_frequency: person.pay_frequency,
      max_active_mentees: person.max_active_mentees,
    }
    const newComp = {
      pay_type: (pt || null) as PayType | null,
      pay_rate: rateNum,
      pay_offering_id: offeringIdToSave,
      pay_frequency: frequencyToSave,
      max_active_mentees: maxMentees,
    }
    setPerson({ ...person, ...newComp })
    if (currentUser) {
      await logAudit({
        organization_id: person.organization_id,
        actor_id: currentUser.id,
        action: 'updated',
        entity_type: 'staff',
        entity_id: person.id,
        details: { name: `${person.first_name} ${person.last_name}`, fields: 'compensation' },
        old_values: oldComp,
        new_values: newComp,
      })
    }
    toast.success('Compensation has been updated.')
  }

  async function handlePasswordReset() {
    if (!person) return
    setSendingReset(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: person.email }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const msg = body.msg || body.message || body.error_description || `Error ${response.status}`
        reportSupabaseError({ message: msg }, { component: 'PersonEditPage', action: 'passwordReset' })
        toast.error(msg)
        return
      }

      toast.success(`Password reset email sent to ${person.email}.`)
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
        : 'Unknown error'
      reportSupabaseError({ message }, { component: 'PersonEditPage', action: 'passwordReset' })
      toast.error(message)
    } finally {
      setSendingReset(false)
    }
  }

  async function handleInvite() {
    if (!person) return
    setSendingInvite(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: person.email }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const msg = body.msg || body.message || body.error_description || `Error ${response.status}`
        reportSupabaseError({ message: msg }, { component: 'PersonEditPage', action: 'sendInvite' })
        toast.error(msg)
        return
      }

      toast.success(`Invitation sent to ${person.email}.`)
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out' : err.message)
        : 'Unknown error'
      reportSupabaseError({ message }, { component: 'PersonEditPage', action: 'sendInvite' })
      toast.error(message)
    } finally {
      setSendingInvite(false)
    }
  }

  async function handleArchive() {
    if (!person || !currentUser) return
    const isArchived = !!person.archived_at
    const now = isArchived ? null : new Date().toISOString()
    const { error } = await supabase.from('staff').update({ archived_at: now }).eq('id', person.id)
    if (error) { reportSupabaseError(error, { component: 'PersonEditPage', action: 'archive' }); toast.error(error.message); return }
    setPerson({ ...person, archived_at: now } as StaffMember)
    await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: isArchived ? 'unarchived' : 'archived', entity_type: 'staff', entity_id: person.id })
    toast.success(isArchived ? 'Record restored.' : 'Record archived.')
  }

  async function handleDelete() {
    if (!person || !currentUser) return
    setDeleting(true)
    const { error } = await supabase.from('staff').delete().eq('id', person.id)
    setDeleting(false)
    if (error) { reportSupabaseError(error, { component: 'PersonEditPage', action: 'delete' }); toast.error(error.message); return }
    await logAudit({ organization_id: person.organization_id, actor_id: currentUser.id, action: 'deleted', entity_type: 'staff', entity_id: person.id })
    navigate(-1)
  }

  if (loading) return <Skeleton count={6} className="h-11 w-full" gap="gap-3" />

  if (fetchError || !person) {
    return (
      <div className="max-w-4xl">
        <div className="rounded border bg-red-50 border-red-200 px-4 py-3 text-sm text-red-700">
          {fetchError || 'Person not found.'}
        </div>
      </div>
    )
  }

  const { register: personalRegister, handleSubmit: personalHandleSubmit, formState: personalFormState } = personalForm
  const { register: compRegister, handleSubmit: compHandleSubmit, formState: compFormState } = compForm
  const personalErrors = personalFormState.errors
  const hasAuthAccount = person.user_id !== null

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
            {person.first_name[0]}{person.last_name[0]}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {person.first_name} {person.last_name}
            </h1>
            <p className="text-xs text-gray-500 capitalize">{person.role}</p>
          </div>
        </div>
      </div>

      {/* Row 1 — Personal info + right sidebar (compensation / max mentees / availability) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column — Personal Information (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Personal Information</h2>

            <form onSubmit={personalHandleSubmit(onSavePersonal)} className="space-y-5">
              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">
                    First name
                  </label>
                  <input id="firstName" type="text" {...personalRegister('first_name')} className={inputClass} />
                  {personalErrors.first_name && <p className={errorClass}>{personalErrors.first_name.message}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Last name
                  </label>
                  <input id="lastName" type="text" {...personalRegister('last_name')} className={inputClass} />
                  {personalErrors.last_name && <p className={errorClass}>{personalErrors.last_name.message}</p>}
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <input id="editEmail" type="email" {...personalRegister('email')} className={inputClass} />
                  {personalErrors.email && <p className={errorClass}>{personalErrors.email.message}</p>}
                </div>
                <div>
                  <label htmlFor="editPhone" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phone
                  </label>
                  <input id="editPhone" type="tel" {...personalRegister('phone')} placeholder="Optional" className={inputClass} />
                </div>
              </div>

              {/* Street */}
              <div>
                <label htmlFor="editStreet" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Street address
                </label>
                <input id="editStreet" type="text" {...personalRegister('street')} placeholder="Optional" className={inputClass} />
              </div>

              {/* City / State / Zip */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="editCity" className="block text-sm font-medium text-gray-700 mb-1.5">
                    City
                  </label>
                  <input id="editCity" type="text" {...personalRegister('city')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="editState" className="block text-sm font-medium text-gray-700 mb-1.5">
                    State
                  </label>
                  <input id="editState" type="text" {...personalRegister('state')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="editZip" className="block text-sm font-medium text-gray-700 mb-1.5">
                    ZIP
                  </label>
                  <input id="editZip" type="text" {...personalRegister('zip')} className={inputClass} />
                </div>
              </div>

              {/* Country */}
              <div>
                <label htmlFor="editCountry" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Country
                </label>
                <input id="editCountry" type="text" {...personalRegister('country')} className={inputClass} />
              </div>

              {/* Timezone */}
              <div>
                <label htmlFor="editTimezone" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Timezone
                </label>
                <TimezoneSelect id="editTimezone" value={timezone} onChange={setTimezone} />
                <p className="text-[11px] text-gray-400 mt-1">Used to interpret their weekly availability and display meeting times.</p>
              </div>

              {/* Role — only editable for staff-umbrella roles. Mentors and
                   Assistant Mentors have their role pinned by the page they
                   were created from. */}
              {STAFF_UMBRELLA_ROLES.includes(person.role) && (
                <div>
                  <label htmlFor="editRole" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Role
                  </label>
                  <select id="editRole" {...personalRegister('role')}
                    className={inputClass + ' bg-white'}>
                    {STAFF_UMBRELLA_ROLES.map(r => (
                      <option key={r} value={r}>
                        {STAFF_ROLE_LABELS[r]}
                        {r === 'staff' ? ' (legacy)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Admin grants full access. Operations and Course Creator are starting templates — fine-tune individual module access below.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" disabled={personalFormState.isSubmitting}>
                  {personalFormState.isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right column — Compensation / Max Mentees / Availability */}
        <div className="space-y-4">

          {/* Compensation */}
          {person.role !== 'admin' && availablePayTypes.length > 0 && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Compensation</h2>

              <form onSubmit={compHandleSubmit(onSaveCompensation)} className="space-y-4">
                <div>
                  <label htmlFor="payType" className="block text-xs font-medium text-gray-700 mb-1">
                    Pay type
                  </label>
                  <select
                    id="payType"
                    {...compRegister('pay_type')}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                  >
                    <option value="">Not set</option>
                    {availablePayTypes.map(pt => (
                      <option key={pt} value={pt}>{PAY_TYPE_LABELS[pt]}</option>
                    ))}
                  </select>
                </div>

                {payType && (
                  <>
                    <p className="text-[11px] text-gray-400 -mt-2">{PAY_TYPE_HINTS[payType as PayType]}</p>
                    <div>
                      <label htmlFor="payRate" className="block text-xs font-medium text-gray-700 mb-1">
                        {PERCENTAGE_PAY_TYPES.includes(payType as PayType) ? 'Percentage (%)' : 'Rate ($)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          {PERCENTAGE_PAY_TYPES.includes(payType as PayType) ? '%' : '$'}
                        </span>
                        <input
                          id="payRate"
                          type="number"
                          step="any"
                          min="0"
                          {...compRegister('pay_rate')}
                          placeholder="0"
                          className="w-full rounded border border-gray-300 pl-8 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Salary frequency — only for salary */}
                {payType === 'salary' && (
                  <div>
                    <label htmlFor="payFrequency" className="block text-xs font-medium text-gray-700 mb-1">
                      Pay frequency
                    </label>
                    <select
                      id="payFrequency"
                      {...compRegister('pay_frequency')}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                    >
                      <option value="">Select frequency...</option>
                      {(Object.keys(PAY_FREQUENCY_LABELS) as PayFrequency[]).map(f => (
                        <option key={f} value={f}>{PAY_FREQUENCY_LABELS[f]}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">How often the salary amount is paid out.</p>
                  </div>
                )}

                {/* Linked offering — only for pct_engagement_profit / pct_course_profit */}
                {payType && OFFERING_LINKED_PAY_TYPES.includes(payType as PayType) && (() => {
                  const wantedType = payType === 'pct_engagement_profit' ? 'engagement' : 'course'
                  const filtered = orgOfferings.filter(o => o.type === wantedType)
                  return (
                    <div>
                      <label htmlFor="payOffering" className="block text-xs font-medium text-gray-700 mb-1">
                        Paid from
                      </label>
                      <select
                        id="payOffering"
                        {...compRegister('pay_offering_id')}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white"
                      >
                        <option value="">Select {wantedType}...</option>
                        {filtered.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      {filtered.length === 0 && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          No {wantedType}s exist yet. Create one before assigning this pay type.
                        </p>
                      )}
                    </div>
                  )
                })()}

                <Button type="submit" disabled={compFormState.isSubmitting} block>
                  {compFormState.isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </form>
            </div>
          )}

          {/* Max active mentees — standalone card for mentors / assistant mentors */}
          {(person.role === 'mentor' || person.role === 'assistant_mentor') && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Max Active Mentees</h2>
              <form onSubmit={compHandleSubmit(onSaveCompensation)} className="space-y-3">
                <input
                  id="maxMentees"
                  type="number"
                  min="1"
                  {...compRegister('max_active_mentees')}
                  placeholder="No limit"
                  className={inputClass}
                />
                <p className="text-[11px] text-gray-400">
                  Leave blank for no limit. When this mentor reaches their cap, they'll be greyed out in the pairing screen.
                </p>
                <Button type="submit" disabled={compFormState.isSubmitting} block>
                  {compFormState.isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </form>
            </div>
          )}

          {/* Availability — mentors and assistant mentors only */}
          {(person.role === 'mentor' || person.role === 'assistant_mentor') && (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Availability Schedule</h2>
              <p className="text-xs text-gray-500 mb-3">Manage when {person.first_name} is available for mentee sessions.</p>
              <button
                type="button"
                onClick={() => navigate(`/people/${person.id}/availability`)}
                className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center justify-between"
              >
                <span>Edit Availability</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Row 2 — utility cards (Account / System Emails / Danger Zone) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">

          {/* Account status */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>

            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-block w-2 h-2 rounded-full ${hasAuthAccount ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">
                {hasAuthAccount ? 'Login enabled' : 'No login account'}
              </span>
            </div>

            <p className="text-xs text-gray-500 capitalize mb-1">
              Role: <span className="font-medium text-gray-700">{person.role}</span>
            </p>
            <p className="text-xs text-gray-500">
              Added: {formatDate(person.created_at)}
            </p>
          </div>

          {/* System emails */}
          <div className="bg-white rounded-md border border-gray-200/80 px-6 py-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">System Emails</h2>

            <div className="space-y-3">
              {/* Password reset */}
              <div>
                <button
                  onClick={handlePasswordReset}
                  disabled={sendingReset || !hasAuthAccount}
                  className="w-full rounded border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                >
                  {sendingReset ? 'Sending…' : 'Send password reset'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {hasAuthAccount
                    ? 'Sends a password reset link to their email.'
                    : 'User needs a login account first.'}
                </p>
              </div>

              {/* Invite */}
              <div>
                <button
                  onClick={handleInvite}
                  disabled={sendingInvite || hasAuthAccount}
                  className="w-full rounded border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                >
                  {sendingInvite ? 'Sending…' : 'Send org invitation'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {hasAuthAccount
                    ? 'This person already has a login account.'
                    : 'Creates a login account and sends an invite email.'}
                </p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-md border border-red-200 px-6 py-5">
            <h2 className="text-base font-semibold text-red-600 mb-3">Danger Zone</h2>
            <div className="space-y-3">
              {/* Archive / Restore */}
              <div>
                <button type="button" onClick={handleArchive}
                  className={`w-full rounded border px-4 py-2.5 text-sm font-medium transition-colors text-left ${person.archived_at ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                  {person.archived_at ? 'Restore this person' : 'Archive this person'}
                </button>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {person.archived_at
                    ? 'Restoring will make them active again.'
                    : 'Archiving hides them from active lists. Can be restored later.'}
                </p>
              </div>

              {/* Delete */}
              {!showDeleteConfirm ? (
                <div>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
                    Delete this person
                  </button>
                  <p className="text-xs text-gray-400 mt-1 px-1">Permanently remove this person and all their data.</p>
                </div>
              ) : (
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure?</p>
                  <p className="text-xs text-red-600">
                    This will permanently delete <strong>{person.first_name} {person.last_name}</strong> and all associated data. This action cannot be undone.
                  </p>
                  <p className="text-xs text-gray-500">
                    Would you rather <button type="button" onClick={() => { handleArchive(); setShowDeleteConfirm(false) }} className="text-amber-600 font-medium underline hover:text-amber-700">archive</button> them instead? Archived records can be restored later.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="danger" type="button" disabled={deleting} onClick={handleDelete}>
                      {deleting ? 'Deleting…' : 'Yes, permanently delete'}
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setShowDeleteConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

      </div>
    </div>
  )
}
