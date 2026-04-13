export type StaffRole = 'admin' | 'operations' | 'course_creator' | 'mentor' | 'assistant_mentor' | 'staff'

// Roles that fall under the "/staff" (non-mentor) umbrella. The legacy 'staff'
// value is kept for backwards compatibility with existing rows.
export const STAFF_UMBRELLA_ROLES: StaffRole[] = ['admin', 'operations', 'course_creator', 'staff']

// Human-readable labels for every staff role — use this when rendering role
// in the UI so the wording stays consistent everywhere.
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  operations: 'Operations',
  course_creator: 'Course Creator',
  staff: 'Staff',
  mentor: 'Mentor',
  assistant_mentor: 'Asst. Mentor',
}

export interface RoleGroup {
  id: string
  name: string
  module_groups: string[]
}

export type PayType =
  | 'hourly'
  | 'salary'
  | 'pct_monthly_profit'
  | 'pct_engagement_profit'
  | 'pct_course_profit'
  | 'pct_per_meeting'

// Pay types where pay_rate is a percentage (not a dollar amount).
export const PERCENTAGE_PAY_TYPES: PayType[] = [
  'pct_monthly_profit',
  'pct_engagement_profit',
  'pct_course_profit',
  'pct_per_meeting',
]

// How often a salaried staff member is paid.
export type PayFrequency = 'weekly' | 'bi_weekly' | 'semi_monthly' | 'monthly' | 'annually'

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  bi_weekly: 'Bi-weekly (every 2 weeks)',
  semi_monthly: 'Semi-monthly (twice a month)',
  monthly: 'Monthly',
  annually: 'Annually',
}

// Pay types that require the admin to pick a specific offering the staff
// member is paid from (pay_offering_id on the staff record).
export const OFFERING_LINKED_PAY_TYPES: PayType[] = [
  'pct_engagement_profit',
  'pct_course_profit',
]

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
export type AllocationGrantMode = 'on_open' | 'on_first_payment'
export type AllocationRefreshMode = 'by_cycle' | 'by_payment'

export interface CancellationPolicy {
  cancel_window_value: number
  cancel_window_unit: CancelWindowUnit
  cancelled_in_window: CancelOutcome
  cancelled_outside_window: CancelOutcome
  no_show: CancelOutcome
}

export type ArchiveDeleteUnit = 'days' | 'months' | 'years'

export interface ArchiveSettings {
  auto_delete_enabled: boolean
  auto_delete_value: number
  auto_delete_unit: ArchiveDeleteUnit
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
  allow_multi_engagement: boolean
  show_all_days_in_scheduler: boolean
  allocation_grant_mode: AllocationGrantMode
  allocation_refresh_mode: AllocationRefreshMode
  pay_mentors_for_uncredited_meetings: boolean
  archive_settings: ArchiveSettings
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
  icon_url: string | null
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
  default_meeting_duration_minutes: number
  allocation_period: AllocationPeriod
  use_org_default_cancellation: boolean
  cancellation_policy: CancellationPolicy | null
  due_date_mode: DueDateMode
  expected_completion_days: number | null
  auto_send_invoice: boolean
  folder_id: string | null
  created_at: string
  updated_at: string
}

export interface OfferingFolder {
  id: string
  organization_id: string
  name: string
  folder_type: 'course' | 'engagement'
  order_index: number
  created_at: string
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
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type PairingStatus = 'active' | 'paused' | 'ended'

export interface Pairing {
  id: string
  organization_id: string
  mentor_id: string
  mentee_id: string
  offering_id: string | null
  status: PairingStatus
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type MenteeOfferingStatus = 'active' | 'completed' | 'cancelled'

export interface MenteeOffering {
  id: string
  organization_id: string
  mentee_id: string
  offering_id: string
  assigned_by: string | null
  status: MenteeOfferingStatus
  sessions_used: number
  recurring_price_cents: number
  setup_fee_cents: number
  meeting_count: number | null
  allocation_period: AllocationPeriod | null
  notes: string | null
  ends_at: string | null
  assigned_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface EngagementSession {
  id: string
  organization_id: string
  mentee_offering_id: string
  mentee_id: string
  logged_by: string | null
  session_date: string
  notes: string | null
  created_at: string
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export interface Invoice {
  id: string
  organization_id: string
  mentee_id: string | null
  mentee_offering_id: string | null
  invoice_number: string | null
  status: InvoiceStatus
  amount_cents: number
  currency: string
  due_date: string | null
  paid_at: string | null
  line_description: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AvailabilitySchedule {
  id: string
  organization_id: string
  staff_id: string
  day_of_week: number // 0=Sunday, 6=Saturday
  start_time: string  // HH:MM:SS
  end_time: string    // HH:MM:SS
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AvailabilityOverride {
  id: string
  organization_id: string
  staff_id: string
  override_date: string
  start_time: string
  end_time: string
  is_available: boolean
  notes: string | null
  created_at: string
}

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface Meeting {
  id: string
  organization_id: string
  mentee_offering_id: string | null
  mentee_id: string
  mentor_id: string
  engagement_session_id: string | null
  title: string | null
  description: string | null
  starts_at: string
  ends_at: string
  duration_minutes: number
  status: MeetingStatus
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  meeting_link: string | null
  location: string | null
  external_calendar_id: string | null
  external_calendar_provider: string | null
  external_calendar_event_url: string | null
  created_at: string
  updated_at: string
}

export type QuestionType = 'quiz' | 'response'

export interface QuizOption {
  text: string
  is_correct: boolean
}

export type SectionType = 'text' | 'video' | 'quiz' | 'response'

export interface LessonSection {
  id: string
  lesson_id: string
  organization_id: string
  section_type: SectionType
  title: string | null
  content: string | null
  video_url: string | null
  notes: string | null
  order_index: number
  created_at: string
  updated_at: string
}

export interface LessonQuestion {
  id: string
  lesson_id: string
  section_id: string | null
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

export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface LessonProgress {
  id: string
  organization_id: string
  mentee_id: string
  mentee_offering_id: string
  lesson_id: string
  status: LessonProgressStatus
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface QuestionResponse {
  id: string
  organization_id: string
  mentee_id: string
  mentee_offering_id: string
  lesson_id: string
  question_id: string
  response_text: string | null
  selected_option_index: number | null
  is_correct: boolean | null
  answered_at: string
  created_at: string
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
  pay_offering_id: string | null
  pay_frequency: PayFrequency | null
  pay_rate: number | null
  access_groups: string[]
  allowed_modules: string[]
  max_active_mentees: number | null
  timezone: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}
