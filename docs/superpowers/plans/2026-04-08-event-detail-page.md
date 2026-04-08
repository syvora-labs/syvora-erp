# Event Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an event detail page at `/events/:id` with three tabs: Overview, Team Assignments, and Financial Transactions.

**Architecture:** Single-file `EventDetailView.vue` following the `ArtistDetailView.vue` pattern. Extends `useEvents` composable with `fetchEventById`. Reuses `useTeam` (already has `fetchTeamForEvent`, `assignToEvent`, `removeEventAssignment`, `updateEventAssignment`) and `useFinancialTransactions` composable. No new database tables needed.

**Tech Stack:** Vue 3, TypeScript, Supabase, `@syvora/ui` components

---

## File Structure

- **Create:** `web/src/views/EventDetailView.vue` — detail page with header, 3 tabs, edit/assignment/transaction modals
- **Modify:** `web/src/composables/useEvents.ts` — add `fetchEventById(id)`
- **Modify:** `web/src/router/index.ts` — add `/events/:id` route
- **Modify:** `web/src/views/EventsView.vue` — make event cards clickable via `router.push`

---

### Task 1: Add `fetchEventById` to useEvents composable

**Files:**
- Modify: `web/src/composables/useEvents.ts`

- [ ] **Step 1: Add `fetchEventById` function**

Add this function inside `useEvents()`, after `fetchEvents`:

```typescript
async function fetchEventById(id: string): Promise<LabelEvent | null> {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()
    if (error) return null

    const raw = data as Omit<LabelEvent, 'creator_name' | 'updater_name'>

    const userIds = [raw.created_by, raw.updated_by].filter((id): id is string => !!id)
    let profileMap: Record<string, string | null> = {}
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
    }

    return {
        ...raw,
        creator_name: raw.created_by ? (profileMap[raw.created_by] ?? null) : null,
        updater_name: raw.updated_by ? (profileMap[raw.updated_by] ?? null) : null,
    }
}
```

- [ ] **Step 2: Export `fetchEventById` in the return object**

Add `fetchEventById` to the return object in `useEvents()`:

```typescript
return {
    events,
    activeEvents,
    archivedEvents,
    loading,
    fetchEvents,
    fetchEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    publishEvent,
    unpublishEvent,
    archiveEvent,
    unarchiveEvent,
    uploadEventArtwork,
}
```

- [ ] **Step 3: Verify build**

