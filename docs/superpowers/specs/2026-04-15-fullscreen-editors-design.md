---
name: Fullscreen route-based editors for radios, releases, events
description: Replace cramped modal editors with full-page sectioned editors at dedicated routes
status: design
date: 2026-04-15
---

# Fullscreen route-based editors for radios, releases, events

## Problem

The modal editors for radios, releases, and events are cramped. They cap at `size="lg"` (640px) inside `SyvoraModal`, but the forms have grown to include many fields, file uploads, artwork pickers, track lists with reorder controls, and toggles. Users have to scroll inside a small modal body to reach footer save buttons, and complex sub-flows (like adding tracks to a release) feel pinched.

The codebase has already started moving toward dedicated detail views for radios and events (see `RadioDetailView.vue` from the most recent commit and the existing `EventDetailView.vue`). Editing should follow the same direction.

## Goals

- Replace the three modal editors with full-page editors at dedicated routes.
- Match the navigation pattern already used by detail views.
- Use the extra space to reduce visual density and group fields semantically.
- Prevent silent loss of unsaved work.

## Non-goals

- Changing field semantics or schema.
- Reworking lineup input from comma-separated string to chip input.
- Touching the `SyvoraModal` component itself (still used by Admin, Profile, etc.).
- Backend / Supabase schema changes.

## Design

### Routes & navigation

Six new editor routes:

```
/releases/new          /releases/:id/edit
/radios/new            /radios/:id/edit
/events/new            /events/:id/edit
```

One new detail-view route to mirror the existing pattern for radios/events:

```
/releases/:id          → ReleaseDetailView (new)
```

Navigation flow:

| From | Action | Goes to |
|------|--------|---------|
| List view | Click "+ New" | `/<entity>/new` |
| List view | Click row | `/<entity>/:id` (detail view) |
| Detail view | Click "Edit" | `/<entity>/:id/edit` |
| Editor | Click Cancel | `router.back()` |
| Editor | Save (new mode) | `/<entity>/:id` (detail view) |
| Editor | Save (edit mode) | stays on editor; dirty cleared |
| Release editor | First save in new mode | URL replaces to `/releases/:id/edit`, Tracks section appears |

### Editor shell component

A new shared layout component: `packages/ui/src/components/SyvoraEditorPage.vue`.

```
┌────────────────────────────────────────────────────────────┐
│  ← Back   "Edit Release: <title>"      [Cancel]  [Save]    │  ← sticky header
├──────────┬─────────────────────────────────────────────────┤
│ Basics   │  ## Basics                                      │
│ Artwork  │  [form fields...]                               │
│ Tracks   │                                                 │
│ Desc.    │  ## Artwork                                     │
│          │  [artwork picker]                               │
│  ↑       │                                                 │
│ sticky   │  ## Tracks                                      │
│ side nav │  [tracks list...]                               │
│          │                                                 │
│          │  ## Description                                 │
│          │  [textarea]                                     │
└──────────┴─────────────────────────────────────────────────┘
```

**Component API:**

- **Props**:
  - `title: string` — header label, e.g. "Edit Release" or "New Release"
  - `subtitle?: string` — optional secondary label, e.g. the entity title once typed
  - `sections: Array<{ id: string; label: string }>` — drives side nav
  - `saving: boolean`
  - `dirty: boolean`
  - `canSave: boolean` — controls Save button enabled state
- **Slots**: one named slot per `section.id` (e.g. `<template #basics>...</template>`)
- **Emits**: `save`, `cancel`

**Behavior:**

- Side nav scrolls smoothly to clicked section; active section highlighted as user scrolls (IntersectionObserver).
- Sticky header stays visible during scroll; Save button shows loading state when `saving` and is disabled when `!canSave || saving`.
- On mobile (using existing `useIsMobile` composable from `@syvora/ui`): side nav is hidden, sections render stacked, header stays sticky.

### Section breakdown per entity

**RadioEditorView** (`/radios/new`, `/radios/:id/edit`)

| Section | Fields |
|---------|--------|
| Basics | title, artists (chip multi-select), release date |
| Links | SoundCloud URL |
| Description | textarea |

Files are removed from the editor and managed exclusively in `RadioDetailView`'s Files tab.

**ReleaseEditorView** (`/releases/new`, `/releases/:id/edit`)

| Section | Fields |
|---------|--------|
| Basics | title, type, artist, release date |
| Artwork | large picker (~400×400 preview) |
| Tracks | track list with reorder + add (hidden in new mode until first save) |
| Description | textarea |

**EventEditorView** (`/events/new`, `/events/:id/edit`)

| Section | Fields |
|---------|--------|
| Basics | title, date, time, location |
| Artwork | large picker |
| Lineup | comma-separated input (no change in input style) |
| Description | textarea |
| Tickets | ticket link + internal/external toggle |

### Save behavior & dirty-state guard

**Dirty tracking:**

Each editor view keeps a `lastSavedSnapshot` of the form state. On any field change, `dirty = !deepEqual(form, lastSavedSnapshot)`. Snapshot is set on initial load (edit mode) or on empty form init (new mode), then refreshed on every successful save. `canSave = dirty && hasRequiredFields && !saving`.

