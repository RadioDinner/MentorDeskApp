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
export type FlowLayoutMode = 'auto' | 'freeform'

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
  scheduler_max_days_ahead: number
  allocation_grant_mode: AllocationGrantMode
  allocation_refresh_mode: AllocationRefreshMode
  pay_mentors_for_uncredited_meetings: boolean
  archive_settings: ArchiveSettings
  journey_auto_assign_offerings: boolean
  flow_layout_mode: FlowLayoutMode
  default_course_completion_message: string | null
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
  course_completion_message: string | null
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

// ── Automations ────────────────────────────────────────────────────────

export type AutomationTriggerType =
  | 'manual'
  | 'lesson_completed'
  | 'lesson_reached'
  | 'course_completed'
  | 'course_started'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'meeting_cancelled'

/** Configuration shapes per trigger type. Union-discriminated by the outer
 *  automation's trigger_type. All fields optional so partially-filled
 *  drafts round-trip cleanly. */
export interface AutomationTriggerConfig {
  course_id?: string | null        // for course-* and lesson-* triggers
  lesson_id?: string | null        // for lesson_reached (specific lesson)
  lesson_index?: number | null     // alternative to lesson_id (ordinal in course)
  offering_id?: string | null      // for meeting-* triggers
}

export type AutomationActionType = 'create_task' | 'send_email' | 'send_notification'

export interface AutomationActionCreateTask {
  type: 'create_task'
  title: string
  body?: string | null
  assignee: 'owner' | 'mentor_of_mentee'
  due_days_offset?: number | null
  urgency?: 'normal' | 'urgent'
}

export interface AutomationActionSendEmail {
  type: 'send_email'
  to: 'owner' | 'mentee' | 'custom'
  custom_email?: string | null
  subject: string
  body: string
}

export interface AutomationActionSendNotification {
  type: 'send_notification'
  to: 'owner' | 'mentee'
  title: string
  body?: string | null
}

export type AutomationAction =
  | AutomationActionCreateTask
  | AutomationActionSendEmail
  | AutomationActionSendNotification

export interface Automation {
  id: string
  organization_id: string
  owner_id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_type: AutomationTriggerType
  trigger_config: AutomationTriggerConfig
  actions: AutomationAction[]
  created_at: string
  updated_at: string
}

export interface AutomationActionResult {
  action_index: number
  action_type: AutomationActionType
  status: 'success' | 'failed' | 'skipped'
  detail?: string | null
}

export interface Notification {
  id: string
  organization_id: string
  recipient_user_id: string
  title: string
  body: string | null
  link: string | null
  category: string
  source_automation_id: string | null
  read_at: string | null
  created_at: string
}

