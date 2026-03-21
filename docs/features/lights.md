# Feature: Lights

## Description

Introduce a Lights module for creating and managing custom lightshows that can be displayed fullscreen on big screens, LED walls, or beamers during events. Each lightshow belongs to the mandator of the user who creates it, and only users within the same mandator can view or edit that lightshow. The module is accessible via a new "Lights" tab in the main navigation under a new "Live" section (alongside "Content" and "Operations"), gated behind the mandator profile system like all other modules.

A lightshow is a real-time, browser-rendered visual composition built from three distinct modes that can be switched live during playback:

1. **Gradient Mode** — A smooth, animated colour gradient as the base layer. The user picks a set of colours that blend together. On top of the gradient, a single large shape (circle, square, triangle, etc.) can be placed that moves around the canvas. The shape integrates visually into the gradient and can be configured to flicker, shimmer, or pulse, bringing motion and life to the gradient.

2. **Buildup Mode** — Designed for song buildups and energy surges. It extends the gradient base with two bright vertical lines on the left and right edges of the screen that animate upward from bottom to top in a sweeping motion. A central shape appears within the gradient that scales up progressively (the "buildup"), accompanied by strobing flashes that increase in intensity. The purpose is to visually amplify rising energy in a track.

3. **Text Mode** — Overlays large, bold text on top of the gradient base. The text uses a custom font bundled with the application. Users can type any message (e.g. artist names, event slogans, countdowns) and have it rendered prominently across the screen.

During playback, the lightshow opens in the browser's fullscreen mode. The operator can switch between modes in real time using controls that are hidden from the projected output (overlay controls or a secondary window/tab).

## Deliverables

### Database — `lightshows` table