Run: `yarn workspace web build 2>&1 | head -20`
Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add web/src/composables/useEvents.ts
git commit -m "feat(web): add fetchEventById to useEvents composable"
```

---

### Task 2: Add `/events/:id` route

**Files:**
- Modify: `web/src/router/index.ts`

- [ ] **Step 1: Add import for EventDetailView**

After the `EventsView` import (line 6), add:

```typescript
import EventDetailView from "../views/EventDetailView.vue";
```

- [ ] **Step 2: Add route entry**

After the `/events` route (line 31), add:

```typescript
{ path: "/events/:id", component: EventDetailView, meta: { requiresAuth: true, module: "events" } },
```

- [ ] **Step 3: Commit**

```bash
git add web/src/router/index.ts
git commit -m "feat(web): add /events/:id route for event detail page"
```

Note: Build will fail until Task 3 creates EventDetailView. That's fine — this task establishes the route.

---

### Task 3: Create EventDetailView — Header + Overview Tab

**Files:**
- Create: `web/src/views/EventDetailView.vue`

- [ ] **Step 1: Create the full EventDetailView.vue**

Create `web/src/views/EventDetailView.vue` with the header, overview tab, and edit modal. The team assignments and financial transactions tabs will be added in Tasks 4 and 5.

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvents, type LabelEvent } from '../composables/useEvents'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
    SyvoraTabs, useIsMobile,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const eventId = computed(() => route.params.id as string)

const {
    fetchEventById, updateEvent, deleteEvent,
    publishEvent, unpublishEvent, archiveEvent, unarchiveEvent,
    uploadEventArtwork, fetchEvents,
} = useEvents()

const event = ref<LabelEvent | null>(null)
const loadingEvent = ref(true)

const activeTab = ref('overview')

const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team' },
    { key: 'financials', label: 'Financials' },
])

onMounted(async () => {
    event.value = await fetchEventById(eventId.value)
    loadingEvent.value = false
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    })
}

function isUpcoming(d: string | null) {
    if (!d) return false
    return new Date(d) >= new Date()
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function handlePublish() {
    if (!event.value) return
    try {
        await publishEvent(event.value.id)
        event.value = await fetchEventById(eventId.value)
    } catch (e: any) {
        alert(e.message ?? 'Failed to publish.')
    }
}

async function handleUnpublish() {
    if (!event.value) return
    try {
        await unpublishEvent(event.value.id)
        event.value = await fetchEventById(eventId.value)
    } catch (e: any) {
        alert(e.message ?? 'Failed to revert to draft.')
    }
}

async function handleArchive() {
    if (!event.value) return
    if (!confirm(`Archive "${event.value.title}"?`)) return
    try {
        await archiveEvent(event.value.id)
        event.value = await fetchEventById(eventId.value)
    } catch (e: any) {
        alert(e.message ?? 'Failed to archive.')
    }
}

async function handleUnarchive() {
    if (!event.value) return
    try {
        await unarchiveEvent(event.value.id)
        event.value = await fetchEventById(eventId.value)
    } catch (e: any) {
        alert(e.message ?? 'Failed to restore.')
    }
}

async function handleDelete() {
    if (!event.value) return
    if (!confirm(`Delete "${event.value.title}"? This cannot be undone.`)) return
    try {
        await deleteEvent(event.value.id)
        await fetchEvents()
        router.push('/events')
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

// ── Edit Modal ───────────────────────────────────────────────────────────────

const showEditModal = ref(false)
const saving = ref(false)
const editError = ref('')
const editForm = ref({
    title: '',
    description: '',
    lineupRaw: '',
    location: '',
    event_date: '',
    event_time: '',
    ticket_link: '',
})
const artworkFile = ref<File | null>(null)
const artworkPreview = ref<string | null>(null)

function openEdit() {
    if (!event.value) return
    const dt = event.value.event_date ? new Date(event.value.event_date) : null
    editForm.value = {
        title: event.value.title,
        description: event.value.description ?? '',
        lineupRaw: event.value.lineup.join(', '),
        location: event.value.location ?? '',
        event_date: dt ? (dt.toISOString().split('T')[0] ?? '') : '',
        event_time: dt ? dt.toTimeString().slice(0, 5) : '',
        ticket_link: event.value.ticket_link ?? '',
    }
    artworkFile.value = null
    artworkPreview.value = event.value.artwork_url ?? null
    editError.value = ''
    showEditModal.value = true
}

function closeEditModal() {
    showEditModal.value = false
}

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    artworkFile.value = file
    artworkPreview.value = URL.createObjectURL(file)
}

function buildEventDate(): string | null {
    if (!editForm.value.event_date) return null
    const time = editForm.value.event_time || '00:00'
    return new Date(`${editForm.value.event_date}T${time}`).toISOString()
}

async function saveEdit() {
    if (!event.value) return
    if (!editForm.value.title.trim()) {
        editError.value = 'Title is required.'
        return
    }
    saving.value = true
    editError.value = ''
    try {
        const lineup = editForm.value.lineupRaw.split(',').map(s => s.trim()).filter(Boolean)
        let artwork_url = event.value.artwork_url
        if (artworkFile.value) {
            artwork_url = await uploadEventArtwork(artworkFile.value, event.value.id)
        }
        await updateEvent(event.value.id, {
            title: editForm.value.title.trim(),
            description: editForm.value.description.trim() || null,
            lineup,
            location: editForm.value.location.trim() || null,
            event_date: buildEventDate(),
            ticket_link: editForm.value.ticket_link.trim() || null,
            artwork_url,
        })
        event.value = await fetchEventById(eventId.value)
        closeEditModal()
    } catch (e: any) {
        editError.value = e.message ?? 'Failed to save.'
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <button class="back-btn" @click="router.push('/events')">← Events</button>

        <div v-if="loadingEvent" class="loading-text">Loading…</div>

        <template v-else-if="event">
            <div class="event-header">
                <div class="event-artwork">
                    <img v-if="event.artwork_url" :src="event.artwork_url" :alt="event.title" />
                    <div v-else class="event-artwork-placeholder">
                        {{ event.title.charAt(0).toUpperCase() }}
                    </div>
                </div>
                <div class="event-info">
                    <div class="event-name-row">
                        <h1 class="event-name">{{ event.title }}</h1>
                        <span v-if="event.is_draft" class="badge badge-draft">Draft</span>
                        <span v-else class="badge badge-published">Published</span>
                        <span
                            v-if="!event.is_draft && event.event_date"
                            class="badge"
                            :class="isUpcoming(event.event_date) ? 'badge-success' : 'badge-warning'"
                        >
                            {{ isUpcoming(event.event_date) ? 'Upcoming' : 'Past' }}
                        </span>
                        <span v-if="event.is_archived" class="badge badge-archived">Archived</span>
                    </div>
                    <p v-if="event.location" class="event-location">{{ event.location }}</p>
                    <p class="event-date-line">{{ formatEventDate(event.event_date) }}</p>
                    <div class="event-header-actions">
                        <SyvoraButton size="sm" @click="openEdit">Edit</SyvoraButton>
                        <SyvoraButton v-if="event.is_draft" size="sm" @click="handlePublish">Publish</SyvoraButton>
                        <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnpublish">Revert to Draft</SyvoraButton>
                        <SyvoraButton v-if="!event.is_archived" variant="ghost" size="sm" @click="handleArchive">Archive</SyvoraButton>
                        <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnarchive">Restore</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete">Delete</SyvoraButton>
                    </div>
                </div>
            </div>

            <SyvoraTabs v-model="activeTab" :tabs="tabs" />

            <!-- Overview tab -->
            <div v-if="activeTab === 'overview'" class="tab-content">
                <div v-if="event.description" class="detail-section">
                    <h3 class="detail-label">Description</h3>
                    <p class="detail-text">{{ event.description }}</p>
                </div>

                <div v-if="event.lineup.length" class="detail-section">
                    <h3 class="detail-label">Lineup</h3>
                    <div class="lineup-badges">
                        <span v-for="(artist, i) in event.lineup" :key="i" class="badge badge-deposit">
                            {{ artist }}
                        </span>
                    </div>
                </div>

                <div v-if="event.ticket_link && !event.is_draft" class="detail-section">
                    <h3 class="detail-label">Tickets</h3>
                    <a :href="event.ticket_link" target="_blank" class="ticket-link">{{ event.ticket_link }} ↗</a>
                </div>

                <div class="detail-section detail-audit">
                    <span>Created by {{ event.creator_name ?? 'Unknown' }} · {{ formatAuditDate(event.created_at) }}</span>
                    <span v-if="event.updater_name"> · Updated by {{ event.updater_name }} · {{ formatAuditDate(event.updated_at) }}</span>
                </div>
            </div>

            <!-- Team tab (placeholder — Task 4) -->
            <div v-if="activeTab === 'team'" class="tab-content">
                <SyvoraEmptyState>Team assignments will appear here.</SyvoraEmptyState>
            </div>

            <!-- Financials tab (placeholder — Task 5) -->
            <div v-if="activeTab === 'financials'" class="tab-content">
                <SyvoraEmptyState>Financial transactions will appear here.</SyvoraEmptyState>
            </div>
        </template>

        <div v-else class="loading-text">Event not found.</div>
    </div>

    <!-- Edit Modal -->
    <SyvoraModal v-if="showEditModal" title="Edit Event" size="lg" @close="closeEditModal">
        <div class="modal-form">
            <div class="artwork-upload">
                <div class="artwork-preview" @click="($refs.artworkInput as HTMLInputElement).click()">
                    <img v-if="artworkPreview" :src="artworkPreview" alt="Artwork" />
                    <div v-else class="artwork-placeholder">
                        <span>+</span>
                        <small>Event artwork</small>
                    </div>
                    <div class="artwork-overlay">Change artwork</div>
                </div>
                <input ref="artworkInput" type="file" accept="image/*" class="hidden-input" @change="onArtworkPick" />
            </div>

            <div v-if="event && !event.is_draft" class="published-notice">
                <span class="badge badge-published">Published</span>
                Editing will update the live event.
            </div>

            <SyvoraFormField label="Event Title" for="ev-title">
                <SyvoraInput id="ev-title" v-model="editForm.title" placeholder="Event name" />
            </SyvoraFormField>

            <div class="form-row">
                <SyvoraFormField label="Date" for="ev-date" class="flex-1">
                    <SyvoraInput id="ev-date" v-model="editForm.event_date" type="date" />
                </SyvoraFormField>
                <SyvoraFormField label="Time" for="ev-time" class="flex-1">
                    <SyvoraInput id="ev-time" v-model="editForm.event_time" type="time" />
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Location" for="ev-location">
                <SyvoraInput id="ev-location" v-model="editForm.location" placeholder="Venue name, city" />
            </SyvoraFormField>

            <SyvoraFormField label="Lineup (comma-separated)" for="ev-lineup">
                <SyvoraInput id="ev-lineup" v-model="editForm.lineupRaw" placeholder="Artist One, Artist Two, DJ Three" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="ev-desc">
                <SyvoraTextarea id="ev-desc" v-model="editForm.description" placeholder="Event description…" :rows="3" />
            </SyvoraFormField>

            <SyvoraFormField label="Ticket Link" for="ev-tickets">
                <SyvoraInput id="ev-tickets" v-model="editForm.ticket_link" placeholder="https://tickets.example.com" />
            </SyvoraFormField>

            <p v-if="editError" class="error-msg">{{ editError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeEditModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveEdit">Save Changes</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 800px; margin: 0 auto; }

.back-btn {
    background: none; border: none; color: var(--color-text-muted);
    font-size: 0.875rem; cursor: pointer; padding: 0; margin-bottom: 1.5rem;
    transition: color 0.15s;
}
.back-btn:hover { color: var(--color-text); }

.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem; }

/* ── Header ──────────────────────────────────────────────────────────────── */
.event-header { display: flex; align-items: flex-start; gap: 1.5rem; margin-bottom: 1.5rem; }

.event-artwork {
    width: 120px; height: 120px; border-radius: 1rem; overflow: hidden; flex-shrink: 0;
    border: 2px solid var(--color-border);
}
.event-artwork img { width: 100%; height: 100%; object-fit: cover; }
.event-artwork-placeholder {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    font-size: 2.5rem; font-weight: 700; color: var(--color-accent);
    background: linear-gradient(135deg, rgba(115,195,254,0.08), rgba(115,195,254,0.18));
}

.event-info { flex: 1; min-width: 0; }
.event-name-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.event-name { font-size: 2rem; font-weight: 800; margin: 0; color: var(--color-text); }
.event-location { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.9rem; }
.event-date-line { margin: 0.125rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }
.event-header-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-top: 0.75rem; }

/* ── Badges ──────────────────────────────────────────────────────────────── */
.badge-draft {
    background: rgba(100,100,100,0.12); color: rgba(12,26,39,0.55);
    border: 1px solid rgba(100,100,100,0.2);
}
.badge-published {
    background: rgba(115,195,254,0.1); color: var(--color-accent);
    border: 1px solid rgba(115,195,254,0.22);
}
.badge-archived {
    background: rgba(120,80,0,0.09); color: rgba(120,80,0,0.75);
    border: 1px solid rgba(120,80,0,0.18);
}
.badge-success {
    background: rgba(34,197,94,0.1); color: rgba(34,197,94,0.85);
    border: 1px solid rgba(34,197,94,0.2);
}
.badge-warning {
    background: rgba(234,179,8,0.1); color: rgba(180,130,0,0.85);
    border: 1px solid rgba(234,179,8,0.2);
}

/* ── Tabs & Content ──────────────────────────────────────────────────────── */
.tab-content { margin-top: 1.5rem; }

.detail-section { margin-bottom: 1.5rem; }
.detail-label {
    font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted);
    text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.5rem;
}
.detail-text {
    margin: 0; font-size: 0.9375rem; color: var(--color-text);
    line-height: 1.65; white-space: pre-wrap;
}
.lineup-badges { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.ticket-link {
    font-size: 0.875rem; font-weight: 600; color: var(--color-accent);
    text-decoration: none; word-break: break-all;
}
.ticket-link:hover { opacity: 0.75; }

.detail-audit { font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.7; }

/* ── Section header (for tabs with add buttons) ──────────────────────── */
.section-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;
}
.section-title { font-size: 1.25rem; font-weight: 700; margin: 0; color: var(--color-text); }

/* ── Cards (shared for team/tx rows) ─────────────────────────────────── */
.item-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 0.875rem; padding: 1rem 1.25rem; transition: border-color 0.15s;
}
.item-card:hover { border-color: var(--color-accent); }
.item-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.item-info { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.item-name { font-size: 1rem; font-weight: 700; color: var(--color-text); }
.item-meta { font-size: 0.8rem; color: var(--color-text-muted); }
.item-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }

/* ── Modal ────────────────────────────────────────────────────────────── */
.modal-form { display: flex; flex-direction: column; gap: 1rem; }
.artwork-upload { display: flex; justify-content: center; }
.artwork-preview {
    width: 140px; height: 140px; border-radius: 1rem; overflow: hidden;
    cursor: pointer; position: relative;
    background: rgba(115,195,254,0.08); border: 1.5px dashed rgba(115,195,254,0.3);
    display: flex; align-items: center; justify-content: center;
}
.artwork-preview img { width: 100%; height: 100%; object-fit: cover; }
.artwork-placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; color: var(--color-text-muted); }
.artwork-placeholder span { font-size: 2rem; color: var(--color-accent); }
.artwork-overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.5); color: #fff;
    font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s;
}
.artwork-preview:hover .artwork-overlay { opacity: 1; }
.form-row { display: flex; gap: 0.75rem; align-items: flex-end; }
.flex-1 { flex: 1; min-width: 0; }
.hidden-input { display: none; }

.published-notice {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.8125rem; color: var(--color-text-muted);
    padding: 0.5rem 0.75rem;
    background: rgba(115,195,254,0.06); border-radius: var(--radius-sm);
    border: 1px solid rgba(115,195,254,0.15);
}

.error-msg { color: var(--color-error, #f87171); font-size: 0.85rem; margin: 0; }

:deep(.btn-danger) { color: var(--color-error, #f87171); }

/* ── Responsive ──────────────────────────────────────────────────────── */
.mobile .event-header { flex-direction: column; align-items: center; text-align: center; }
.mobile .event-artwork { width: 96px; height: 96px; }
.mobile .event-name { font-size: 1.5rem; }
.mobile .event-name-row { justify-content: center; }
.mobile .event-header-actions { justify-content: center; }
.mobile .form-row { flex-direction: column; }
.mobile .item-main { flex-direction: column; }
.mobile .item-actions { align-self: flex-end; }
.mobile .section-header { flex-wrap: wrap; gap: 0.75rem; }
</style>
```

