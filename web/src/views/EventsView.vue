<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useEvents, type LabelEvent } from '../composables/useEvents'
import { useMandator } from '../composables/useMandator'
import { useSales, type EventSalesSummary } from '../composables/useSales'
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs,
    useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()
const router = useRouter()
const { salesEnabled } = useMandator()
const { fetchEventSalesSummary } = useSales()

const {
    activeEvents, archivedEvents, loading,
    fetchEvents, createEvent, deleteEvent,
    publishEvent, unpublishEvent,
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
            ticket_management: event.ticket_management,
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
            <SyvoraButton @click="router.push('/events/new')">+ New Event</SyvoraButton>
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
                                <SyvoraButton variant="ghost" size="sm" @click.stop="router.push(`/events/${event.id}/edit`)">Edit</SyvoraButton>
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

/* ── Mobile ───────────────────────────────────────────────────────── */
.mobile .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
}

.mobile .event-card {
    flex-direction: column;
}

.mobile .event-artwork {
    width: 100%;
    height: 160px;
    border-radius: var(--radius-card) var(--radius-card) 0 0;
}

.mobile .event-title {
    font-size: 1.1rem;
    overflow-wrap: break-word;
    word-break: break-word;
}

.mobile .event-meta {
    gap: 0.4rem;
}

.mobile .event-date {
    width: 100%;
    margin-top: 0.125rem;
}

.mobile .event-audit {
    overflow-wrap: break-word;
    word-break: break-word;
}

.mobile .event-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .event-actions {
    width: 100%;
}
</style>
