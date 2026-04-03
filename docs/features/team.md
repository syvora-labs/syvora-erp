# Feature: Team

## Description

Introduce a Team module for managing the people behind the label. Team members represent the individuals who run the label day-to-day and who staff events. Each team member has a full name, a profile image (optional), and one or more general roles that describe their permanent position within the organisation. In addition, team members can be assigned to specific events with event-specific roles that describe their function at that event.

The module distinguishes between two kinds of roles:

- **General roles** — permanent positions within the label: `Founder`, `Co-Founder`, `Creative Manager`, `Production`.
- **Event roles** — assigned per-event: `Bar`, `Runner`, `Facility`, `Event Management`.

A team member can exist without any event assignment (e.g. a Founder who doesn't work events), and can be assigned to multiple events with different event roles. The same person can hold multiple event roles at the same event (e.g. both `Runner` and `Facility`).

The module is gated behind the mandator profile system (`module_team`) and follows the same enable/disable pattern as all other ERP modules.

## Deliverables

### Database — `team_members` table

A new `team_members` table storing the label's team roster:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` ON DELETE CASCADE |
| `full_name` | TEXT | NOT NULL — the person's display name |
| `image_url` | TEXT | — optional profile photo URL stored in Supabase Storage |
| `general_roles` | TEXT[] | NOT NULL, DEFAULT `'{}'` — array of general role labels (e.g. `{'Founder', 'Creative Manager'}`) |
| `user_id` | UUID | FK → `auth.users(id)` ON DELETE SET NULL — optional link to a platform user account |
| `created_by` | UUID | FK → `auth.users(id)` ON DELETE SET NULL |
| `updated_by` | UUID | FK → `auth.users(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE only rows where `mandator_id` matches their own profile's mandator.

### Database — `team_event_assignments` table

A join table linking team members to events with event-specific roles:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `team_member_id` | UUID | NOT NULL, FK → `team_members(id)` ON DELETE CASCADE |
| `event_id` | UUID | NOT NULL, FK → `events(id)` ON DELETE CASCADE |
| `event_role` | TEXT | NOT NULL — one of `Bar`, `Runner`, `Facility`, `Event Management` (or custom) |
| `notes` | TEXT | — optional notes for this assignment (e.g. shift times, special instructions) |
| `created_by` | UUID | FK → `auth.users(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |

UNIQUE constraint on `(team_member_id, event_id, event_role)` — prevents duplicate role assignments.

RLS policies: same mandator-scoped access as `team_members` (resolved via `team_member_id → team_members.mandator_id`).

### Database — `mandators.module_team` flag

Add a `module_team` (BOOLEAN, NOT NULL, DEFAULT `true`) column to the existing `mandators` table. All existing mandator records are updated to have this flag set to `true`.

### Supabase Storage — `team-photos` bucket

A new storage bucket `team-photos` (public read, authenticated write) for team member profile images. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max file size: 5 MB.

### Composable — `useTeam`

A new composable following the established pattern that:

- Exposes `teamMembers` (ref array) and `loading` (ref boolean) state.
- Provides `fetchTeamMembers()` — fetches all team members for the current mandator, ordered by `full_name`, enriched with `creator_name` and `updater_name` resolved from `profiles`.
- Provides `createTeamMember(form)`, `updateTeamMember(id, form)`, `deleteTeamMember(id)` — standard CRUD operations that set `mandator_id` from the current user's profile, set `created_by` / `updated_by` to the current user, and re-fetch the list after mutation.
- Provides `uploadTeamMemberImage(file, memberId)` — uploads the image to the `team-photos` bucket under `<mandator_id>/<member_id>/photo.<ext>` and returns the public URL.
- Provides `fetchEventAssignments(teamMemberId)` — fetches all event assignments for a specific team member, enriched with the event title from the `events` table.
- Provides `fetchTeamForEvent(eventId)` — fetches all team members assigned to a specific event with their event roles. Used to display the event crew.
- Provides `assignToEvent(teamMemberId, eventId, eventRole, notes?)`, `removeEventAssignment(assignmentId)`, `updateEventAssignment(assignmentId, form)` — CRUD for event assignments.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `teamEnabled` (computed from `mandator.module_team`).
- Add `'team'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULES` array:
  ```ts
  { route: 'team', column: 'module_team', label: 'Team' }
  ```
- `isModuleEnabled('team')` returns the correct value.

### Navigation and routing

- Add `team` to the nav group definitions in `useNavGroups` under the "Operations" group:
  ```ts
  { route: 'team', label: 'Team', keywords: ['team', 'crew', 'staff', 'member', 'role'] }
  ```
- Add a new route in `router/index.ts`:
  ```ts
  { path: '/team', component: TeamView, meta: { requiresAuth: true, module: 'team' } }
  ```
- The existing `beforeEach` guard already reads the `module` meta field and redirects to the first enabled module when a disabled module's path is accessed — no additional guard logic needed.

### View — `TeamView.vue`

A new view following the established patterns that includes:

- **Team roster** — a grid or list of all team members for the current mandator displaying: profile image (or initials fallback via `SyvoraAvatar`), full name, and general role badges.
- A **"Add Team Member"** button that opens a modal form with:
  - **Full Name** (required)
  - **General Roles** — multi-select checkboxes for `Founder`, `Co-Founder`, `Creative Manager`, `Production`. Multiple can be selected.
  - **Profile Image** — file upload with preview. Stored in the `team-photos` bucket.
  - **Link to User** — optional user picker restricted to the current mandator's users. When linked, the team member inherits the user's avatar as a fallback.
- Inline **edit** and **delete** actions per team member.
- Clicking a team member opens a **detail panel** with:
  - The member's image, name, and general roles.
  - **Event Assignments** — a list of all events this person is assigned to, showing event title, date, and their event role(s). Each assignment can be removed.
  - An **"Assign to Event"** action that opens a picker with:
    - An **Event** dropdown showing events from the current mandator (from the `events` table).
    - An **Event Role** selector for `Bar`, `Runner`, `Facility`, `Event Management`.
    - Optional **Notes** field.

### Events integration

When the Team module is enabled alongside the Events module:

- Each event in `EventsView` gains a **"Crew"** section (visible in the event detail/expanded panel) listing all team members assigned to that event with their event roles.
- A quick **"Assign Crew"** action on the event allows selecting an existing team member and assigning an event role directly from the event context.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add a new "Team" checkbox alongside the existing module toggles.
- The checkbox maps to the `module_team` column.
- The mandator list view displays a "Team" badge (enabled/disabled) consistent with the existing module badges.

### Sensible defaults

- The migration sets `module_team = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_team: true`.
- The general roles list (`Founder`, `Co-Founder`, `Creative Manager`, `Production`) and event roles list (`Bar`, `Runner`, `Facility`, `Event Management`) are defined as constants in the composable and referenced by the view. They are not stored in a separate database table — this keeps the implementation simple while allowing future extension to a configurable roles table if needed.

## Definition of Done

- The `team_members` and `team_event_assignments` tables exist with the specified schemas, RLS policies, UNIQUE constraints, and triggers.
- The `mandators` table has a `module_team` boolean flag, defaulting to `true` on all existing and new records.
- The `team-photos` Supabase Storage bucket exists with public read access and authenticated write.
- Team members are fully scoped to a mandator — users in one mandator cannot see or access team members belonging to another mandator.
- The `useTeam` composable provides reactive state and full CRUD for team members and event assignments, following the enrichment pattern used by other composables.
- The `useMandator` composable exposes `teamEnabled` and includes `'team'` in `enabledModules` and `MODULES`.
- A new "Team" tab appears in the navigation when the module is enabled for the current user's mandator.
- Navigating directly to `/team` when the module is disabled redirects to the first available enabled module.
- Team members can be created with a full name, one or more general roles, and an optional profile image.
- Team members can be assigned to events with event-specific roles.
- The same team member can be assigned to multiple events, and can hold multiple roles at the same event (separate assignment rows).
- Event assignments display the event title, date, and role.
- The events view shows a "Crew" section listing assigned team members when the Team module is enabled.
- The admin can toggle the Team module on/off per mandator via the existing mandator management UI.
- All existing mandators are migrated with the flag enabled (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
- Profile images are uploaded to the `team-photos` storage bucket and displayed via `SyvoraAvatar` with an initials fallback.
