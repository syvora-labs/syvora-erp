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
