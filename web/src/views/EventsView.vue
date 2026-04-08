<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useEvents, type LabelEvent } from '../composables/useEvents'
import { useMandator } from '../composables/useMandator'
import { useSales, type EventSalesSummary } from '../composables/useSales'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, SyvoraTabs,
    useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()
const router = useRouter()
const { salesEnabled } = useMandator()
const { fetchEventSalesSummary } = useSales()

const {
    activeEvents, archivedEvents, loading,
    fetchEvents, createEvent, updateEvent, deleteEvent,
    publishEvent, unpublishEvent, uploadEventArtwork,
    archiveEvent, unarchiveEvent,
} = useEvents()

const salesSummaries = ref<Record<string, EventSalesSummary>>({})

async function loadSalesSummaries() {
    if (!salesEnabled.value) return
    const { events } = useEvents()
    const results = await Promise.all(
        events.value.map(async (event) => {
            try {
                const summary = await fetchEventSalesSummary(event.id)
                return { eventId: event.id, summary }
            } catch {
                return null
            }
        })
    )
    for (const r of results) {
        if (r) salesSummaries.value[r.eventId] = r.summary
    }
}

const activeTab = ref<'active' | 'archived'>('active')

const showModal = ref(false)
const editingEvent = ref<LabelEvent | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({
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

const openMenuId = ref<string | null>(null)

function toggleMenu(eventId: string) {
    openMenuId.value = openMenuId.value === eventId ? null : eventId
}

function closeMenu() {
    openMenuId.value = null
}

function onDocClick() {
    openMenuId.value = null
}

onMounted(async () => {
    await fetchEvents()
    loadSalesSummaries()
    document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick)
})

function openCreate() {
    editingEvent.value = null
    form.value = { title: '', description: '', lineupRaw: '', location: '', event_date: '', event_time: '', ticket_link: '' }
    artworkFile.value = null
    artworkPreview.value = null
    error.value = ''
    showModal.value = true
}

function openEdit(event: LabelEvent) {
    editingEvent.value = event
    const dt = event.event_date ? new Date(event.event_date) : null
    form.value = {
        title: event.title,
        description: event.description ?? '',
        lineupRaw: event.lineup.join(', '),
        location: event.location ?? '',
        event_date: dt ? (dt.toISOString().split('T')[0] ?? '') : '',
        event_time: dt ? dt.toTimeString().slice(0, 5) : '',
        ticket_link: event.ticket_link ?? '',
    }
    artworkFile.value = null
    artworkPreview.value = event.artwork_url ?? null
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingEvent.value = null
}

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    artworkFile.value = file
    artworkPreview.value = URL.createObjectURL(file)
}

function buildEventDate(): string | null {
    if (!form.value.event_date) return null
    const time = form.value.event_time || '00:00'
    return new Date(`${form.value.event_date}T${time}`).toISOString()
}

async function saveEvent() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        const lineup = form.value.lineupRaw.split(',').map(s => s.trim()).filter(Boolean)
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description.trim() || null,
            lineup,
            location: form.value.location.trim() || null,
            event_date: buildEventDate(),
            ticket_link: form.value.ticket_link.trim() || null,
        }
        if (editingEvent.value) {
            let artwork_url = editingEvent.value.artwork_url
            if (artworkFile.value) artwork_url = await uploadEventArtwork(artworkFile.value, editingEvent.value.id)
            await updateEvent(editingEvent.value.id, { ...payload, artwork_url })
        } else {
            const newEvent = await createEvent(payload)   // is_draft = true by DB default
            if (artworkFile.value) {
                const artwork_url = await uploadEventArtwork(artworkFile.value, newEvent.id)
                await updateEvent(newEvent.id, { artwork_url })
            }
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save event.'
    } finally {
        saving.value = false
    }
}

