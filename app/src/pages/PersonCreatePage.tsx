import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import type { StaffRole } from '../types'
import { STAFF_ROLE_LABELS, STAFF_UMBRELLA_ROLES } from '../types'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'

interface PersonCreatePageProps {
  title: string
  defaultRole: StaffRole
  backRoute: string
  /** When true, render a Role dropdown so the creator can choose admin /
   *  operations / course_creator at creation time. Used on the Staff create
   *  page; Mentors and Asst. Mentor create pages omit it since they pin the
   *  role implicitly. */
  allowRoleSelection?: boolean
}

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  email:     z.string().min(1, 'Email is required').email('Invalid email address'),
  phone:     z.string(),
  role:      z.string(),
  street:    z.string(),
  city:      z.string(),
  state:     z.string(),
  zip:       z.string(),
  country:   z.string(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

const errorClass = 'mt-1 text-xs text-red-500'

export default function PersonCreatePage({ title, defaultRole, backRoute, allowRoleSelection }: PersonCreatePageProps) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '', lastName: '', email: '', phone: '',
      role: defaultRole,
      street: '', city: '', state: '', zip: '', country: '',
    },
  })

  async function onSubmit(values: FormValues) {
    if (!profile) return

    // If a staff record with this email already exists, link to the same user_id
    // so the profile switcher works (same person, different role)
    let linkedUserId: string | null = null
    const { data: existing } = await supabase
      .from('staff')
      .select('user_id')
      .eq('organization_id', profile.organization_id)
      .eq('email', values.email.trim())
      .not('user_id', 'is', null)
      .limit(1)
    if (existing?.length && existing[0].user_id) {
      linkedUserId = existing[0].user_id
    }

    const role = values.role as StaffRole

    const { data, error } = await supabase
      .from('staff')
      .insert({
        organization_id: profile.organization_id,
        user_id: linkedUserId,
        first_name: values.firstName.trim(),
        last_name:  values.lastName.trim(),
        email:      values.email.trim(),
        role,
        phone:      values.phone.trim()   || null,
        street:     values.street.trim()  || null,
        city:       values.city.trim()    || null,
        state:      values.state.trim()   || null,
        zip:        values.zip.trim()     || null,
        country:    values.country.trim() || null,
      })
      .select('id')

    if (error) {
      reportSupabaseError(error, { component: 'PersonCreatePage', action: 'create', metadata: { role, email: values.email.trim() } })
      const friendly = error.message.includes('staff_organization_id_email_role_key')
        ? `A ${role} account with the email "${values.email.trim()}" already exists in your organization.`
        : error.message
      toast.error(friendly)
      return
    }

    if (data && data.length > 0) {
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'staff', entity_id: data[0].id, details: { role, name: `${values.firstName.trim()} ${values.lastName.trim()}` } })
      if (linkedUserId) await refreshProfile()
      navigate(`/people/${data[0].id}/edit`)
    } else {
      navigate(backRoute)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(backRoute)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="createFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
              <input id="createFirstName" type="text" {...register('firstName')}
                className={`${inputClass}${errors.firstName ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.firstName && <p className={errorClass}>{errors.firstName.message}</p>}
            </div>
            <div>
              <label htmlFor="createLastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
              <input id="createLastName" type="text" {...register('lastName')}
                className={`${inputClass}${errors.lastName ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.lastName && <p className={errorClass}>{errors.lastName.message}</p>}
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="createEmail" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input id="createEmail" type="email" {...register('email')}
                className={`${inputClass}${errors.email ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.email && <p className={errorClass}>{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="createPhone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input id="createPhone" type="tel" placeholder="Optional" {...register('phone')} className={inputClass} />
            </div>
          </div>

          {/* Role — staff umbrella only */}
          {allowRoleSelection && (
            <div>
              <label htmlFor="createRole" className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <select id="createRole" {...register('role')} className={inputClass + ' bg-white'}>
                {STAFF_UMBRELLA_ROLES.filter(r => r !== 'staff').map(r => (
                  <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Admin has full access. Operations and Course Creator are specialized roles you can tailor further with per-module permissions after creation.
              </p>
            </div>
          )}

          {/* Street */}
          <div>
            <label htmlFor="createStreet" className="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
            <input id="createStreet" type="text" placeholder="Optional" {...register('street')} className={inputClass} />
          </div>

          {/* City / State / Zip */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="createCity" className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
              <input id="createCity" type="text" {...register('city')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="createState" className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <input id="createState" type="text" {...register('state')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="createZip" className="block text-sm font-medium text-gray-700 mb-1.5">ZIP</label>
              <input id="createZip" type="text" {...register('zip')} className={inputClass} />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="createCountry" className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
            <input id="createCountry" type="text" {...register('country')} className={inputClass} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : title}</Button>
            <Button variant="secondary" type="button" onClick={() => navigate(backRoute)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
