// ============================================================
// MentorDesk Help Documentation
// Each article: { id, title, category, content: [{ heading, body }] }
// body supports simple markdown-style: **bold**, `code`, \n for line breaks
// ============================================================

export const CATEGORIES = [
  { id: 'overview',       label: 'Overview' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'mentors',        label: 'Mentors' },
  { id: 'mentees',        label: 'Mentees' },
  { id: 'courses',        label: 'Courses' },
  { id: 'invoicing',      label: 'Invoicing' },
  { id: 'staff',          label: 'Staff' },
  { id: 'settings',       label: 'Settings' },
]

export const ARTICLES = [

  // ── Overview ──────────────────────────────────────────────
  {
    id: 'what-is-mentordesk',
    category: 'overview',
    title: 'What is MentorDesk?',
    content: [
      {
        heading: 'Purpose',
        body: 'MentorDesk is a private mentoring program management platform. It lets administrators manage mentors, mentees, and offerings; mentors manage their assigned clients; and mentees access their course content and track their progress.',
      },
      {
        heading: 'The four portals',
        body: '**Admin Portal** (`/admin`) — Full control over all people, courses, invoicing, and settings. Accessible only to users with the `admin` role.\n\n**Mentor Portal** (`/mentor`) — Mentors view their assigned mentees, assign programs, issue Whiteboard tasks, and track lesson completion.\n\n**Mentee Portal** (`/mentee`) — Mentees view their enrolled programs, complete lessons, manage Whiteboard exercises, and update their profile and billing info.\n\n**Staff Dashboard** (`/staff`) — A lightweight view for internal staff members (role under active development).',
      },
      {
        heading: 'User roles',
        body: '`admin` — Full access to the admin portal.\n\n`mentor` — Access to the mentor portal; can manage their own mentees only.\n\n`mentee` — Access to the mentee portal; can only see their own data.\n\n`staff` — Internal team member; limited admin access based on permissions.\n\n`assistantmentor` — Assistant Mentor role; currently uses the mentee portal experience.',
      },
    ],
  },

  {
    id: 'logging-in',
    category: 'overview',
    title: 'Logging in & out',
    content: [
      {
        heading: 'Signing in',
        body: 'Navigate to the login page and enter your email and password. After successful authentication, you will be automatically redirected to the correct portal based on your role.',
      },
      {
        heading: 'Automatic role routing',
        body: 'The system reads your role from the database after login:\n• `admin` → `/admin`\n• `mentor` → `/mentor`\n• `mentee` → `/mentee`\n• `staff` → `/staff`\n\nIf your account has no profile record you will be sent back to the login page — contact your administrator.',
      },
      {
        heading: 'Signing out',
        body: 'Click **Sign out** at the bottom of the sidebar (admin/mentor) or the Sign Out button in the top-right header (mentee portal). All active sessions are terminated.',
      },
    ],
  },

  // ── Getting Started ───────────────────────────────────────
  {
    id: 'first-time-mentee',
    category: 'getting-started',
    title: 'Your first time as a mentee',
    content: [
      {
        heading: 'Welcome',
        body: 'When you first log in as a mentee, a guided tutorial walks you through the key areas of your dashboard. You can skip it at any time and revisit this guide whenever you need a refresher.',
      },
      {
        heading: 'Step 1: Overview dashboard',
        body: 'Your landing page shows a quick summary: how many active courses you have, upcoming meetings, outstanding invoices, and your program status. Click any card to jump to that section.',
      },
      {
        heading: 'Step 2: Accessing your courses',
        body: 'Click the **My Courses** tab to see all the offerings you\'re enrolled in. Each course shows its lessons — work through them in order and click **Mark Complete** when you\'re done with each one. If your mentor assigned a Whiteboard exercise, it appears under the relevant lesson.',
      },
      {
        heading: 'Step 3: Scheduling meetings',
        body: 'The **Meetings** tab shows your upcoming and past sessions. If your program includes meeting credits, you\'ll see a credit chart showing how many you\'ve used and how many are available. Click **Schedule Meeting** to request time with your mentor.',
      },
      {
        heading: 'Step 4: Editing your profile',
        body: 'Go to the **My Profile** tab to update your name, phone number, and address. Your email address is managed by your organization — contact your administrator if it needs to change.',
      },
      {
        heading: 'Step 5: Billing and invoices',
        body: 'The **Billing** tab shows all your invoices and their status (pending, paid, overdue). You can also save a payment method here. If you have outstanding invoices, a banner will appear on your overview dashboard.',
      },
      {
        heading: 'Replaying the tutorial',
        body: 'The guided walkthrough only appears once on your first login. If you\'d like to see it again, clear your browser\'s local storage for this site, or ask your administrator for assistance.',
      },
    ],
  },

  {
    id: 'navigating-dashboard',
    category: 'getting-started',
    title: 'Navigating your dashboard',
    content: [
      {
        heading: 'Tabs',
        body: 'Your dashboard is organized into tabs across the top: **Overview**, **My Courses**, **Meetings**, **Whiteboards**, **My Profile**, and **Billing**. Click any tab to switch between sections.',
      },
      {
        heading: 'Role switcher',
        body: 'If you have more than one role (for example, you\'re both a mentee and a mentor), you\'ll see a role switcher in the top-right corner. Click it to swap between your different portals.',
      },
      {
        heading: 'Signing out',
        body: 'Click your name or the **Sign Out** button in the top-right corner of the header to log out of your account.',
      },
    ],
  },

  // ── Mentors ───────────────────────────────────────────────
  {
    id: 'adding-mentors',
    category: 'mentors',
    title: 'Adding & managing mentors',
    content: [
      {
        heading: 'Creating a mentor record',
        body: 'Go to **Mentors** in the sidebar. Click **Add Mentor**. Fill in the first name, last name, email, and phone. Address fields and messaging preferences (WhatsApp, Telegram, Signal, Text) are optional but helpful.\n\nClick **Save Mentor** to create the record.',
      },
      {
        heading: 'Linking a mentor login account',
        body: 'Creating a mentor record does NOT automatically create a login account. To allow a mentor to log in:\n\n1. Go to **Admin** → Supabase dashboard → Authentication → Users\n2. Create the user with the mentor\'s email and a temporary password\n3. Go to the `profiles` table and create a row: `{ id: <auth user uuid>, role: \'mentor\', mentor_id: <mentor record uuid> }`\n\nOnce linked, the mentor can log in and access their portal.',
      },
      {
        heading: 'Editing a mentor',
        body: 'Click on a mentor\'s name to open the detail page. All fields can be updated, including avatar upload. Changes are saved immediately when you click **Save Changes**.',
      },
      {
        heading: 'Assigning mentees to a mentor',
        body: 'From the **Mentor Detail** page, scroll to the **Assigned Mentees** section. Select a mentee from the dropdown and click **Assign**. You can also assign a mentor from the mentee\'s detail page via the **Assigned Mentor** field.',
      },
    ],
  },

  {
    id: 'assistant-mentors',
    category: 'mentors',
    title: 'Assistant Mentors',
    content: [
      {
        heading: 'What is an Assistant Mentor?',
        body: 'Assistant Mentors are supporters or mentors-in-training. They are tracked in a separate **Assistant Mentors** section of the admin panel but follow a similar profile structure to mentors (name, email, address, messaging preferences).',
      },
      {
        heading: 'Managing assistant mentors',
        body: 'Navigate to **Assistant Mentors** in the sidebar. The workflow is identical to Mentors: add, view, edit, upload an avatar. Assistant mentors can be linked to a login account via the `profiles` table the same way mentors are.',
      },
      {
        heading: 'Mentee → Assistant Mentor transition',
        body: 'It is common for a mentee who completes the program to become an Assistant Mentor. The recommended flow is:\n\n1. **Archive the mentee record** (see Archiving Mentees) to remove them from the active list\n2. **Create a new Assistant Mentor record** with the same person\'s details\n3. Update their `profiles` row in Supabase to point to the new assistant mentor record (or create a new auth account if they need a separate login)\n\nThis keeps the mentee\'s history intact while giving them a fresh assistant mentor profile.',
      },
    ],
  },

  // ── Mentees ───────────────────────────────────────────────
  {
    id: 'adding-mentees',
    category: 'mentees',
    title: 'Adding mentees & sending invites',
    content: [
      {
        heading: 'Creating a mentee',
        body: 'Go to **Mentees** in the sidebar. Click **Add Mentee**. Complete the form:\n\n• **Basic Info**: name, email, phone, status, mentor assignment, sign-up date\n• **Residential Address**: full address\n• **Billing Address**: can be set to same as residential\n• **Messaging Apps**: check which apps the mentee uses\n\nClick **Save Mentee**.',
      },
      {
        heading: 'Portal invitation (login account)',
        body: 'If you enter an **email address** when creating the mentee, MentorDesk automatically:\n1. Creates a Supabase auth account for the mentee with a random temporary password\n2. Sends a welcome email to that address (via Supabase\'s built-in email)\n3. Creates a `profiles` record linking the auth account to the mentee record\n\nThe mentee will need to use **Forgot Password** on the login page to set their own password before they can log in.',
      },
      {
        heading: 'Mentee status workflow',
        body: 'Each mentee has a status that tracks where they are in the program. The default stages are:\n\n**Lead** → **Deciding** → **Discovery Call Scheduled** → **Waiting List** → *(active programs)* → **Graduate**\n\nActive program stages (e.g. "JumpStart Your Freedom", "4x Mentoring") are set automatically when a mentor assigns an offering with a matching name. You can customize the status list in **Settings → Mentee Status Workflow**.',
      },
      {
        heading: 'Editing a mentee',
        body: 'Click **Edit** on the mentee row, or navigate to the mentee\'s detail page. You can update all profile fields, change the assigned mentor, and view assigned offerings and billing history from the same page.',
      },
    ],
  },

  {
    id: 'archiving-mentees',
    category: 'mentees',
    title: 'Archiving & restoring mentees',
    content: [
      {
        heading: 'What does archiving do?',
        body: 'Archiving a mentee performs a soft-delete — the record is preserved in the database but hidden from the active mentee list. No data is lost. Use this when a mentee graduates or leaves the program.',
      },
      {
        heading: 'How to archive a mentee',
        body: 'There are two ways:\n\n**From the Mentees list**: Click the green **Archive** button on the mentee\'s row. A confirmation modal will appear before anything is changed.\n\n**From the Mentee Detail page**: Click the green **Archive Mentee** button in the page header.',
      },
      {
        heading: 'Viewing archived mentees',
        body: 'Click the **View Archived** toggle button in the top-right of the Mentees page. The list will switch to show only archived mentees. Click **View Active** to return to the normal view.',
      },
      {
        heading: 'Restoring a mentee',
        body: 'While in the archived view, click **Restore** on the mentee row to return them to active status.\n\nFrom the Mentee Detail page of an archived mentee, an amber banner appears at the top with a **Restore** button.',
      },
    ],
  },

  {
    id: 'mentee-portal',
    category: 'mentees',
    title: 'The mentee portal experience',
    content: [
      {
        heading: 'Overview tab',
        body: 'When a mentee logs in they see a summary dashboard: active courses, outstanding invoices, and their current program status. If there are unpaid invoices, an alert banner appears.',
      },
      {
        heading: 'My Courses tab',
        body: 'Shows all active offerings the mentee is enrolled in, and the lessons that have been unlocked for them. Mentees can click **Mark Complete** on a lesson once they have finished it.\n\nIf a mentor has issued a Whiteboard exercise for a lesson, it appears under that lesson with a **Mark Done** button.',
      },
      {
        heading: 'Whiteboards tab',
        body: 'A dedicated tab showing all Whiteboard exercises the mentor has issued. Each whiteboard shows the title, description/instructions, issue date, and a notes text area. The mentee can save notes and mark the whiteboard complete.',
      },
      {
        heading: 'My Profile tab',
        body: 'Mentees can update their name, phone, and address. Email cannot be changed (contact your admin). Changes are saved immediately.',
      },
      {
        heading: 'Billing tab',
        body: 'Shows all invoices (pending, paid, overdue, cancelled) with amounts and due dates. Mentees can also save a payment method (card last 4 digits, expiry, and billing address — full card numbers are never stored).',
      },
    ],
  },

  // ── Courses ───────────────────────────────────────────────
  {
    id: 'offerings-vs-courses',
    category: 'courses',
    title: 'Offerings vs. Courses',
    content: [
      {
        heading: 'What is an Offering?',
        body: 'An **Offering** is the plan or program package — it has a name, price, billing type (recurring or one-time), duration, and optionally a one-time setup fee. Examples: "JumpStart Your Freedom ($149/mo + $75 setup)", "4x Mentoring ($299/mo)".\n\nOfferings are what get assigned to mentees and what invoices are tied to.',
      },
      {
        heading: 'What is a Course?',
        body: 'A **Course** is the learning content attached to an offering. Each offering can have one course with multiple lessons. Courses have a delivery mode (scheduled release or on-completion) and an optional appointments/meetings cadence.',
      },
      {
        heading: 'Building a course',
        body: 'Go to **Offerings**, find the offering you want to build content for, and click **Build Course**.\n\nIn the Course Builder:\n1. Choose the delivery mode (scheduled or on-completion)\n2. Set the release schedule if using scheduled mode (e.g. every 7 days)\n3. Enable appointments/meetings if applicable\n4. Add lessons: title + optional description\n5. Click **Save Course**\n\nOnce lessons are saved, you can expand each lesson to add **Whiteboard templates** (see Whiteboards section).',
      },
      {
        heading: 'Setup fees',
        body: 'An offering can have a **one-time setup fee** in addition to its regular monthly cost. When a mentor assigns an offering with a setup fee to a mentee, two invoices are automatically created: one for the regular monthly amount, and one for the setup fee.',
      },
    ],
  },

  {
    id: 'whiteboards',
    category: 'courses',
    title: 'Whiteboard templates & issuance',
    content: [
      {
        heading: 'What is a Whiteboard?',
        body: 'A **Whiteboard** is a supplemental task or worksheet issued by a mentor to a specific mentee. Whiteboard templates are created at the lesson level in the Course Builder, and mentors issue them individually from the Mentor Portal.',
      },
      {
        heading: 'Creating whiteboard templates (Admin)',
        body: '1. Go to **Offerings → Build Course** for the relevant offering\n2. Save your lessons first (templates require a saved lesson)\n3. Click the **Whiteboards** toggle on a lesson to expand the panel\n4. Enter a title (e.g. "Financial Freedom Worksheet") and optional instructions\n5. Click **Add Template** then **Save Templates**\n\nTemplates are reusable — they can be issued to any mentee enrolled in that offering.',
      },
      {
        heading: 'Issuing a whiteboard (Mentor)',
        body: '1. Log into the Mentor Portal\n2. Select a mentee from the sidebar\n3. Scroll to **Lesson Progress**\n4. Under the relevant lesson, find the whiteboard template and click **Issue**\n\nEach template can only be issued once per mentee (the Issue button becomes a green "✓ Issued" badge after issuance).',
      },
      {
        heading: 'Completing a whiteboard (Mentee)',
        body: 'Issued whiteboards appear in the mentee portal under **My Courses** (inline under each lesson) and in the **Whiteboards** tab. The mentee can:\n• Read the instructions\n• Type notes in the text area and click **Save Notes**\n• Click **Mark Done** when finished',
      },
    ],
  },

  {
    id: 'lesson-unlock',
    category: 'courses',
    title: 'How lessons are unlocked',
    content: [
      {
        heading: 'Lesson 1 auto-unlock',
        body: 'When a mentor assigns an offering to a mentee, Lesson 1 of the associated course is automatically unlocked and becomes visible in the mentee portal immediately.',
      },
      {
        heading: 'Subsequent lessons',
        body: 'Additional lessons are unlocked manually by the mentor (from the Lesson Progress section in the Mentor Portal) or based on the course delivery mode:\n\n• **Scheduled**: The system is designed to release lessons on a schedule (e.g. every 7 days) — note: automated scheduling requires a backend job (Supabase Edge Function or cron) that may need to be configured separately.\n\n• **On Completion**: Next lesson unlocks when the mentee marks the current lesson complete.',
      },
    ],
  },

  // ── Invoicing ─────────────────────────────────────────────
  {
    id: 'invoicing-overview',
    category: 'invoicing',
    title: 'Invoicing overview',
    content: [
      {
        heading: 'Auto-numbered invoices',
        body: 'Every invoice is automatically assigned a unique number in the format **INV-0001**, **INV-0002**, etc. This is handled by a database trigger — you never need to set invoice numbers manually.',
      },
      {
        heading: 'Invoice statuses',
        body: '**Pending** — Invoice has been created and is awaiting payment.\n\n**Paid** — Payment has been processed. The `paid_at` timestamp is set automatically.\n\n**Overdue** — A pending invoice whose due date has passed. This status is calculated automatically in the UI.\n\n**Cancelled** — Invoice has been voided.',
      },
      {
        heading: 'Creating an invoice manually',
        body: 'Go to **Invoicing** in the sidebar. Click **New Invoice**. Select the mentee, optionally link to an offering (which auto-fills the amount), set the amount, due date, and description. Click **Create Invoice**.',
      },
      {
        heading: 'Automatic invoice creation',
        body: 'Invoices are also created automatically when a mentor assigns an offering to a mentee from the Mentor Portal:\n• One invoice for the monthly amount (due in 30 days)\n• A second invoice for the setup fee, if the offering has one',
      },
      {
        heading: 'Processing & cancelling',
        body: 'From the **Invoicing** page, use the **Process** button to mark an invoice as paid, or the **Cancel** button to void it. You can filter invoices by status using the tabs at the top.',
      },
      {
        heading: 'Invoice processing mode',
        body: 'In **Settings → Invoicing**, you can choose how invoices are handled:\n\n• **Auto-process** — Automatically marks invoices as paid when due\n• **Auto-send, manual process** — Sends the invoice to the mentee automatically, but payment is processed manually\n• **Fully manual** — All sending and processing is done by hand',
      },
    ],
  },

  // ── Staff ─────────────────────────────────────────────────
  {
    id: 'staff-overview',
    category: 'staff',
    title: 'Managing staff members',
    content: [
      {
        heading: 'Adding staff',
        body: 'Go to **Staff** in the sidebar. Click **Add Staff Member**. Enter name, email, phone, role title, start date, address, and messaging preferences. Save the record.\n\nTo give a staff member a login account, create a Supabase auth user and a `profiles` row with `role: \'staff\'` and the staff member\'s `id`.',
      },
      {
        heading: 'Staff permissions',
        body: 'Go to **Staff Roles** to manage what each staff member can do. Three permission flags are available:\n\n• **Manage Offerings** — Can create and edit offerings\n• **Manage Mentees** — Can add, edit, and view mentees\n• **Manage Settings** — Can change company settings\n\nNote: Full enforcement of these permissions in the database is being implemented as part of a security update.',
      },
    ],
  },

  // ── Settings ──────────────────────────────────────────────
  {
    id: 'company-settings',
    category: 'settings',
    title: 'Company settings',
    content: [
      {
        heading: 'Branding',
        body: 'Upload a **company logo** (displayed in portal headers) and set your three **brand colors** (primary, secondary, highlight). Color changes preview live and apply across all portals once saved.',
      },
      {
        heading: 'Defaults',
        body: 'Set a **default currency** (USD, CAD, GBP, etc.) used for pricing and invoices.\n\nSet a **default country** to pre-fill the country field when adding new mentors or mentees. Enable **Lock Country** to prevent it from being changed.',
      },
      {
        heading: 'Mentee status workflow',
        body: 'The status workflow defines the stages a mentee moves through. You can:\n• Reorder stages using the up/down arrows\n• Remove a stage with the × button\n• Add new stages by typing and clicking **Add**\n• Reset to defaults at any time\n\nChanges affect all status dropdowns across the admin panel, mentor portal, and mentee management.',
      },
      {
        heading: 'Invoice processing',
        body: 'Choose your invoicing mode: Auto-process, Auto-send with manual processing, or Fully manual. See the **Invoicing** section for details on each mode.',
      },
    ],
  },

  {
    id: 'database-setup',
    category: 'settings',
    title: 'Database migrations',
    content: [
      {
        heading: 'Running migrations',
        body: 'MentorDesk uses Supabase as its database. When setting up or updating the system, SQL migration files need to be run in order in the Supabase SQL Editor:\n\n1. `SUPABASE_MIGRATIONS.sql` — Base tables (mentee_offerings, invoices, payment_methods, RLS)\n2. `SUPABASE_MIGRATIONS_2.sql` — Mentor portal, invoice numbering, lesson progress\n3. `SUPABASE_MIGRATIONS_3.sql` — Avatar storage bucket, setup fees\n4. `SUPABASE_MIGRATIONS_4.sql` — Whiteboard templates and issuance\n5. `SUPABASE_MIGRATIONS_5.sql` — Mentee archive columns, storage path security\n\nAlways run migrations in order. Each file is safe to re-run (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).',
      },
      {
        heading: 'Storage bucket',
        body: 'Migration 3 creates the `avatars` storage bucket in Supabase Storage. This bucket holds mentor/mentee avatar photos and the company logo. The bucket is set to **public** so images can be displayed without authentication.',
      },
      {
        heading: 'Migration 5: archive & storage security',
        body: 'Migration 5 adds two `archived_at` / `archived_by` columns to the `mentees` table (enabling the soft-archive feature) and tightens storage upload policies:\n\n• Admins may upload to `mentors/*`, `mentees/*`, and `company/*` paths\n• Mentees may only upload to `mentees/<their-own-id>.*`\n• The broad "any authenticated user can upload anywhere" policy from Migration 3 is replaced\n\nIt also includes commented-out staff permission RLS policies ready to activate when staff logins go live.',
      },
    ],
  },
]

export function getArticlesByCategory(categoryId) {
  return ARTICLES.filter(a => a.category === categoryId)
}

export function searchArticles(query) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return ARTICLES.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.content.some(s => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
  )
}