- [ ] **Step 2: Verify build**

Run: `yarn workspace web build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add web/src/views/EventDetailView.vue
git commit -m "feat(web): add EventDetailView with header, overview tab, and edit modal"
```

---

### Task 4: Add Team Assignments Tab

**Files:**
- Modify: `web/src/views/EventDetailView.vue`

- [ ] **Step 1: Add team imports and state**

In `<script setup>`, add the import after the `useEvents` import:

```typescript
import { useTeam, type TeamEventAssignment, type TeamMember, EVENT_ROLES } from '../composables/useTeam'
```

Add the team composable destructuring after the events composable:

```typescript
const {
    teamMembers, fetchTeamMembers,
    fetchTeamForEvent, assignToEvent, removeEventAssignment, updateEventAssignment,
} = useTeam()
```

Add team state after the existing state refs:

```typescript
const teamAssignments = ref<TeamEventAssignment[]>([])
const loadingTeam = ref(true)
```

- [ ] **Step 2: Add team loading to onMounted**

Update onMounted to also load team data:

```typescript
onMounted(async () => {
    event.value = await fetchEventById(eventId.value)
    loadingEvent.value = false

    await Promise.all([loadTeam(), fetchTeamMembers()])
})
```

Add the `loadTeam` function:

```typescript
async function loadTeam() {
    loadingTeam.value = true
    teamAssignments.value = await fetchTeamForEvent(eventId.value)
    loadingTeam.value = false
}
```

