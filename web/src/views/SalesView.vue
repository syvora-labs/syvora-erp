<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEvents, type LabelEvent } from '../composables/useEvents'
import { useSales, type EventSalesSummary } from '../composables/useSales'
import {
    SyvoraButton, SyvoraCard, SyvoraEmptyState, SyvoraTabs,
    useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()
const router = useRouter()
const { events, fetchEvents, loading: eventsLoading } = useEvents()
const { fetchEventSalesSummary } = useSales()

const activeTab = ref<'upcoming' | 'past'>('upcoming')
const loading = ref(false)
const summaries = ref<Record<string, EventSalesSummary>>({})

const upcomingEvents = computed(() =>
    events.value.filter(e => !e.event_date || new Date(e.event_date) >= new Date())
)

const pastEvents = computed(() =>
    events.value.filter(e => e.event_date && new Date(e.event_date) < new Date()).reverse()
)

const displayedEvents = computed(() =>
    activeTab.value === 'upcoming' ? upcomingEvents.value : pastEvents.value
)

onMounted(async () => {
    loading.value = true
    try {
        await fetchEvents()
        // Fetch summaries for all events in parallel
        const results = await Promise.all(
            events.value.map(async (event) => {
                const summary = await fetchEventSalesSummary(event.id)
                return { eventId: event.id, summary }
            })
        )
        for (const r of results) {
            summaries.value[r.eventId] = r.summary
        }
    } finally {
        loading.value = false
    }
})

function getEventStatus(event: LabelEvent, summary: EventSalesSummary | undefined): { label: string; cls: string } {
    if (!summary || summary.phases.length === 0) return { label: 'Not configured', cls: 'badge-draft' }
    const now = new Date()
    const eventDate = event.event_date ? new Date(event.event_date) : null
    if (eventDate && eventDate < now) return { label: 'Ended', cls: 'badge-archived' }
    if (summary.total_sold > 0) return { label: 'On sale', cls: 'badge-success' }
    return { label: 'Not yet started', cls: 'badge-warning' }
}

function formatCurrency(cents: number, currency: string) {
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

function formatEventDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    })
}

function goToEvent(eventId: string) {
    router.push(`/sales/${eventId}`)
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <div class="page-header">
            <div>
                <h1 class="page-title">Sales</h1>
                <p class="page-subtitle">Manage ticket sales for your events</p>
            </div>
        </div>

        <div v-if="loading || eventsLoading" class="loading-text">Loading events…</div>

        <template v-else-if="events.length === 0">
            <SyvoraEmptyState>
                No events found. Create events first in the Events module.
            </SyvoraEmptyState>
        </template>

        <template v-else>
            <SyvoraTabs
                v-model="activeTab"
                :tabs="[
                    { key: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
                    { key: 'past', label: 'Past', count: pastEvents.length },
                ]"
            />

            <SyvoraEmptyState v-if="displayedEvents.length === 0">
                {{ activeTab === 'upcoming' ? 'No upcoming events.' : 'No past events.' }}
            </SyvoraEmptyState>

            <div v-else class="events-list">
                <SyvoraCard v-for="event in displayedEvents" :key="event.id" class="event-row" @click="goToEvent(event.id)">
                <div class="event-row-body">
                    <div class="event-row-main">
                        <div class="event-row-header">
                            <h3 class="event-name">{{ event.title }}</h3>
                            <span
                                class="badge"
                                :class="getEventStatus(event, summaries[event.id]).cls"
                            >{{ getEventStatus(event, summaries[event.id]).label }}</span>
                        </div>
                        <span class="event-date">{{ formatEventDate(event.event_date) }}</span>
                        <span v-if="event.location" class="event-location">{{ event.location }}</span>
                    </div>

                    <div class="event-row-stats">
                        <div class="stat">
                            <span class="stat-value">{{ summaries[event.id]?.phases.length ?? 0 }}</span>
                            <span class="stat-label">Phases</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">
                                {{ summaries[event.id]?.total_sold ?? 0 }} / {{ summaries[event.id]?.phases.reduce((sum, p) => sum + p.quantity, 0) ?? 0 }}
                            </span>
                            <span class="stat-label">Tickets sold</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">{{ formatCurrency(summaries[event.id]?.total_revenue ?? 0, summaries[event.id]?.currency ?? 'chf') }}</span>
                            <span class="stat-label">Revenue</span>
                        </div>
                    </div>

                    <div class="event-row-action">
                        <SyvoraButton size="sm" @click.stop="goToEvent(event.id)">
                            {{ summaries[event.id]?.phases.length ? 'Configure Tickets' : 'Set up tickets' }}
                        </SyvoraButton>
                    </div>
                </div>
            </SyvoraCard>
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

.events-list { display: flex; flex-direction: column; gap: 0.75rem; }

.event-row { cursor: pointer; transition: box-shadow 0.2s; }
.event-row:hover { box-shadow: var(--shadow-card-hover); }

.event-row-body {
    display: flex; align-items: center; gap: 1.5rem;
}

.event-row-main {
    flex: 1; display: flex; flex-direction: column; gap: 0.25rem; min-width: 0;
}

.event-row-header {
    display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap;
}

.event-name {
    font-size: 1.0625rem; font-weight: 700; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.event-date { font-size: 0.8125rem; color: var(--color-text-muted); }
.event-location { font-size: 0.8125rem; color: var(--color-text-muted); }

.event-row-stats {
    display: flex; gap: 1.5rem; flex-shrink: 0;
}

.stat { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; }
.stat-value { font-size: 1rem; font-weight: 700; }
.stat-label { font-size: 0.6875rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.event-row-action { flex-shrink: 0; }

/* Status badges */
.badge-draft { background: rgba(100, 100, 100, 0.12); color: rgba(12, 26, 39, 0.55); border: 1px solid rgba(100, 100, 100, 0.2); }
.badge-success { background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.22); }
.badge-warning { background: rgba(234, 179, 8, 0.1); color: #a16207; border: 1px solid rgba(234, 179, 8, 0.22); }
.badge-archived { background: rgba(120, 80, 0, 0.09); color: rgba(120, 80, 0, 0.75); border: 1px solid rgba(120, 80, 0, 0.18); }

.mobile .event-row-body { flex-direction: column; align-items: flex-start; gap: 1rem; }
.mobile .event-row-stats { width: 100%; justify-content: space-between; }
.mobile .event-row-action { width: 100%; }
</style>
