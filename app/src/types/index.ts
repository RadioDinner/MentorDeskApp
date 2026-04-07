export type StaffRole = 'admin' | 'mentor' | 'staff'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  created_at: string
}

export interface StaffMember {
  id: string
  user_id: string | null
  organization_id: string
  first_name: string
  last_name: string
  role: StaffRole
  email: string
  phone: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  created_at: string
  updated_at: string
}
