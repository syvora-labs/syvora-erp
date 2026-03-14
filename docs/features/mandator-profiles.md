# Feature: Mandator Profile System

## Description

Introduce a mandator profile system to control which ERP modules are active. Each mandator (tenant/configuration) can enable or disable features such as Artists, Releases, Events, Radios and Financials, allowing the ERP to be tailored to different label setups without the need for code changes. Disabled modules should be hidden from the navigation menu and their routes should be made inaccessible to ensure a clean and focused experience for each mandator.

Every mandator profile must be assigned to a registered user in the system. A user's `profiles` record references exactly one mandator via a foreign key (`mandator_id`). This binding determines which module set the user sees after login. Admins can reassign users to a different mandator at any time through the existing admin panel, and the change takes effect on the user's next page load without requiring a re-login.

## Deliverables

### Database — `mandators` table

A new `mandators` table with:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `name` | TEXT | NOT NULL — human-readable label name (e.g. "Syvora Main", "Sub-Label X") |
| `module_artists` | BOOLEAN | NOT NULL, DEFAULT true |
| `module_releases` | BOOLEAN | NOT NULL, DEFAULT true |
| `module_events` | BOOLEAN | NOT NULL, DEFAULT true |
| `module_radios` | BOOLEAN | NOT NULL, DEFAULT true |
| `module_financials` | BOOLEAN | NOT NULL, DEFAULT true |
| `created_by` | UUID | FK → auth.users |
| `updated_by` | UUID | FK → auth.users |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now(), with existing `set_updated_at` trigger |

RLS policies: all authenticated users can SELECT; only admins can INSERT, UPDATE, DELETE.

### Database — `profiles.mandator_id` foreign key

Add a `mandator_id` (UUID, FK → mandators.id) column to the existing `profiles` table. The column is nullable during the migration to avoid breaking existing users, but the application should treat a missing mandator as "all modules enabled" (graceful fallback). A default mandator record with all flags enabled is seeded during the migration and assigned to every existing profile.

### Composable — `useMandator`

A new composable that:

- Loads the mandator record linked to `currentProfile.mandator_id` on app initialisation (called from `App.vue` after auth resolves).
- Exposes reactive, read-only flags: `artistsEnabled`, `releasesEnabled`, `eventsEnabled`, `radiosEnabled`, `financialsEnabled`.
- Exposes a computed `enabledModules` list for iteration in navigation and guards.
- Provides a `refreshMandator()` method so the admin UI can re-fetch after toggling flags without a full reload.
- Falls back to all-modules-enabled when no mandator is assigned (defensive default).

### Navigation and routing

- In `App.vue`, wrap each nav item with a `v-if` check against the corresponding `useMandator` flag (same pattern already used for the admin-only Users tab via `isAdmin`).
- Add a `beforeEach` guard in `router/index.ts` that reads the mandator flags and redirects to a fallback route (e.g. the first enabled module, or a dedicated `/no-access` page) when a user navigates to a disabled module's path.
- Each route's `meta` gains an optional `module` field (e.g. `meta: { requiresAuth: true, module: 'artists' }`) so the guard can resolve the flag generically.

### Admin UI — mandator management

- Extend `AdminView.vue` with a new tab (using the existing `SyvoraTabs` component) for "Mandators".
- CRUD for mandator profiles: create, rename, toggle individual module flags, delete (with safeguard: cannot delete a mandator while users are still assigned to it).
- In the existing user-management section, add a mandator assignment dropdown so admins can assign or reassign a user's mandator.
- Toggle changes persist immediately via Supabase and call `refreshMandator()` so the current session reflects the update without a full page reload.

### Sensible defaults

- The seed migration creates a "Default" mandator with all modules enabled.
- The `handle_new_user` trigger (or the admin user-creation flow in `AdminView.vue`) assigns the default mandator to every newly created profile.

## Definition of Done

- The mandator profile is loaded on app initialisation (after auth) and is available globally via `useMandator`.
- Every user in the system is assigned to exactly one mandator; the admin panel enforces this.
- Navigation items are shown or hidden based on the current user's mandator module flags.
- Navigating directly to a disabled module's route redirects to the first available enabled module (or a fallback page).
- The admin can create/edit mandator profiles and toggle modules on/off without deployment or code changes.
- Reassigning a user to a different mandator or toggling a flag takes effect without a full page reload.
- Existing users are migrated to a default mandator with all modules enabled (no breaking change on deploy).
- RLS policies ensure only admins can modify mandator records; all authenticated users can read their own mandator.
