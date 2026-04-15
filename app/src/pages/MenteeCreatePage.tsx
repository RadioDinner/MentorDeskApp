import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { reportSupabaseError } from '../lib/errorReporter'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  email:     z.string().min(1, 'Email is required').email('Invalid email address'),
  phone:     z.string(),
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

export default function MenteeCreatePage() {
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
      firstName: '', lastName: '', email: '',
      phone: '', street: '', city: '', state: '', zip: '', country: '',
    },
  })

  async function onSubmit(values: FormValues) {
    if (!profile) return

    // If a staff member with this email exists, link to their user_id
    // so the profile switcher can include the mentee role
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

    const { data, error } = await supabase
      .from('mentees')
      .insert({
        organization_id: profile.organization_id,
        user_id: linkedUserId,
        first_name: values.firstName.trim(),
        last_name:  values.lastName.trim(),
        email:      values.email.trim(),
        phone:      values.phone.trim()   || null,
        street:     values.street.trim()  || null,
        city:       values.city.trim()    || null,
        state:      values.state.trim()   || null,
        zip:        values.zip.trim()     || null,
        country:    values.country.trim() || null,
      })
      .select('id')

    if (error) {
      reportSupabaseError(error, { component: 'MenteeCreatePage', action: 'create', metadata: { email: values.email.trim() } })
      const friendly = error.message.includes('mentees_organization_id_email_key')
        ? `A mentee with the email "${values.email.trim()}" already exists in your organization.`
        : error.message
      toast.error(friendly)
      return
    }

    if (data && data.length > 0) {
      await logAudit({ organization_id: profile.organization_id, actor_id: profile.id, action: 'created', entity_type: 'mentee', entity_id: data[0].id, details: { name: `${values.firstName.trim()} ${values.lastName.trim()}` } })
      if (linkedUserId) await refreshProfile()
      navigate(`/mentees/${data[0].id}/edit`)
    } else {
      navigate('/mentees')
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/mentees')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Create Mentee Account</h1>
      </div>

      <div className="bg-white rounded-md border border-gray-200/80 px-8 py-8">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
              <input id="mFirstName" type="text" {...register('firstName')}
                className={`${inputClass}${errors.firstName ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.firstName && <p className={errorClass}>{errors.firstName.message}</p>}
            </div>
            <div>
              <label htmlFor="mLastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
              <input id="mLastName" type="text" {...register('lastName')}
                className={`${inputClass}${errors.lastName ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.lastName && <p className={errorClass}>{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mEmail" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input id="mEmail" type="email" {...register('email')}
                className={`${inputClass}${errors.email ? ' border-red-400 focus:border-red-400 focus:ring-red-200' : ''}`} />
              {errors.email && <p className={errorClass}>{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="mPhone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input id="mPhone" type="tel" placeholder="Optional" {...register('phone')} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="mStreet" className="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
            <input id="mStreet" type="text" placeholder="Optional" {...register('street')} className={inputClass} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="mCity" className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
              <input id="mCity" type="text" {...register('city')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="mState" className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <input id="mState" type="text" {...register('state')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="mZip" className="block text-sm font-medium text-gray-700 mb-1.5">ZIP</label>
              <input id="mZip" type="text" {...register('zip')} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="mCountry" className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
            <input id="mCountry" type="text" {...register('country')} className={inputClass} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create Mentee Account'}</Button>
            <Button variant="secondary" type="button" onClick={() => navigate('/mentees')}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
