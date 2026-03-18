# Feature: Roadmap Planning

## Description

Introduce a Roadmap Planning module for creating and managing visual timelines within the ERP. The module presents a horizontal calendar view where months are laid out side by side, scrolling left to right. Users define a time range for the roadmap, create vertical categories on the left axis, and place horizontal bars across months within those categories to represent planned items (releases, campaigns, milestones, etc.). Each roadmap belongs to the mandator of the user who creates it, and only users within the same mandator can view or edit that roadmap. The module is accessible via a new "Roadmap" tab in the main navigation, gated behind the mandator profile system like all other modules.

The timeline view is the core of this module. The horizontal axis represents months — each column is one month, rendered at a consistent width. The vertical axis displays user-defined categories stacked on top of each other. Within each category row, users can create bars that span one or more months to visualise duration and overlap of planned work.

## Deliverables

### Database — `roadmaps` table

A new `roadmaps` table with:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `title` | TEXT | NOT NULL — name of the roadmap |
| `description` | TEXT | — optional description or purpose |
| `start_date` | DATE | NOT NULL — first month of the visible timeline (day is always 1st) |
| `end_date` | DATE | NOT NULL — last month of the visible timeline (day is always 1st) |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` — scopes the roadmap to a mandator |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

CHECK constraint: `end_date > start_date`.

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE only rows where `mandator_id` matches their own profile's mandator. This ensures cross-mandator isolation.

### Database — `roadmap_categories` table

A table for the vertical category rows within a roadmap:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `roadmap_id` | UUID | NOT NULL, FK → `roadmaps(id)` ON DELETE CASCADE |
| `name` | TEXT | NOT NULL — label displayed on the left axis |
| `color` | TEXT | — optional hex color for visual distinction |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 — controls vertical stacking order |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: same mandator-scoped access as the `roadmaps` table (resolved via `roadmap_id → roadmaps.mandator_id`).

### Database — `roadmap_items` table

A table for the horizontal bars placed within categories:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `category_id` | UUID | NOT NULL, FK → `roadmap_categories(id)` ON DELETE CASCADE |
| `title` | TEXT | NOT NULL — label displayed on the bar |
| `description` | TEXT | — optional detail or notes |
| `start_date` | DATE | NOT NULL — first day of the bar's span |
| `end_date` | DATE | NOT NULL — last day of the bar's span |
| `color` | TEXT | — optional hex color for the bar |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

CHECK constraint: `end_date >= start_date`.

RLS policies: same mandator-scoped access as the `roadmaps` table (resolved via `category_id → roadmap_categories.roadmap_id → roadmaps.mandator_id`).

### Database — `mandators.module_roadmap` flag

Add a `module_roadmap` (BOOLEAN, NOT NULL, DEFAULT `true`) column to the existing `mandators` table. The default mandator seed record (`00000000-0000-0000-0000-000000000001`) is updated to have this flag set to `true`. This follows the same pattern as `module_artists`, `module_releases`, `module_meetings`, etc.

### Composable — `useRoadmap`

A new composable following the established pattern (`useArtists`, `useMeetings`, etc.) that:

- Exposes `roadmaps` (ref array) and `loading` (ref boolean) state.
- Provides `fetchRoadmaps()` — fetches all `roadmaps` scoped to the current user's mandator, ordered by `start_date` ascending, enriched with `creator_name` and `updater_name` resolved from `profiles`.
- Provides `createRoadmap(form)`, `updateRoadmap(id, form)`, `deleteRoadmap(id)` — standard CRUD operations that set `mandator_id` from the current user's profile, set `created_by` / `updated_by` to the current user, and re-fetch the list after mutation.
- Provides `fetchCategories(roadmapId)`, `createCategory(roadmapId, form)`, `updateCategory(categoryId, form)`, `deleteCategory(categoryId)`, `reorderCategories(roadmapId, orderedIds)` — manages the vertical category rows including drag-to-reorder support.
- Provides `fetchItems(roadmapId)`, `createItem(categoryId, form)`, `updateItem(itemId, form)`, `deleteItem(itemId)` — manages the horizontal bar items within categories.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `roadmapEnabled` (computed from `mandator.module_roadmap`).
- Add `'roadmap'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'roadmap', column: 'module_roadmap', label: 'Roadmap' }
  ```
- `isModuleEnabled('roadmap')` returns the correct value.

### Navigation and routing

- In `App.vue`, add a new nav item for "Roadmap" pointing to `/roadmap`, wrapped with `v-if="roadmapEnabled"` (same pattern as all other module tabs).
- Add a new route in `router/index.ts`:
  ```ts
  { path: '/roadmap', name: 'roadmap', component: RoadmapView, meta: { requiresAuth: true, module: 'roadmap' } }
  ```
- The existing `beforeEach` guard already reads the `module` meta field and redirects to the first enabled module when a disabled module's path is accessed — no additional guard logic needed.

### View — `RoadmapView.vue`

A new view that includes:

- **Roadmap list** — a list of all roadmaps for the current mandator displaying title, description, and time range. A "Create Roadmap" button opens a modal form with fields for title (required), description, start date (required, month picker), and end date (required, month picker).
- **Roadmap detail / timeline view** — clicking a roadmap opens the horizontal calendar view:
  - **Month columns** — the horizontal axis renders one column per month between the roadmap's `start_date` and `end_date`. Each column header shows the month and year (e.g. "Mar 2026"). Columns have a fixed minimum width and the view is horizontally scrollable when many months are present.
  - **Category rows** — the vertical axis on the left shows category labels stacked vertically. Categories can be added, renamed, recolored, reordered (drag handle), and deleted. An "Add Category" button appears below the last category.
  - **Item bars** — within each category row, bars are rendered as horizontal blocks spanning from their `start_date` to their `end_date`, positioned over the corresponding month columns. Bars display their title. Bars can be:
    - **Created** by clicking within a category row (opens a modal with title, description, start date, end date, and color).
    - **Edited** by clicking an existing bar (opens the same modal pre-filled).
    - **Resized** by dragging the left or right edge of a bar to adjust its start or end date.
    - **Moved** by dragging the bar horizontally to shift its date range, or vertically to reassign it to a different category.
    - **Deleted** via the edit modal or a context action.
  - **Today marker** — a vertical line indicating the current date, if it falls within the roadmap's time range.
- Inline edit and delete actions per roadmap in the list view.
- Enriched metadata showing who created/last updated each roadmap and when.
- The roadmap's time range can be adjusted from within the detail view (extending or shrinking the visible months).

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add a new "Roadmap" checkbox alongside the existing module toggles (Artists, Releases, Events, Radios, Financials, Associations, Meetings).
- The checkbox maps to the `module_roadmap` column.
- The mandator list view displays a "Roadmap" badge (enabled/disabled) consistent with the existing module badges.

### Sensible defaults

- The migration sets `module_roadmap = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_roadmap: true`.

## Definition of Done

- The `roadmaps`, `roadmap_categories`, and `roadmap_items` tables exist with the specified schemas, RLS policies, CHECK constraints, and triggers.
- The `mandators` table has a `module_roadmap` boolean flag, defaulting to `true` on all existing and new records.
- Roadmaps are fully scoped to a mandator — users in one mandator cannot see or access roadmaps belonging to another mandator.
- The `useRoadmap` composable provides reactive state and full CRUD for roadmaps, categories, and items, following the enrichment pattern used by other composables.
- The `useMandator` composable exposes `roadmapEnabled` and includes `'roadmap'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Roadmap" tab appears in the navigation when the module is enabled for the current user's mandator.
- Navigating directly to `/roadmap` when the module is disabled redirects to the first available enabled module.
- The admin can toggle the Roadmap module on/off per mandator via the existing mandator management UI.
- The timeline view renders a horizontal month-by-month calendar with category rows and draggable item bars.
- Items can be created, edited, resized, moved (horizontally and between categories), and deleted.
- Categories can be created, renamed, recolored, reordered, and deleted (cascading to their items).
- The roadmap's time range can be adjusted without losing existing items (items outside the new range remain in the database but are not visible until the range is expanded again).
- A today-marker line is visible when the current date falls within the roadmap's time range.
- All existing mandators are migrated with the flag enabled (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
