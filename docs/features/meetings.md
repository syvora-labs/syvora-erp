# Feature: Meetings

## Description

Introduce a Meetings module for scheduling meetings, assigning members, taking notes, and tracking follow-up tasks with deadlines. Each meeting belongs to the mandator of the user who creates it, and only users within the same mandator can view or participate in that meeting. The module is accessible via a new "Meetings" tab in the main navigation, gated behind the mandator profile system like all other modules.

Alongside the Meetings module, a new **Inbox / Notifications** system is introduced. A bell icon with an unread counter appears in the top bar next to the user's profile. When a follow-up task approaches or reaches its deadline, the assigned user receives a notification. Each notification links directly to the relevant meeting for quick access.

## Deliverables

### Database — `meetings` table

A new `meetings` table with:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `title` | TEXT | NOT NULL — title of the meeting |
| `description` | TEXT | — optional description or agenda |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL — date and time of the meeting |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` — scopes the meeting to a mandator |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE only rows where `mandator_id` matches their own profile's mandator. This ensures cross-mandator isolation.

### Database — `meeting_members` table

A join table linking meetings to participating users:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `meeting_id` | UUID | NOT NULL, FK → `meetings(id)` ON DELETE CASCADE |
| `user_id` | UUID | NOT NULL, FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

UNIQUE constraint on `(meeting_id, user_id)`. Only users whose profile belongs to the same mandator as the meeting can be added as members.

RLS policies: same mandator-scoped access as the `meetings` table.

### Database — `meeting_notes` table

A table for storing notes within a meeting:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `meeting_id` | UUID | NOT NULL, FK → `meetings(id)` ON DELETE CASCADE |
| `content` | TEXT | NOT NULL — the note body |
| `created_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: same mandator-scoped access as the `meetings` table (resolved via `meeting_id → meetings.mandator_id`).

### Database — `meeting_tasks` table