- [ ] **Step 3: Add team assignment modal state and handlers**

Add after the edit modal section:

```typescript
// ── Team Assignment Modal ────────────────────────────────────────────────────

const showTeamModal = ref(false)
const editingAssignment = ref<TeamEventAssignment | null>(null)
const savingAssignment = ref(false)
const teamError = ref('')
const teamForm = ref({ team_member_id: '', event_role: '', notes: '' })

const availableMembers = computed(() => {
    const assignedIds = new Set(teamAssignments.value.map(a => a.team_member_id))
    if (editingAssignment.value) {
        assignedIds.delete(editingAssignment.value.team_member_id)
    }
    return teamMembers.value.filter(m => !assignedIds.has(m.id))
})

function openCreateAssignment() {
    editingAssignment.value = null
    teamForm.value = { team_member_id: '', event_role: '', notes: '' }
    teamError.value = ''
    showTeamModal.value = true
}

function openEditAssignment(a: TeamEventAssignment) {
    editingAssignment.value = a
    teamForm.value = {
        team_member_id: a.team_member_id,
        event_role: a.event_role,
        notes: a.notes ?? '',
    }
    teamError.value = ''
    showTeamModal.value = true
}

function closeTeamModal() {
    showTeamModal.value = false
    editingAssignment.value = null
}

async function saveAssignment() {
    if (!editingAssignment.value && !teamForm.value.team_member_id) {
        teamError.value = 'Select a team member.'
        return
    }
    if (!teamForm.value.event_role) {
        teamError.value = 'Select a role.'
        return
    }
    savingAssignment.value = true
    teamError.value = ''
    try {
        if (editingAssignment.value) {
            await updateEventAssignment(editingAssignment.value.id, {
                event_role: teamForm.value.event_role,
                notes: teamForm.value.notes || null,
            })
        } else {
            await assignToEvent(
                teamForm.value.team_member_id,
                eventId.value,
                teamForm.value.event_role,
                teamForm.value.notes || undefined,
            )
        }
        await loadTeam()
        closeTeamModal()
    } catch (e: any) {
        teamError.value = e.message ?? 'Failed to save assignment.'
    } finally {
        savingAssignment.value = false
    }
}

async function handleRemoveAssignment(a: TeamEventAssignment) {
    if (!confirm(`Remove ${a.member_name ?? 'this member'} from this event?`)) return
    try {
        await removeEventAssignment(a.id)
        teamAssignments.value = teamAssignments.value.filter(x => x.id !== a.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to remove.')
    }
}
```