**Leaving with unsaved changes:**

A small composable in `web/src/composables/useDirtyGuard.ts`:

```ts
export function useDirtyGuard(dirty: Ref<boolean>) {
  // Vue Router guard
  onBeforeRouteLeave((_to, _from, next) => {
    if (!dirty.value) return next()
    if (window.confirm('You have unsaved changes. Leave?')) return next()
    next(false)
  })

  // Browser unload
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty.value) e.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
```

Cancel button uses the same dirty check before calling `router.back()`.

**Save flow:**

| Mode | After successful save |
|------|----------------------|
| New | `router.push('/<entity>/' + newId)` (to detail view) |
| Edit | Stay on page; refresh `lastSavedSnapshot`; Save button disables until next change |
| Release new (special) | `router.replace('/releases/' + newId + '/edit')`; Tracks section appears |

### `ReleaseDetailView` (new)

Mirrors `RadioDetailView` and `EventDetailView`.

**Header:**
- Back button → `/releases`
- Title: release name + artist
- Status badge (Draft / Published)
- Edit button → `/releases/:id/edit`
- Lifecycle actions: Publish / Unpublish / Delete (matching the patterns already used in radio/event detail views)

**Body** — `SyvoraTabs`:
- **Overview**: artwork (large), title, artist, type, release date, description, audit info (created/updated)
- **Tracks**: track list with audio player, **read-only display** (management lives in editor)

**`ReleasesView` changes:**
- Row click → `/releases/:id` (currently opens modal)
- Per-row "Edit" action → `/releases/:id/edit`
- Other per-row quick actions (publish/delete) stay in the list

### Cleanup

**`web/src/views/RadiosView.vue`:**
- Remove `<SyvoraModal>` block (lines 316–412)
- Remove modal state: `showModal`, `editingRadio`, `form`, `pendingFiles`, `newFileLabel`, `error`, `saving`
- Remove modal handlers: `closeModal`, `saveRadio`, `onFilePick`, `removePendingFile`, `handleDeleteFile`, `downloadFile`
- Remove modal-only `<style scoped>` rules
- Wire "+ New" button → `router.push('/radios/new')`
- Wire inline "Edit" action → `router.push('/radios/' + id + '/edit')`

**`web/src/views/ReleasesView.vue`:**
- Remove `<SyvoraModal>` block (lines 531–627)
- Remove modal state and handlers (artwork pick, track add/reorder/delete, form)
- Remove modal-only style rules
- Wire "+ New" button → `router.push('/releases/new')`
- Wire row click → `router.push('/releases/' + id)`
- Wire inline "Edit" action → `router.push('/releases/' + id + '/edit')`

**`web/src/views/EventsView.vue`:**
- Remove `<SyvoraModal>` block (lines 427–500)
- Remove modal state and handlers
- Remove modal-only style rules
- Wire "+ New" button → `router.push('/events/new')`
- Wire inline "Edit" action → `router.push('/events/' + id + '/edit')`

**`web/src/views/RadioDetailView.vue`:**
- Remove the inline edit `<SyvoraModal>` (lines 331–388) and its handlers (`showEditModal`, `openEditModal`, `closeEditModal`, related form/save logic)
- Remove `SyvoraModal` from the `@syvora/ui` import if no longer used
- Replace the existing Edit button's click handler with `router.push('/radios/' + id + '/edit')`

**`web/src/views/EventDetailView.vue`:**
- Remove ONLY the inline event-edit `<SyvoraModal>` (lines 572–642) and its handlers (`showEditModal`, `openEditModal`, `closeEditModal`, event form/save logic)
- **Keep** the Team Assignment modal (lines 645–673) and Transaction modal (lines 676–717) — these manage sub-resources of the event and are out of scope for this work
- Keep the `SyvoraModal` import (still used by the two preserved modals)
- Replace the existing Edit button's click handler with `router.push('/events/' + id + '/edit')`

**Unchanged:**
- `useReleases`, `useRadios`, `useEvents` composables — existing CRUD reused
- Supabase schema and migrations
- `SyvoraModal` component itself (still used elsewhere)
- Sub-resource modals in `EventDetailView` (team assignments, transactions)

## Affected files

**New:**
- `packages/ui/src/components/SyvoraEditorPage.vue`
- `packages/ui/src/index.ts` — export `SyvoraEditorPage`
- `web/src/composables/useDirtyGuard.ts`
- `web/src/views/RadioEditorView.vue`
- `web/src/views/ReleaseEditorView.vue`
- `web/src/views/ReleaseDetailView.vue`
- `web/src/views/EventEditorView.vue`

**Modified:**
- `web/src/router/index.ts` — register seven new routes
- `web/src/views/RadiosView.vue` — remove modal, wire navigation
- `web/src/views/ReleasesView.vue` — remove modal, wire navigation
- `web/src/views/EventsView.vue` — remove modal, wire navigation
- `web/src/views/RadioDetailView.vue` — remove inline edit modal; Edit button → editor route
- `web/src/views/EventDetailView.vue` — remove inline event-edit modal (keep team/transaction modals); Edit button → editor route

## Open questions

None at design time — all decisions were made during brainstorming.