A table for follow-up tasks tied to a meeting:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `meeting_id` | UUID | NOT NULL, FK → `meetings(id)` ON DELETE CASCADE |
| `title` | TEXT | NOT NULL — short description of the task |
| `deadline` | TIMESTAMPTZ | — optional deadline for the task |
| `assigned_to` | UUID | FK → `auth.users(id)` — the user responsible for the task (must belong to the same mandator) |
| `completed` | BOOLEAN | NOT NULL, DEFAULT `false` |
| `created_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: same mandator-scoped access as the `meetings` table (resolved via `meeting_id → meetings.mandator_id`).

### Database — `notifications` table

A new `notifications` table for the inbox system:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `user_id` | UUID | NOT NULL, FK → `auth.users(id)` — the recipient |
| `title` | TEXT | NOT NULL — notification headline |
| `message` | TEXT | — additional detail |
| `link` | TEXT | — route path to navigate to (e.g. `/meetings?id=<meeting_id>`) |
| `read` | BOOLEAN | NOT NULL, DEFAULT `false` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

RLS policies: authenticated users can SELECT and UPDATE only their own notifications (`user_id = auth.uid()`). INSERT is restricted to service role or database functions/triggers.

### Database — `mandators.module_meetings` flag

Add a `module_meetings` (BOOLEAN, NOT NULL, DEFAULT `true`) column to the existing `mandators` table. The default mandator seed record is updated to have this flag set to `true`. This follows the same pattern as `module_artists`, `module_releases`, `module_associations`, etc.

### Database — deadline notification trigger

A database function (or scheduled cron via `pg_cron` / Supabase edge function) that:

- Identifies `meeting_tasks` where `deadline` is within the next 24 hours (or has just passed) and no notification has yet been sent for that task.
- Inserts a notification for the `assigned_to` user with a link to the meeting.
- Prevents duplicate notifications for the same task deadline.

### Composable — `useMeetings`

A new composable following the established pattern (`useArtists`, `useAssociations`, etc.) that:

- Exposes `meetings` (ref array) and `loading` (ref boolean) state.
- Provides `fetchMeetings()` — fetches all `meetings` scoped to the current user's mandator, ordered by `scheduled_at` descending, enriched with `creator_name` and `updater_name` resolved from `profiles`.
- Provides `createMeeting(form)`, `updateMeeting(id, form)`, `deleteMeeting(id)` — standard CRUD operations that set `mandator_id` from the current user's profile, set `created_by` / `updated_by` to the current user, and re-fetch the list after mutation.
- Provides `fetchMeetingMembers(meetingId)`, `addMeetingMember(meetingId, userId)`, `removeMeetingMember(meetingId, userId)` — only users within the same mandator are selectable.
- Provides `fetchMeetingNotes(meetingId)`, `createNote(meetingId, content)`, `updateNote(noteId, content)`, `deleteNote(noteId)`.
- Provides `fetchMeetingTasks(meetingId)`, `createTask(meetingId, form)`, `updateTask(taskId, form)`, `deleteTask(taskId)`, `toggleTaskCompleted(taskId)`.

### Composable — `useNotifications`

A new composable that:

- Exposes `notifications` (ref array), `unreadCount` (computed number), and `loading` (ref boolean) state.
- Provides `fetchNotifications()` — fetches all notifications for the current user, ordered by `created_at` descending.
- Provides `markAsRead(notificationId)` and `markAllAsRead()`.
- Is initialised in `App.vue` after auth resolves, and polls or subscribes (via Supabase Realtime) for new notifications.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `meetingsEnabled` (computed from `mandator.module_meetings`).
- Add `'meetings'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'meetings', column: 'module_meetings', label: 'Meetings' }
  ```
- `isModuleEnabled('meetings')` returns the correct value.

### Navigation and routing

- In `App.vue`, add a new nav item for "Meetings" pointing to `/meetings`, wrapped with `v-if="meetingsEnabled"` (same pattern as all other module tabs).
- Add a new route in `router/index.ts`:
  ```ts
  { path: '/meetings', name: 'meetings', component: MeetingsView, meta: { requiresAuth: true, module: 'meetings' } }
  ```
- The existing `beforeEach` guard already reads the `module` meta field and redirects to the first enabled module when a disabled module's path is accessed — no additional guard logic needed.

### Top bar — Inbox / Notification bell

- Add a bell icon to the existing top bar component, positioned next to the user profile area.
- Display a badge with the `unreadCount` when greater than zero.
- Clicking the bell opens a dropdown or flyout panel listing recent notifications.
- Each notification row shows the title, message, timestamp, and read/unread state.
- Clicking a notification marks it as read and navigates to its `link` route.
- A "Mark all as read" action is available at the top of the panel.

### View — `MeetingsView.vue`

A new view following the established patterns (consistent with `ArtistsView.vue`, `AssociationsView.vue`, etc.) that includes:

- A list of all meetings for the current user's mandator displaying title, description, scheduled date/time, and member count.
- A "Create Meeting" button that opens a modal form with fields for title (required), description, and scheduled date/time (required).
- Inline edit and delete actions per meeting row.
- Clicking a meeting opens a detail view or expanded panel with:
  - **Members** — list of assigned users with an "Add Member" action. The user picker only shows users within the same mandator. Members can be removed.
  - **Notes** — a chronological list of notes with the ability to add, edit, and delete notes.
  - **Follow-up Tasks** — a list of tasks with title, deadline, assigned user, and completion status. Tasks can be created, edited, deleted, and toggled complete/incomplete. The user picker for assignment only shows users within the same mandator.
- Enriched metadata showing who created/last updated each record and when.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add a new "Meetings" checkbox alongside the existing module toggles (Artists, Releases, Events, Radios, Financials, Associations).
- The checkbox maps to the `module_meetings` column.
- The mandator list view displays a "Meetings" badge (enabled/disabled) consistent with the existing module badges.

### Sensible defaults

- The migration sets `module_meetings = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_meetings: true`.

## Definition of Done

- The `meetings`, `meeting_members`, `meeting_notes`, `meeting_tasks`, and `notifications` tables exist with the specified schemas, RLS policies, and triggers.
- The `mandators` table has a `module_meetings` boolean flag, defaulting to `true` on all existing and new records.
- Meetings are fully scoped to a mandator — users in one mandator cannot see or access meetings belonging to another mandator.
- Only users within the same mandator can be added as meeting members or assigned to follow-up tasks.
- The `useMeetings` composable provides reactive state and full CRUD for meetings, members, notes, and tasks, following the enrichment pattern used by other composables.
- The `useNotifications` composable provides reactive notification state with unread count, and supports mark-as-read operations.
- The `useMandator` composable exposes `meetingsEnabled` and includes `'meetings'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Meetings" tab appears in the navigation when the module is enabled for the current user's mandator.
- Navigating directly to `/meetings` when the module is disabled redirects to the first available enabled module.
- The admin can toggle the Meetings module on/off per mandator via the existing mandator management UI.
- The inbox bell icon with unread counter appears in the top bar for all authenticated users.
- Notifications are created automatically when a follow-up task's deadline is approaching or has been reached.
- Clicking a notification navigates directly to the relevant meeting.
- All existing mandators are migrated with the flag enabled (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
