# Integrations Roadmap

> **Status**: Planning — integrations will begin after core feature set is built out.

## Integration Priority & Complexity Ranking

Ranked from most complex to least complex based on CourseCorrect's architecture (React + Supabase + Deno Edge Functions).

### 1. QuickBooks — Complexity: Highest

**What it enables**: Two-way sync of invoices, payments, and financial data with QuickBooks Online.

**Why it's complex**:
- OAuth2 with token refresh and Intuit's app review process
- Complex accounting domain (chart of accounts, tax codes, journal entries)
- Two-way invoice/payment sync with our existing invoicing system
- Webhook handling for payment status updates
- Multi-currency support
- Heavy data mapping between our invoice model and QuickBooks objects

**CourseCorrect touchpoints**: `invoices`, `mentee_payment_methods`, `settings` (currency), edge functions

---

### 2. Microsoft Teams — Complexity: High

**What it enables**: Auto-create Teams meetings for scheduled mentoring sessions, send channel/chat notifications.

**Why it's complex**:
- Azure AD app registration and admin consent flows
- Microsoft Graph API (large surface area, complex permission scopes)
- OAuth2 with organizational consent
- Meeting lifecycle management mapped to our `meetings` table
- Potential chat/channel notifications for session reminders

**CourseCorrect touchpoints**: `meetings`, `mentors`, `mentees`, notification edge functions

---

### 3. Zoom — Complexity: Medium-High

**What it enables**: Auto-generate Zoom meeting links for scheduled sessions, track meeting attendance.

**Why it's complex**:
- OAuth2 with Zoom Marketplace app approval
- Meeting lifecycle management (create/update/cancel mapped to our meetings)
- Webhook handling for meeting events (started, ended, participant joined)
- Storing and displaying meeting URLs in the UI

**CourseCorrect touchpoints**: `meetings`, `mentors`, `mentees`, meeting UI components

---

### 4. Wave — Complexity: Medium

**What it enables**: Sync invoices and payment tracking with Wave's free accounting platform.

**Why it's complex**:
- GraphQL API (different paradigm from our REST-based patterns)
- OAuth2 authentication
- Invoice syncing (simpler accounting model than QuickBooks)
- Fewer entity types to map but still requires financial data accuracy

**CourseCorrect touchpoints**: `invoices`, `mentee_payment_methods`, billing edge functions

---

### 5. Google Calendar — Complexity: Low-Medium

**What it enables**: Sync mentoring sessions to mentor/mentee Google Calendars automatically.

**Why it's complex**:
- Well-documented REST API with good library support
- Straightforward OAuth2 (Google Cloud Console)
- Clean 1:1 mapping from `meetings` table to calendar events
- Timezone handling and recurring event logic add some complexity

**CourseCorrect touchpoints**: `meetings`, `mentors`, `mentees`, scheduling UI

---

### 6. Zapier — Complexity: Lowest

**What it enables**: Connect CourseCorrect to 5,000+ apps via triggers and actions (e.g., "when a meeting is created, send a Slack message").

**Why it's complex**:
- No complex auth on our side — we expose webhook triggers and accept action webhooks
- Define trigger/action catalog (new meeting, invoice sent, mentee enrolled, etc.)
- Build simple REST endpoints for Zapier to consume
- Zapier handles user-facing auth and orchestration

**CourseCorrect touchpoints**: All major entities (meetings, invoices, mentees, mentors, offerings)

---

## Implementation Plan

### Phase 1: Foundation (Pre-Integration)
- [ ] Design a shared integration settings UI in org settings (enable/disable per integration, store credentials)
- [ ] Create an `integrations` database table to store per-org OAuth tokens and config
- [ ] Establish a standard pattern for OAuth2 flows via edge functions
- [ ] Add webhook infrastructure (inbound/outbound event system)

### Phase 2: Quick Wins
- [ ] **Zapier** — Expose webhook triggers for key events; gives immediate extensibility
- [ ] **Google Calendar** — Calendar sync for meetings; high user value, moderate effort

### Phase 3: Video/Meeting Integrations
- [ ] **Zoom** — Auto-generate meeting links for sessions
- [ ] **Microsoft Teams** — Teams meeting creation and notifications

### Phase 4: Accounting Integrations
- [ ] **Wave** — Invoice sync for smaller orgs using free accounting tools
- [ ] **QuickBooks** — Full accounting sync for larger orgs

---

## Notes

- All integrations should be **per-organization** (multi-tenant), stored in org settings
- OAuth tokens must be encrypted at rest
- Each integration should be independently toggleable
- Consider a unified "Connected Apps" page in the admin settings
- Zapier integration reduces pressure on building every direct integration since orgs can self-serve connections