- [ ] **Step 4: Update the tabs computed to include team count**

Replace the tabs computed:

```typescript
const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team', count: teamAssignments.value.length },
    { key: 'financials', label: 'Financials' },
])
```

- [ ] **Step 5: Replace the team tab placeholder in template**

Replace the team tab placeholder with:

```html
<!-- Team tab -->
<div v-if="activeTab === 'team'" class="tab-content">
    <div class="section-header">
        <h2 class="section-title">Team Assignments</h2>
        <SyvoraButton @click="openCreateAssignment">+ Assign</SyvoraButton>
    </div>

    <div v-if="loadingTeam" class="loading-text">Loading team…</div>

    <SyvoraEmptyState v-else-if="teamAssignments.length === 0">
        No team members assigned to this event yet.
    </SyvoraEmptyState>

    <div v-else class="items-list">
        <div v-for="a in teamAssignments" :key="a.id" class="item-card">
            <div class="item-main">
                <div class="item-info">
                    <div class="item-name-row">
                        <div v-if="a.member_image_url" class="member-avatar">
                            <img :src="a.member_image_url" :alt="a.member_name ?? ''" />
                        </div>
                        <span class="item-name">{{ a.member_name ?? 'Unknown' }}</span>
                        <span class="badge badge-deposit">{{ a.event_role }}</span>
                    </div>
                    <p v-if="a.notes" class="item-meta">{{ a.notes }}</p>
                </div>
                <div class="item-actions">
                    <SyvoraButton variant="ghost" size="sm" @click="openEditAssignment(a)">Edit</SyvoraButton>
                    <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleRemoveAssignment(a)">Remove</SyvoraButton>
                </div>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 6: Add team assignment modal to template**

Add after the edit modal closing tag (`</SyvoraModal>`):

```html
<!-- Team Assignment Modal -->
<SyvoraModal v-if="showTeamModal" :title="editingAssignment ? 'Edit Assignment' : 'Assign Team Member'" size="md" @close="closeTeamModal">
    <div class="modal-form">
        <SyvoraFormField v-if="!editingAssignment" label="Team Member" for="tm-member">
            <select id="tm-member" v-model="teamForm.team_member_id" class="form-select">
                <option value="" disabled>Select a member…</option>
                <option v-for="m in availableMembers" :key="m.id" :value="m.id">{{ m.full_name }}</option>
            </select>
        </SyvoraFormField>

        <SyvoraFormField label="Role" for="tm-role">
            <select id="tm-role" v-model="teamForm.event_role" class="form-select">
                <option value="" disabled>Select a role…</option>
                <option v-for="role in EVENT_ROLES" :key="role" :value="role">{{ role }}</option>
            </select>
        </SyvoraFormField>

        <SyvoraFormField label="Notes (optional)" for="tm-notes">
            <SyvoraTextarea id="tm-notes" v-model="teamForm.notes" placeholder="Additional notes…" :rows="2" />
        </SyvoraFormField>

        <p v-if="teamError" class="error-msg">{{ teamError }}</p>
    </div>
    <template #footer>
        <SyvoraButton variant="ghost" @click="closeTeamModal">Cancel</SyvoraButton>
        <SyvoraButton :loading="savingAssignment" :disabled="savingAssignment" @click="saveAssignment">
            {{ editingAssignment ? 'Save Changes' : 'Assign' }}
        </SyvoraButton>
    </template>
