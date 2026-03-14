# Feature: Associations

## Description

Introduce an Associations module to manage club members within the ERP. Each association member is an independent record with core contact information (name, email, phone number, address). The module provides full CRUD capabilities — users can create, edit, and delete members from a dedicated view accessible via a new "Associations" tab in the main navigation.

Like all other ERP modules, the Associations feature is gated behind the mandator profile system. Each mandator gains a new `module_associations` flag that controls whether the module is visible and accessible. When disabled, the navigation tab is hidden and direct route access is blocked, consistent with the existing behaviour for Artists, Releases, Events, Radios, and Financials.

## Deliverables

### Database — `association_members` table

A new `association_members` table with:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `name` | TEXT | NOT NULL — full name of the club member |
| `email` | TEXT | — contact email address |
| `phone` | TEXT | — contact phone number |
| `address` | TEXT | — postal address |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: all authenticated users can SELECT, INSERT, UPDATE, DELETE (consistent with other module tables such as `artists`, `releases`, `events`).

### Database — `mandators.module_associations` flag

Add a `module_associations` (BOOLEAN, NOT NULL, DEFAULT `true`) column to the existing `mandators` table. The default mandator seed record (`00000000-0000-0000-0000-000000000001`) is updated to have this flag set to `true`. This follows the same pattern as `module_artists`, `module_releases`, etc.

### Composable — `useAssociations`

A new composable following the established pattern (`useArtists`, `useReleases`, etc.) that:

- Exposes `members` (ref array) and `loading` (ref boolean) state.
- Provides `fetchMembers()` — fetches all `association_members` ordered by `name` ascending, enriched with `creator_name` and `updater_name` resolved from `profiles`.
- Provides `createMember(form)`, `updateMember(id, form)`, `deleteMember(id)` — standard CRUD operations that set `created_by` / `updated_by` to the current user and re-fetch the list after mutation.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `associationsEnabled` (computed from `mandator.module_associations`).
- Add `'associations'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'associations', column: 'module_associations', label: 'Associations' }
  ```
- `isModuleEnabled('associations')` returns the correct value.

### Navigation and routing

- In `App.vue`, add a new nav item for "Associations" pointing to `/associations`, wrapped with `v-if="associationsEnabled"` (same pattern as all other module tabs).
- Add a new route in `router/index.ts`:
  ```ts
  { path: '/associations', name: 'associations', component: AssociationsView, meta: { requiresAuth: true, module: 'associations' } }
  ```
- The existing `beforeEach` guard already reads the `module` meta field and redirects to the first enabled module when a disabled module's path is accessed — no additional guard logic needed.

### View — `AssociationsView.vue`

A new view following the established patterns (consistent with `ArtistsView.vue`, `EventsView.vue`, etc.) that includes:

- A list of all association members displaying name, email, phone number, and address.
- A "Create Member" button that opens a modal form with fields for name (required), email, phone, and address.
- Inline edit and delete actions per member row.
- Edit opens the same modal pre-filled with the member's current data.
- Delete prompts a confirmation before removing the record.
- Enriched metadata showing who created/last updated each record and when.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add a new "Associations" checkbox alongside the existing module toggles (Artists, Releases, Events, Radios, Financials).
- The checkbox maps to the `module_associations` column.
- The mandator list view displays an "Associations" badge (enabled/disabled) consistent with the existing module badges.

### Sensible defaults

- The migration sets `module_associations = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_associations: true`.

## Definition of Done

- The `association_members` table exists with the specified schema, RLS policies, and `updated_at` trigger.
- The `mandators` table has a `module_associations` boolean flag, defaulting to `true` on all existing and new records.
- The `useAssociations` composable provides reactive state and full CRUD for association members, following the enrichment pattern used by other composables.
- The `useMandator` composable exposes `associationsEnabled` and includes `'associations'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Associations" tab appears in the navigation when the module is enabled for the current user's mandator.
- Navigating directly to `/associations` when the module is disabled redirects to the first available enabled module.
- The admin can toggle the Associations module on/off per mandator via the existing mandator management UI.
- Association members can be created, viewed, edited, and deleted from the `AssociationsView`.
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
- All existing mandators are migrated with the flag enabled (no breaking change on deploy).