A new `lightshows` table with:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `title` | TEXT | NOT NULL — name of the lightshow |
| `description` | TEXT | — optional description or notes |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` — scopes the lightshow to a mandator |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE only rows where `mandator_id` matches their own profile's mandator. This ensures cross-mandator isolation.

### Database — `lightshow_modes` table

A table storing the configured modes for each lightshow:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `lightshow_id` | UUID | NOT NULL, FK → `lightshows(id)` ON DELETE CASCADE |
| `type` | TEXT | NOT NULL, CHECK `type IN ('gradient', 'buildup', 'text')` — the mode type |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 — controls ordering in the mode switcher |
| `config` | JSONB | NOT NULL, DEFAULT `'{}'::jsonb` — mode-specific configuration (see below) |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: same mandator-scoped access as the `lightshows` table (resolved via `lightshow_id → lightshows.mandator_id`).

#### Mode config schemas (stored in `config` JSONB)

**Gradient mode:**
```json
{
  "colors": ["#ff00aa", "#00aaff", "#aa00ff"],
  "gradient_speed": 0.5,
  "gradient_angle": 45,
  "shape": {
    "type": "circle",
    "size": 0.3,
    "color": "#ffffff",
    "opacity": 0.6,
    "movement_speed": 0.4,
    "movement_pattern": "drift",
    "flicker": true,
    "flicker_intensity": 0.5,
    "shimmer": false,
    "pulse": true,
    "pulse_speed": 0.3
  }
}
```

**Buildup mode** (extends gradient config):
```json
{
  "colors": ["#ff00aa", "#00aaff"],
  "gradient_speed": 0.5,
  "gradient_angle": 45,
  "side_lines": {
    "color": "#ffffff",
    "width": 40,
    "sweep_speed": 0.6,
    "brightness": 1.0
  },
  "buildup_shape": {
    "type": "circle",
    "color": "#ffffff",
    "max_scale": 2.0,
    "buildup_duration": 8.0
  },
  "strobes": {
    "enabled": true,
    "intensity": 0.7,
    "frequency": 0.5
  }
}
```

**Text mode** (extends gradient config):
```json
{
  "colors": ["#ff00aa", "#00aaff"],
  "gradient_speed": 0.5,
  "gradient_angle": 45,
  "text": {
    "content": "SYVORA",
    "color": "#ffffff",
    "size": 0.8,
    "opacity": 1.0,
    "animation": "none"
  }
}
```

### Database — `mandators.module_lights` flag

Add a `module_lights` (BOOLEAN, NOT NULL, DEFAULT `true`) column to the existing `mandators` table. The default mandator seed record (`00000000-0000-0000-0000-000000000001`) is updated to have this flag set to `true`. This follows the same pattern as `module_artists`, `module_releases`, `module_meetings`, etc.

### Composable — `useLights`

A new composable following the established pattern (`useArtists`, `useMeetings`, etc.) that:

- Exposes `lightshows` (ref array) and `loading` (ref boolean) state.
- Provides `fetchLightshows()` — fetches all `lightshows` scoped to the current user's mandator, ordered by `created_at` descending, enriched with `creator_name` and `updater_name` resolved from `profiles`.
- Provides `createLightshow(form)`, `updateLightshow(id, form)`, `deleteLightshow(id)` — standard CRUD operations that set `mandator_id` from the current user's profile, set `created_by` / `updated_by` to the current user, and re-fetch the list after mutation.
- Provides `fetchModes(lightshowId)`, `createMode(lightshowId, form)`, `updateMode(modeId, form)`, `deleteMode(modeId)`, `reorderModes(lightshowId, orderedIds)` — manages the mode entries for a lightshow.

### Composable — `useLightshowPlayer`

A new composable dedicated to the fullscreen playback engine:

- Accepts a lightshow ID and its resolved modes.
- Exposes `activeMode` (ref to the currently playing mode), `isFullscreen` (ref boolean), and `isPlaying` (ref boolean).
- Provides `enterFullscreen(canvasElement)` and `exitFullscreen()` — manages the Fullscreen API lifecycle.
- Provides `switchMode(modeId)` — transitions to a different mode during live playback.
- Provides `startRendering()` and `stopRendering()` — starts/stops the `requestAnimationFrame` render loop.
- Internally manages a `<canvas>` render loop using the Canvas 2D API or WebGL for high-performance gradient, shape, and strobe rendering.
- Handles the gradient colour interpolation, shape movement/flicker/pulse animation, buildup line sweep animation, buildup shape scaling, strobe flash timing, and text rendering with the custom font.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `lightsEnabled` (computed from `mandator.module_lights`).
- Add `'lights'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'lights', column: 'module_lights', label: 'Lights' }
  ```
- `isModuleEnabled('lights')` returns the correct value.

### Navigation and routing

- In `useNavGroups.ts`, add a new group `"Live"` in `GROUP_DEFS` with a single item `{ route: 'lights', label: 'Lights', keywords: ['lights', 'lightshow', 'visuals', 'beamer', 'led', 'strobe'] }`. The "Live" group is placed after "Content" and before "Operations" in the array to reflect its category.
- Add a new route in `router/index.ts`:
  ```ts
  { path: '/lights', name: 'lights', component: LightsView, meta: { requiresAuth: true, module: 'lights' } }
  ```
- The existing `beforeEach` guard already reads the `module` meta field and redirects to the first enabled module when a disabled module's path is accessed — no additional guard logic needed.

### Custom font

- The project's custom fonts are already available in `web/public/fonts/` (Matter family: Regular, SemiBold, Bold, Heavy in OTF format).
- Text mode uses the **Matter-Heavy** weight for maximum impact on screen.
- The text mode renderer loads the font onto the canvas via the `FontFace` API (referencing `/fonts/Matter-Heavy.otf`) to ensure it is available before rendering text.

### View — `LightsView.vue`

A new view following the established patterns (consistent with `ArtistsView.vue`, `RoadmapView.vue`, etc.) that includes:

- **Lightshow list** — a list of all lightshows for the current mandator displaying title, description, and mode count. A "Create Lightshow" button opens a modal form with fields for title (required) and description.
- **Lightshow detail / editor** — clicking a lightshow opens the configuration view:
  - **Mode list** — an ordered list of configured modes with type label, sort handle for reordering, and edit/delete actions. An "Add Mode" button opens a modal to select the mode type and configure its settings.
  - **Mode editor** — per-mode configuration form:
    - *Gradient mode:* colour picker for each gradient colour (add/remove colours), gradient speed slider, gradient angle slider, shape type selector (circle, square, triangle, none), shape size/opacity/movement speed sliders, toggle switches for flicker/shimmer/pulse with intensity sliders.
    - *Buildup mode:* inherits gradient colour settings, plus side-line colour/width/sweep speed controls, buildup shape type and scale/duration settings, strobe toggle with intensity and frequency sliders.
    - *Text mode:* inherits gradient colour settings, plus text content input, text colour picker, text size slider, and text animation selector.
  - **Live preview** — a small canvas preview that renders the currently selected mode's configuration in real time as the user adjusts settings. This preview uses the same render engine as fullscreen playback, just scaled down.
  - **Launch fullscreen** — a button that enters fullscreen playback mode. In fullscreen, the entire viewport is the render canvas. A semi-transparent control bar (auto-hides after inactivity, reappears on mouse movement) provides mode switching buttons and an exit button.
- Inline edit and delete actions per lightshow in the list view.
- Enriched metadata showing who created/last updated each lightshow and when.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add a new "Lights" checkbox alongside the existing module toggles (Artists, Releases, Events, Radios, Financials, Associations, Meetings, Roadmap).
- The checkbox maps to the `module_lights` column.
- The mandator list view displays a "Lights" badge (enabled/disabled) consistent with the existing module badges.

### Sensible defaults

- The migration sets `module_lights = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_lights: true`.

## Definition of Done

- The `lightshows` and `lightshow_modes` tables exist with the specified schemas, RLS policies, CHECK constraints, and triggers.
- The `mandators` table has a `module_lights` boolean flag, defaulting to `true` on all existing and new records.
- Lightshows are fully scoped to a mandator — users in one mandator cannot see or access lightshows belonging to another mandator.
- The `useLights` composable provides reactive state and full CRUD for lightshows and their modes, following the enrichment pattern used by other composables.
- The `useLightshowPlayer` composable manages fullscreen playback with real-time mode switching, canvas rendering, and animation lifecycle.
- The `useMandator` composable exposes `lightsEnabled` and includes `'lights'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Live" navigation section appears in the sidebar containing the "Lights" tab, when the module is enabled for the current user's mandator.
- Navigating directly to `/lights` when the module is disabled redirects to the first available enabled module.
- The admin can toggle the Lights module on/off per mandator via the existing mandator management UI.
- Gradient mode renders an animated colour gradient with an optional shape that can move, flicker, shimmer, and pulse.
- Buildup mode extends the gradient with sweeping side lines, a scaling central shape, and strobes.
- Text mode overlays large text using the custom bundled font on top of the gradient base.
- The fullscreen player fills the entire viewport, hides browser UI, and provides an auto-hiding control overlay for mode switching.
- The live preview in the editor reflects configuration changes in real time using the same render engine as fullscreen playback.
- Modes can be created, edited, reordered, and deleted per lightshow.
- Text mode uses the existing Matter-Heavy font from `web/public/fonts/` loaded onto the canvas via the FontFace API.
- All existing mandators are migrated with the flag enabled (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