</SyvoraModal>
```

- [ ] **Step 7: Add team-specific styles**

Add to the `<style scoped>` section:

```css
/* ── Team items ──────────────────────────────────────────────────────── */
.items-list { display: flex; flex-direction: column; gap: 0.75rem; }
.item-name-row { display: flex; align-items: center; gap: 0.5rem; }
.member-avatar { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
.member-avatar img { width: 100%; height: 100%; object-fit: cover; }

.form-select {
    width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
    border: 1px solid var(--color-border); background: var(--color-surface);
    color: var(--color-text); font-size: 0.875rem; outline: none;
    transition: border-color 0.15s; font-family: inherit;
}
.form-select:focus { border-color: var(--color-accent); }
```

- [ ] **Step 8: Verify build**

Run: `yarn workspace web build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add web/src/views/EventDetailView.vue
git commit -m "feat(web): add team assignments tab to event detail page"
```

---

### Task 5: Add Financial Transactions Tab

**Files:**
- Modify: `web/src/views/EventDetailView.vue`

- [ ] **Step 1: Add financial imports and state**

Add imports:

```typescript
import { useFinancialTransactions, type FinancialTransaction } from '../composables/useFinancialTransactions'
import { useFinancialCategories } from '../composables/useFinancialCategories'
```

Add composable destructuring:

```typescript
const {
    transactions: allTransactions, fetchTransactions,
    createTransaction, updateTransaction, deleteTransaction,
} = useFinancialTransactions()
const { categories, fetchCategories } = useFinancialCategories()
```

Add computed and state:

```typescript
const eventTransactions = computed(() =>
    allTransactions.value.filter(t => t.event_id === eventId.value)
)
const loadingTx = ref(true)
```

- [ ] **Step 2: Update onMounted**

Update the `Promise.all` to include financial data:

```typescript
onMounted(async () => {
    event.value = await fetchEventById(eventId.value)
    loadingEvent.value = false

    await Promise.all([loadTeam(), fetchTeamMembers(), loadTransactions()])
})
```

Add:

```typescript
async function loadTransactions() {
    loadingTx.value = true
    await Promise.all([fetchTransactions(), fetchCategories()])
    loadingTx.value = false
}
```

- [ ] **Step 3: Add transaction modal state and handlers**

```typescript
// ── Transaction Modal ────────────────────────────────────────────────────────

const showTxModal = ref(false)
const editingTx = ref<FinancialTransaction | null>(null)
const savingTx = ref(false)
const txError = ref('')
const txForm = ref({
    type: 'expense' as string,
    amount: '',
    description: '',
    category_id: '',
    transaction_date: '',
    is_pending: false,
})

const categoriesForType = computed(() => {
    const t = txForm.value.type
    return categories.value.filter(c => c.type === t || c.type === 'both')
})

function openCreateTx() {
    editingTx.value = null
    txForm.value = { type: 'expense', amount: '', description: '', category_id: '', transaction_date: '', is_pending: false }
    txError.value = ''
    showTxModal.value = true
}

function openEditTx(tx: FinancialTransaction) {
    editingTx.value = tx
    txForm.value = {
        type: tx.type,
        amount: String(tx.amount),
        description: tx.description,
        category_id: tx.category_id ?? '',
        transaction_date: tx.transaction_date,
        is_pending: tx.is_pending,
    }
    txError.value = ''
    showTxModal.value = true
}

function closeTxModal() {
    showTxModal.value = false
    editingTx.value = null
}

async function saveTx() {
    const amt = parseFloat(txForm.value.amount)
    if (!amt || amt <= 0) { txError.value = 'Amount must be greater than 0.'; return }
    if (!txForm.value.description.trim()) { txError.value = 'Description is required.'; return }
    if (!txForm.value.transaction_date) { txError.value = 'Date is required.'; return }

    savingTx.value = true
    txError.value = ''
    try {
        const payload = {
            type: txForm.value.type,
            amount: amt,
            description: txForm.value.description.trim(),
            category_id: txForm.value.category_id || null,
            event_id: eventId.value,
            transaction_date: txForm.value.transaction_date,
            is_pending: txForm.value.is_pending,
        }
        if (editingTx.value) {
            await updateTransaction(editingTx.value.id, payload)
        } else {
            await createTransaction(payload)
        }
        closeTxModal()
    } catch (e: any) {
        txError.value = e.message ?? 'Failed to save.'
    } finally {
        savingTx.value = false
    }
}

async function handleDeleteTx(tx: FinancialTransaction) {
    if (!confirm(`Delete transaction "${tx.description}"?`)) return
    try {
        await deleteTransaction(tx.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

function formatTxDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(tx: FinancialTransaction) {
    const formatted = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(tx.amount)
    return tx.type === 'income' ? `+${formatted}` : `-${formatted}`
}
```

- [ ] **Step 4: Update tabs computed to include transaction count**

```typescript
const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team', count: teamAssignments.value.length },
    { key: 'financials', label: 'Financials', count: eventTransactions.value.length },
])
```

- [ ] **Step 5: Replace the financials tab placeholder in template**

```html
<!-- Financials tab -->
<div v-if="activeTab === 'financials'" class="tab-content">
    <div class="section-header">
        <h2 class="section-title">Transactions</h2>
        <SyvoraButton @click="openCreateTx">+ Add Transaction</SyvoraButton>
    </div>

    <div v-if="loadingTx" class="loading-text">Loading transactions…</div>

    <SyvoraEmptyState v-else-if="eventTransactions.length === 0">
        No transactions linked to this event yet.
    </SyvoraEmptyState>

    <div v-else class="items-list">
        <div v-for="tx in eventTransactions" :key="tx.id" class="item-card">
            <div class="item-main">
                <div class="item-info">
                    <div class="item-name-row">
                        <span class="item-name">{{ tx.description }}</span>
                        <span v-if="tx.category_name" class="badge" :style="{ background: (tx.category_color ?? '#73c3fe') + '18', color: tx.category_color ?? 'var(--color-accent)', border: '1px solid ' + (tx.category_color ?? '#73c3fe') + '33' }">
                            {{ tx.category_name }}
                        </span>
                        <span v-if="tx.is_pending" class="badge badge-draft">Pending</span>
                    </div>
                    <span class="item-meta">{{ formatTxDate(tx.transaction_date) }}</span>
                </div>
                <div class="tx-right">
                    <span class="tx-amount" :class="tx.type === 'income' ? 'tx-income' : 'tx-expense'">
                        {{ formatAmount(tx) }}
                    </span>
                    <div class="item-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="openEditTx(tx)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteTx(tx)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 6: Add transaction modal to template**

Add after the team assignment modal:

```html
<!-- Transaction Modal -->
<SyvoraModal v-if="showTxModal" :title="editingTx ? 'Edit Transaction' : 'Add Transaction'" size="md" @close="closeTxModal">
    <div class="modal-form">
        <SyvoraFormField label="Type" for="tx-type">
            <select id="tx-type" v-model="txForm.type" class="form-select">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
            </select>
        </SyvoraFormField>

        <SyvoraFormField label="Amount (CHF)" for="tx-amount">
            <SyvoraInput id="tx-amount" v-model="txForm.amount" type="number" placeholder="0.00" />
        </SyvoraFormField>

        <SyvoraFormField label="Description" for="tx-desc">
            <SyvoraInput id="tx-desc" v-model="txForm.description" placeholder="What was this for?" />
        </SyvoraFormField>

        <SyvoraFormField label="Date" for="tx-date">
            <SyvoraInput id="tx-date" v-model="txForm.transaction_date" type="date" />
        </SyvoraFormField>

        <SyvoraFormField label="Category (optional)" for="tx-cat">
            <select id="tx-cat" v-model="txForm.category_id" class="form-select">
                <option value="">None</option>
                <option v-for="c in categoriesForType" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
        </SyvoraFormField>

        <label class="pending-toggle">
            <input type="checkbox" v-model="txForm.is_pending" />
            <span>Mark as pending</span>
        </label>

        <p v-if="txError" class="error-msg">{{ txError }}</p>
    </div>
    <template #footer>
        <SyvoraButton variant="ghost" @click="closeTxModal">Cancel</SyvoraButton>
        <SyvoraButton :loading="savingTx" :disabled="savingTx" @click="saveTx">
            {{ editingTx ? 'Save Changes' : 'Add Transaction' }}
        </SyvoraButton>
    </template>
</SyvoraModal>
```

- [ ] **Step 7: Add financial styles**

Add to `<style scoped>`:

```css
/* ── Transactions ────────────────────────────────────────────────────── */
.tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.375rem; flex-shrink: 0; }
.tx-amount { font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.tx-income { color: rgba(34,197,94,0.85); }
.tx-expense { color: var(--color-error, #f87171); }

.pending-toggle {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.875rem; color: var(--color-text); cursor: pointer;
}
.pending-toggle input { accent-color: var(--color-accent); }
```

- [ ] **Step 8: Verify build**

Run: `yarn workspace web build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add web/src/views/EventDetailView.vue
git commit -m "feat(web): add financial transactions tab to event detail page"
```

---

### Task 6: Make Event Cards Clickable in EventsView

**Files:**
- Modify: `web/src/views/EventsView.vue`

- [ ] **Step 1: Add router import**

Add `useRouter` import at the top of `<script setup>`:

```typescript
import { useRouter } from 'vue-router'
```

Add after the `isMobile` line:

```typescript
const router = useRouter()
```

- [ ] **Step 2: Add click handler for navigation**

Add this function after the existing helper functions:

```typescript
function goToEvent(event: LabelEvent) {
    router.push(`/events/${event.id}`)
}
```

- [ ] **Step 3: Make active event cards clickable**

On the active event card `<div>` (the one with `class="event-card"`), add the click handler and cursor style. Change:

```html
<div
    v-for="event in activeEvents"
    :key="event.id"
    class="event-card"
    :class="{ 'event-card--draft': event.is_draft }"
>
```

To:

```html
<div
    v-for="event in activeEvents"
    :key="event.id"
    class="event-card event-card--clickable"
    :class="{ 'event-card--draft': event.is_draft }"
    @click="goToEvent(event)"
>
```

- [ ] **Step 4: Make archived event cards clickable**

Similarly update the archived event card. Change:

```html
<div
    v-for="event in archivedEvents"
    :key="event.id"
    class="event-card event-card--archived"
>
```

To:

```html
<div
    v-for="event in archivedEvents"
    :key="event.id"
    class="event-card event-card--clickable event-card--archived"
    @click="goToEvent(event)"
>
```

- [ ] **Step 5: Add clickable cursor style**

Add to the `<style scoped>` section:

```css
.event-card--clickable { cursor: pointer; }
```

- [ ] **Step 6: Verify build**

Run: `yarn workspace web build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add web/src/views/EventsView.vue
git commit -m "feat(web): make event cards clickable to navigate to detail page"
```