export interface AutomationRun {
  id: string
  organization_id: string
  automation_id: string
  mentee_id: string | null
  trigger_payload: Record<string, unknown>
  status: 'success' | 'partial' | 'failed' | 'skipped'
  action_results: AutomationActionResult[]
  error_message: string | null
  started_at: string
  finished_at: string | null
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
  cancelled_at: string | null
  cancellation_reason: string | null
  refund_amount_cents: number
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

export interface TimeCard {
  id: string
  organization_id: string
  staff_id: string
  period_start: string         // YYYY-MM-DD
  period_end: string           // YYYY-MM-DD
  hours_worked: number
  notes: string | null
  document_data_url: string | null
  document_name: string | null
  entered_by: string | null
  created_at: string
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

// ── Habits ─────────────────────────────────────────────────────────────

export type HabitDurationMode = 'fixed_days' | 'goal_x_of_y' | 'until_x_successful'
export type MenteeHabitStatus = 'active' | 'completed' | 'abandoned'

export interface Habit {
  id: string
  organization_id: string
  name: string
  description: string | null
  duration_mode: HabitDurationMode
  duration_days: number | null
  goal_successful_days: number | null
  is_active: boolean
  created_by: string | null
  folder_id: string | null
  created_at: string
  updated_at: string
}

export interface HabitFolder {
  id: string
  organization_id: string
  name: string
  order_index: number
  created_at: string
}

export interface HabitStep {
  id: string
  habit_id: string
  organization_id: string
  order_index: number
  title: string
  instructions: string | null
  created_at: string
  updated_at: string
}

export interface MenteeHabit {
  id: string
  organization_id: string
  habit_id: string
  mentee_id: string
  assigned_by: string | null
  start_date: string
  end_date: string | null
  status: MenteeHabitStatus
  successful_days_count: number
  name_snapshot: string
  description_snapshot: string | null
  duration_mode_snapshot: HabitDurationMode
  duration_days_snapshot: number | null
  goal_successful_days_snapshot: number | null
  assigned_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface MenteeHabitStep {
  id: string
  mentee_habit_id: string
  organization_id: string
  order_index: number
  title: string
  instructions: string | null
  created_at: string
}

export interface MenteeHabitStepLog {
  id: string
  mentee_habit_id: string
  mentee_habit_step_id: string
  organization_id: string
  log_date: string // YYYY-MM-DD
  completed_at: string
}

// ── Canvases ───────────────────────────────────────────────────────────

export type CanvasNoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange'

export interface CanvasBaseNote {
  id: string        // client-generated id
  x: number         // px offset from canvas origin
  y: number
  width: number
  height: number
  color: CanvasNoteColor
  z: number         // stack order; higher = on top
}

export interface CanvasStickyNote extends CanvasBaseNote {
  type: 'sticky'
  text: string      // markdown: **bold**, *italic*, - bullets
}

export interface CanvasChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface CanvasChecklistNote extends CanvasBaseNote {
  type: 'checklist'
  title: string
  items: CanvasChecklistItem[]
}

export type CanvasLinkType = 'course' | 'habit' | 'canvas' | 'url'

export interface CanvasLinkNote extends CanvasBaseNote {
  type: 'link'
  label: string
  linkType: CanvasLinkType
  linkId: string | null   // id of the target entity (null for external url)
  linkUrl: string | null  // external URL if linkType === 'url'
}

export type CanvasNote = CanvasStickyNote | CanvasChecklistNote | CanvasLinkNote

export interface CanvasConnector {
  id: string
  fromNoteId: string
  toNoteId: string
  label: string
}

export interface CanvasContent {
  notes: CanvasNote[]
  connectors: CanvasConnector[]
}

export interface Canvas {
  id: string
  organization_id: string
  mentor_id: string
  mentee_id: string
  title: string
  description: string | null
  content: CanvasContent
  created_by: string | null
  updated_by_uid: string | null
  folder_id: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CanvasFolder {
  id: string
  organization_id: string
  name: string
  order_index: number
  created_at: string
}

// ── Journeys ────────────────────────────────────────────────────────────
//
// A Flow is an org-level reusable flowchart template. A Journey is a
// per-mentee snapshot copy of a Flow. Both use the same content shape:
// a set of JourneyNodes connected by JourneyConnectors with labels.
// The connector labels are where the if/then logic lives (e.g. "completed
// course", "waitlist").

// ── Journey node advance trigger settings ─────────────────────────────
//
// Controls what happens after the offering at this node is completed
// (e.g., discovery call ends). Stored per-node in the flow template.

export type AdvanceTrigger = 'auto' | 'auto_delay' | 'manual'
export type DelayUnit = 'hours' | 'days'

export interface JourneyBaseNode {
  id: string     // client-generated id
  x: number      // px offset from workspace origin
  y: number
  isEnd?: boolean // when true, reaching this node completes the journey
}

export interface JourneyStartNode extends JourneyBaseNode {
  type: 'start'
  /** How mentees enter this journey. Future: 'webhook' for website integration. */
  entryTrigger?: 'manual' | 'webhook'
}

export interface JourneyOfferingNode extends JourneyBaseNode {
  type: 'offering'
  offeringId: string
  /** What happens after the offering/meeting at this node completes. */
  advanceTrigger?: AdvanceTrigger
  /** Delay value (only used when advanceTrigger === 'auto_delay'). */
  delayValue?: number
  /** Delay unit (only used when advanceTrigger === 'auto_delay'). */
  delayUnit?: DelayUnit
}

export interface JourneyDecisionNode extends JourneyBaseNode {
  type: 'decision'
  label: string
  /** Optional longer description shown in the settings sidebar. */
  description?: string
  /** Fires when the mentee's journey reaches this decision (i.e. when the
   *  mentor task is created). Typical use: notify the mentor. */
  reachAutomationId?: string | null
  /** Fires when the decision task is completed, before the journey
   *  advances to the selected next node. */
  automationId?: string | null
}

/**
 * A terminal/status label node (e.g. "waitlist", "graduated"). Distinct
 * from the mentee_journeys.status column — this is a NODE inside the
 * flowchart, not the lifecycle state of the journey itself.
 */
export interface JourneyStatusNode extends JourneyBaseNode {
  type: 'status'
  label: string
}

export interface JourneyEndNode extends JourneyBaseNode {
  type: 'end'
}

export type JourneyNode =
  | JourneyStartNode
  | JourneyOfferingNode
  | JourneyDecisionNode
  | JourneyStatusNode
  | JourneyEndNode

export interface JourneyConnector {
  id: string
  fromNodeId: string
  toNodeId: string
  label: string   // if/then logic label, rendered at the connector midpoint
}

export interface JourneyContent {
  nodes: JourneyNode[]
  connectors: JourneyConnector[]
}

export interface JourneyFolder {
  id: string
  organization_id: string
  name: string
  order_index: number
  created_at: string
}

export interface JourneyFlow {
  id: string
  organization_id: string
  folder_id: string | null
  name: string
  description: string | null
  content: JourneyContent
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type MenteeJourneyStatus = 'active' | 'completed' | 'cancelled'

export interface MenteeJourney {
  id: string
  organization_id: string
  mentee_id: string
  flow_id: string | null          // null if the source flow was later deleted
  content: JourneyContent         // snapshot copy — edits do not affect the source flow
  current_node_id: string | null  // which node the mentee is currently on
  /**
   * When the journey advances into an offering node AND the org has
   * journey_auto_assign_offerings = false, this is set to that node's
   * id so the mentor can manually confirm the offering assignment
   * later. Cleared once the offering is confirmed or the journey
   * advances past the offering node.
   */
  pending_assignment_node_id: string | null
  status: MenteeJourneyStatus
  assigned_by: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ── Mentor Tasks ─────────────────────────────────────────────────────

export type MentorTaskPriority = 'normal' | 'urgent'
export type MentorTaskStatus   = 'pending' | 'done'
export type MentorTaskSource   = 'manual' | 'journey_decision'

export interface MentorTask {
  id: string
  organization_id: string
  mentor_id: string
  title: string
  notes: string | null
  priority: MentorTaskPriority
  status: MentorTaskStatus
  due_date: string | null
  mentee_id: string | null
  mentee_journey_id: string | null
  decision_node_id: string | null
  source: MentorTaskSource
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** Shared list/grid view-mode type used across pages that support the toggle. */
export type ViewMode = 'list' | 'grid'


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
