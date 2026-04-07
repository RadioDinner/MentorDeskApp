export type StaffRole = 'admin' | 'mentor' | 'assistant_mentor' | 'staff'

export interface RoleGroup {
  id: string
  name: string
  module_groups: string[]
}

export type PayType = 'hourly' | 'salary' | 'pct_monthly_profit' | 'pct_engagement_profit'

export type RoleCategory = 'staff' | 'mentor' | 'assistant_mentor'

export type PayTypeSettings = Record<RoleCategory, PayType[]>

export type FlowStepType = 'status' | 'course' | 'engagement'

export interface FlowStep {
  id: string
  name: string
  type: FlowStepType
  offering_id: string | null
  in_flow: boolean
  order: number
}

export interface MenteeFlow {
  steps: FlowStep[]
}

export type CancelWindowUnit = 'hours' | 'days'
export type CancelOutcome = 'keep_credit' | 'lose_credit'
export type AllocationPeriod = 'monthly' | 'weekly' | 'per_cycle'

export interface CancellationPolicy {
  cancel_window_value: number
  cancel_window_unit: CancelWindowUnit
  cancelled_in_window: CancelOutcome
  cancelled_outside_window: CancelOutcome
  no_show: CancelOutcome
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  tertiary_color: string
  pay_type_settings: PayTypeSettings
  mentee_flow: MenteeFlow
  default_cancellation_policy: CancellationPolicy
  role_groups: RoleGroup[]
  enable_lesson_due_dates: boolean
  created_at: string
}

export type OfferingType = 'course' | 'engagement'

export type DispenseMode = 'interval' | 'completion' | 'all_at_once'
export type PreviewMode = 'hidden' | 'titles_only' | 'full_preview'

export interface Offering {
  id: string
  organization_id: string
  type: OfferingType
  name: string
  description: string | null
  price_cents: number
  setup_fee_cents: number
  currency: string
  dispense_mode: DispenseMode
  dispense_interval_days: number | null
  lesson_count: number | null
  course_due_date: string | null
  preview_mode: PreviewMode
  billing_mode: 'one_time' | 'recurring'
  recurring_price_cents: number
  meeting_count: number | null
  allocation_period: AllocationPeriod
  use_org_default_cancellation: boolean
  cancellation_policy: CancellationPolicy | null
  due_date_mode: DueDateMode
  expected_completion_days: number | null
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
  flow_step_id: string | null
  created_at: string
  updated_at: string
}

export type PairingStatus = 'active' | 'paused' | 'ended'

export interface Pairing {
  id: string
  organization_id: string
  mentor_id: string
  mentee_id: string
  status: PairingStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type QuestionType = 'quiz' | 'response'

export interface QuizOption {
  text: string
  is_correct: boolean
}

export interface LessonQuestion {
  id: string
  lesson_id: string
  organization_id: string
  question_text: string
  question_type: QuestionType
  options: QuizOption[] | null
  order_index: number
  created_at: string
}

export interface Lesson {
  id: string
  offering_id: string
  organization_id: string
  title: string
  description: string | null
  content: string | null
  video_url: string | null
  order_index: number
  due_days_offset: number | null
  created_at: string
  updated_at: string
}

export type DueDateMode = 'none' | 'course' | 'lesson'

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
  pay_type: PayType | null
  pay_rate: number | null
  access_groups: string[]
  allowed_modules: string[]
  created_at: string
  updated_at: string
}
