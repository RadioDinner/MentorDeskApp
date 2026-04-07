export type StaffRole = 'admin' | 'mentor' | 'staff'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  created_at: string
}

export type OfferingType = 'course' | 'engagement'

export interface Offering {
  id: string
  organization_id: string
  type: OfferingType
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Mentee {
  id: string
  organization_id: string
  user_id: string | null
  first_name: string
  last_name: string
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

export type AssignmentStatus = 'active' | 'paused' | 'ended'

export interface Assignment {
  id: string
  organization_id: string
  mentor_id: string
  mentee_id: string
  status: AssignmentStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
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
