# MentorDesk

A full-featured mentoring and tutoring management platform for organizations that run structured mentoring programs. Admins manage mentors, mentees, staff, offerings (courses and arrangements), billing, invoicing, and scheduling — all from a single dashboard.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| Database / Auth | Supabase (PostgreSQL + PostgREST) |
| Storage | Supabase Storage (avatars) |
| Icons | Lucide React |
| Styling | Inline CSS (no external CSS framework) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project

### Install and run

```bash
npm install
npm run dev
```

### Environment variables

Create a `.env` file at the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Database Migrations

Migrations live in `supabase/migrations/`. Run them in order in the Supabase SQL editor.

After running any migration, reload the PostgREST schema cache:
**Supabase Dashboard → Settings → API → "Reload schema"**

| File | What it does |
|------|-------------|
| `001_arrangement_policies.sql` | Adds arrangement policy columns to `offerings` (superseded by 002) |
| `002_fix_offerings_and_staff.sql` | **Run this.** Adds `offering_type`, arrangement columns (`meetings_per_period`, `program_duration_periods`, `cancellation_policy`, `cancellation_window_hours`, `allow_activities`, `credits_rollover`), and staff pay columns (`pay_type`, `pay_rate`) |
| `SUPABASE_MIGRATIONS_11.sql` | Meeting credits trigger — run after 002 |

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Auth user roles (`admin`, `mentor`, `mentee`, `trainee`, `staff`, `prayerpartner`) |
| `mentors` | Mentor records |
| `mentees` | Mentee records |
| `staff` | Staff/employee records with pay info |
| `offerings` | Courses and arrangements available for enrollment |
| `mentee_offerings` | Junction table — which mentee is enrolled in which offering |
| `arrangement_credit_ledger` | Credit transaction log for meeting-based arrangements |
| `meetings` | Scheduled meetings between mentor and mentee |
| `lessons` / `courses` | Course content builder |
| `invoices` | Billing invoices per mentee |
| `settings` | Global company settings (branding colors, default country, etc.) |
| `audit_logs` | Admin action log |
| `login_events` | Login tracking per user |

---

## User Roles and Dashboards

| Role | Dashboard route | Access |
|------|----------------|--------|
| `admin` | `/admin` | Full access to all admin pages |
| `mentor` | `/mentor` | Mentor dashboard, can view staff page |
| `staff` | `/staff` | Staff dashboard |
| `mentee` / `trainee` | `/mentee` | Mentee dashboard — schedule meetings, view arrangements |
| `prayerpartner` | `/mentee` | Same as mentee dashboard |

---

## Offerings: Courses vs Arrangements

### Courses
One-time or recurring structured content programs. Created via the "New Course" flow in Manage Offerings.

### Arrangements
Meeting-based programs billed monthly. Key fields:

- **Meetings per period** — credits granted each billing cycle
- **Program duration** — total months of the arrangement
- **Credits rollover** — whether unused credits carry forward
- **Cancellation policy**:
  - `reallocate` — credits always returned on cancellation
  - `consume` — credits always consumed on cancellation
  - `window` — credits returned if cancelled before the configured hour threshold; consumed if cancelled within it
- **Allow activities** — enables whiteboards and check-in forms for enrolled mentees

When a mentee is enrolled in an arrangement and their invoice is marked paid, credits are added to their ledger. The `handle_meeting_credits()` trigger automatically deducts or returns credits when meetings are scheduled or cancelled.

---

## Features

- **Admin dashboard** with quick-access stats
- **Mentor management** — profiles, avatars, contact details
- **Mentee management** — full profiles, assigned offerings, meeting history, credit balances
- **Staff management** — employee records, pay type (hourly/salary), pay rate, edit in place
- **Offerings** — separate creation flows for courses and arrangements
- **Course builder** — structured lesson editor
- **Arrangement form** — full meeting allocation and policy configuration
- **Billing and invoicing** — invoice creation, status tracking
- **Reports** — activity and usage reporting
- **Audit log** — tracks admin actions
- **Company settings** — branding colors, default country, lock settings
- **Mentor and mentee dashboards** — role-appropriate views
- **Meeting scheduling** — greyed out when a mentee has no active arrangement credits
- **Credit allocation chart** — visual breakdown of completed, upcoming, and available meeting credits
- **Prayer partner support** — separate role with mentee-style dashboard
- **Theme engine** — brand colors applied from settings at startup

---

## Project Structure

```
src/
  pages/          # One file per page/route
  components/     # Shared components (AdminLayout, ProtectedRoute, AvatarUpload, etc.)
  constants/      # US states, countries
  supabaseClient.js
  theme.js
supabase/
  migrations/     # SQL migration files
```