async function handlePublish(event: LabelEvent) {
    try {
        await publishEvent(event.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to publish event.')
    }
}

async function handleUnpublish(event: LabelEvent) {
    try {
        await unpublishEvent(event.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to revert to draft.')
    }
}

async function handleArchive(event: LabelEvent) {
    if (!confirm(`Archive "${event.title}"? It will be hidden from the active list.`)) return
    try {
        await archiveEvent(event.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to archive event.')
    }
}

async function handleUnarchive(event: LabelEvent) {
    try {
        await unarchiveEvent(event.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to restore event.')
    }
}

async function handleDuplicate(event: LabelEvent) {
    closeMenu()
    try {
        await createEvent({
            title: `${event.title} (Copy)`,
            description: event.description,
            lineup: [...event.lineup],
            location: event.location,
            event_date: event.event_date,
            ticket_link: event.ticket_link,
        })
    } catch (e: any) {
        alert(e.message ?? 'Failed to duplicate event.')
    }
}

async function handleDelete(event: LabelEvent) {
    if (!confirm(`Delete "${event.title}"?`)) return
    try {
        await deleteEvent(event.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete event.')
    }
}

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

function goToEvent(event: LabelEvent) {
    router.push(`/events/${event.id}`)
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <div class="page-header">
            <div>
                <h1 class="page-title">Events</h1>
                <p class="page-subtitle">Manage shows, release parties, and tours</p>
            </div>
            <SyvoraButton @click="openCreate">+ New Event</SyvoraButton>
        </div>

        <SyvoraTabs
            v-model="activeTab"
            :tabs="[
                { key: 'active', label: 'Active', count: activeEvents.length },
                { key: 'archived', label: 'Archived', count: archivedEvents.length },
            ]"
        />

        <div v-if="loading" class="loading-text">Loading events…</div>

        <!-- Active events -->
        <template v-else-if="activeTab === 'active'">
            <SyvoraEmptyState v-if="activeEvents.length === 0">
                No active events. Create your first one.
            </SyvoraEmptyState>

            <div v-else class="events-list">
                <div
                    v-for="event in activeEvents"
                    :key="event.id"
                    class="event-card event-card--clickable"
                    :class="{ 'event-card--draft': event.is_draft }"
                    @click="goToEvent(event)"
                >
                    <div class="event-more">
                        <button class="event-more-btn" @click.stop="toggleMenu(event.id)" aria-label="More actions">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </button>
                        <div v-if="openMenuId === event.id" class="event-more-menu">
                            <button class="event-more-item" @click.stop="handleDuplicate(event)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                                Duplicate
                            </button>
                        </div>
                    </div>

                    <div class="event-artwork">
                        <img v-if="event.artwork_url" :src="event.artwork_url" :alt="event.title" />
                        <div v-else class="event-artwork-placeholder">◆</div>
                    </div>

                    <div class="event-body">
                        <div class="event-meta">
                            <span v-if="event.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>

                            <span
                                v-if="!event.is_draft"
                                class="badge"
                                :class="isUpcoming(event.event_date) ? 'badge-success' : 'badge-warning'"
                            >
                                {{ isUpcoming(event.event_date) ? 'Upcoming' : 'Past' }}
                            </span>

                            <span class="event-date">{{ formatEventDate(event.event_date) }}</span>
                        </div>

                        <h3 class="event-title">{{ event.title }}</h3>

                        <p v-if="event.location" class="event-location">📍 {{ event.location }}</p>
                        <p v-if="event.description" class="event-desc">{{ event.description }}</p>

                        <div v-if="event.lineup.length" class="event-lineup">
                            <span class="lineup-label">Lineup:</span>
                            <span v-for="(artist, i) in event.lineup" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="event-audit">
                            <span>Created by {{ event.creator_name ?? 'Unknown' }} · {{ formatAuditDate(event.created_at) }}</span>
                            <span v-if="event.updater_name"> · Updated by {{ event.updater_name }} · {{ formatAuditDate(event.updated_at) }}</span>
                        </div>

                        <div v-if="salesEnabled && salesSummaries[event.id]?.phases.length" class="event-tickets-info">
                            <span class="badge badge-deposit">
                                {{ salesSummaries[event.id].total_sold }} / {{ salesSummaries[event.id].phases.reduce((s, p) => s + p.quantity, 0) }} sold
                            </span>
                            <SyvoraButton variant="ghost" size="sm" @click.stop="router.push(`/sales/${event.id}`)">
                                Manage Tickets
                            </SyvoraButton>
                        </div>

                        <div class="event-footer">
                            <a v-if="event.ticket_link && !event.is_draft" :href="event.ticket_link" target="_blank" rel="noopener noreferrer" class="ticket-link" @click.stop>
                                Tickets ↗
                            </a>
                            <div class="event-actions">
                                <SyvoraButton v-if="event.is_draft" size="sm" @click.stop="handlePublish(event)">
                                    Publish
                                </SyvoraButton>
                                <SyvoraButton v-else variant="ghost" size="sm" @click.stop="handleUnpublish(event)">
                                    Revert to Draft
                                </SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click.stop="openEdit(event)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click.stop="handleArchive(event)">Archive</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click.stop="handleDelete(event)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Archived events -->
        <template v-else>
            <SyvoraEmptyState v-if="archivedEvents.length === 0">
                No archived events.
            </SyvoraEmptyState>

            <div v-else class="events-list">
                <div
                    v-for="event in archivedEvents"
                    :key="event.id"
                    class="event-card event-card--clickable event-card--archived"
                    @click="goToEvent(event)"
                >
                    <div class="event-artwork">
                        <img v-if="event.artwork_url" :src="event.artwork_url" :alt="event.title" />
                        <div v-else class="event-artwork-placeholder">◆</div>
                    </div>

                    <div class="event-body">
                        <div class="event-meta">
                            <span class="badge badge-archived">Archived</span>
                            <span v-if="event.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>
                            <span class="event-date">{{ formatEventDate(event.event_date) }}</span>
                        </div>

                        <h3 class="event-title">{{ event.title }}</h3>

                        <p v-if="event.location" class="event-location">📍 {{ event.location }}</p>
                        <p v-if="event.description" class="event-desc">{{ event.description }}</p>

                        <div v-if="event.lineup.length" class="event-lineup">
                            <span class="lineup-label">Lineup:</span>
                            <span v-for="(artist, i) in event.lineup" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="event-audit">
                            <span>Created by {{ event.creator_name ?? 'Unknown' }} · {{ formatAuditDate(event.created_at) }}</span>
                            <span v-if="event.updater_name"> · Updated by {{ event.updater_name }} · {{ formatAuditDate(event.updated_at) }}</span>
                        </div>

                        <div class="event-footer">
                            <div class="event-actions">
                                <SyvoraButton variant="ghost" size="sm" @click.stop="handleUnarchive(event)">Restore</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click.stop="handleDelete(event)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>

    <SyvoraModal v-if="showModal" :title="editingEvent ? 'Edit Event' : 'New Event'" size="lg" @close="closeModal">
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

            <div v-if="editingEvent && !editingEvent.is_draft" class="published-notice">
                <span class="badge badge-published">Published</span>
                Editing will update the live event.
            </div>

            <SyvoraFormField label="Event Title" for="ev-title">
                <SyvoraInput id="ev-title" v-model="form.title" placeholder="Event name" />
            </SyvoraFormField>

            <div class="form-row">
                <SyvoraFormField label="Date" for="ev-date" class="flex-1">
                    <SyvoraInput id="ev-date" v-model="form.event_date" type="date" />
                </SyvoraFormField>
                <SyvoraFormField label="Time" for="ev-time" class="flex-1">
                    <SyvoraInput id="ev-time" v-model="form.event_time" type="time" />
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Location" for="ev-location">
                <SyvoraInput id="ev-location" v-model="form.location" placeholder="Venue name, city" />
            </SyvoraFormField>

            <SyvoraFormField label="Lineup (comma-separated)" for="ev-lineup">
                <SyvoraInput id="ev-lineup" v-model="form.lineupRaw" placeholder="Artist One, Artist Two, DJ Three" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="ev-desc">
                <SyvoraTextarea id="ev-desc" v-model="form.description" placeholder="Event description…" :rows="3" />
            </SyvoraFormField>

            <SyvoraFormField label="Ticket Link" for="ev-tickets">
                <SyvoraInput id="ev-tickets" v-model="form.ticket_link" placeholder="https://tickets.example.com" />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveEvent">
                {{ editingEvent ? 'Save Changes' : 'Save as Draft' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; }
.page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 1.5rem; gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }


.events-list { display: flex; flex-direction: column; gap: 1rem; }

.event-card {
    position: relative;
    background: var(--color-surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: visible;
    display: flex;
    transition: box-shadow 0.3s;
}
.event-card:hover { box-shadow: var(--shadow-card-hover); }
.event-card--draft {
    opacity: 0.82;
    border-style: dashed;
}
.event-card--archived {
    opacity: 0.6;
}
.event-card--clickable { cursor: pointer; }

.event-artwork { width: 160px; flex-shrink: 0; overflow: hidden; border-radius: var(--radius-card) 0 0 var(--radius-card); }
.event-artwork img { width: 100%; height: 100%; object-fit: cover; }
.event-artwork-placeholder {
    width: 100%; min-height: 140px; height: 100%;
    background: linear-gradient(135deg, rgba(115,195,254,0.08), rgba(115,195,254,0.18));
    display: flex; align-items: center; justify-content: center;
    font-size: 2.5rem; color: var(--color-accent);
}

.event-body { flex: 1; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }

.event-meta { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.event-date { font-size: 0.8125rem; color: var(--color-text-muted); }
.event-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.event-location { font-size: 0.9rem; color: var(--color-text-muted); margin: 0; }
.event-desc {
    font-size: 0.9rem; color: var(--color-text-muted); margin: 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.event-lineup { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.lineup-label { font-size: 0.8125rem; color: var(--color-text-muted); }

.event-audit {
    font-size: 0.75rem; color: var(--color-text-muted);
    opacity: 0.7;
}

.event-footer {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: auto; padding-top: 0.5rem;
}
.event-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.ticket-link { font-size: 0.875rem; font-weight: 600; color: var(--color-accent); text-decoration: none; }
.ticket-link:hover { opacity: 0.75; }

/* Status badges */
.badge-draft {
    background: rgba(100, 100, 100, 0.12);
    color: rgba(12, 26, 39, 0.55);
    border: 1px solid rgba(100, 100, 100, 0.2);
}
.badge-published {
    background: rgba(115, 195, 254, 0.1);
    color: var(--color-accent);
    border: 1px solid rgba(115, 195, 254, 0.22);
}
.badge-archived {
    background: rgba(120, 80, 0, 0.09);
    color: rgba(120, 80, 0, 0.75);
    border: 1px solid rgba(120, 80, 0, 0.18);
}

/* Modal */
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
    background: rgba(115,195,254,0.06);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(115,195,254,0.15);
}

/* ── More menu ─────────────────────────────────────────────────────── */
.event-more {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
}

.event-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 0.375rem;
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    background: #fff;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.event-more-btn:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--color-text);
}

.event-more-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    min-width: 140px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 0.625rem;
    padding: 0.25rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 16px 32px rgba(0, 0, 0, 0.06);
    z-index: 100;
}

.event-more-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: none;
    background: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
    cursor: pointer;
    transition: background 0.1s;
    font-family: inherit;
    white-space: nowrap;
}

.event-more-item:hover {
    background: rgba(0, 0, 0, 0.04);
}

.event-tickets-info {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
}

:deep(.btn-danger) { color: var(--color-error); }

.mobile .event-artwork { width: 100px; }
</style>
