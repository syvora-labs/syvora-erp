<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArtists, type Artist, type ArtistShow } from '../composables/useArtists'
import { useIsMobile } from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const artistId = computed(() => route.params.id as string)

const { artists, fetchArtists, fetchShows } = useArtists()

const artist = ref<Artist | null>(null)
const shows = ref<ArtistShow[]>([])
const loading = ref(true)

onMounted(async () => {
    if (artists.value.length === 0) await fetchArtists()
    artist.value = artists.value.find(a => a.id === artistId.value) ?? null
    shows.value = await fetchShows(artistId.value)
    loading.value = false
})

const upcomingShows = computed(() =>
    shows.value
        .filter(s => new Date(s.show_date) >= new Date(new Date().toDateString()))
        .sort((a, b) => new Date(a.show_date).getTime() - new Date(b.show_date).getTime())
)

const pastShows = computed(() =>
    shows.value
        .filter(s => new Date(s.show_date) < new Date(new Date().toDateString()))
        .sort((a, b) => new Date(b.show_date).getTime() - new Date(a.show_date).getTime())
)

function getDayInfo(dateStr: string) {
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    return { dayMonth: `${day}.${month}.`, weekday }
}

function getTimezone(dateStr: string) {
    const date = new Date(dateStr)
    const tzAbbr = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()
    return tzAbbr ?? ''
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <button class="back-btn" @click="router.push(`/artists/${artistId}`)">← Back to Artist</button>

        <div v-if="loading" class="loading-text">Loading…</div>

        <template v-else-if="artist">
            <header class="schedule-header">
                <div class="artist-avatar">
                    <img v-if="artist.picture_url" :src="artist.picture_url" :alt="artist.name" />
                    <div v-else class="artist-avatar-placeholder">
                        {{ artist.name.charAt(0).toUpperCase() }}
                    </div>
                </div>
                <h1 class="artist-name">{{ artist.name }}</h1>
                <p v-if="artist.is_managed" class="artist-tagline">Managed by EB</p>
            </header>

            <main>
                <section v-if="upcomingShows.length > 0" class="tour-dates">
                    <h2>Upcoming Shows</h2>
                    <div class="event-list">
                        <div
                            v-for="show in upcomingShows"
                            :key="show.id"
                            class="event-row"
                        >
                            <div class="date-box">
                                <div class="day">{{ getDayInfo(show.show_date).dayMonth }}</div>
                                <div class="weekday">{{ getDayInfo(show.show_date).weekday }}</div>
                            </div>

                            <div class="event-card">
                                <div class="event-content">
                                    <div class="title">{{ show.show_name }}</div>
                                    <div v-if="show.slot_time" class="details">
                                        <span>{{ show.slot_time.slice(0, 5) }}</span>
                                    </div>
                                </div>
                                <div class="timezone">{{ getTimezone(show.show_date) }}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <section v-if="pastShows.length > 0" class="tour-dates past">
                    <h2>Past Shows</h2>
                    <div class="event-list">
                        <div
                            v-for="show in pastShows"
                            :key="show.id"
                            class="event-row"
                        >
                            <div class="date-box">
                                <div class="day">{{ getDayInfo(show.show_date).dayMonth }}</div>
                                <div class="weekday">{{ getDayInfo(show.show_date).weekday }}</div>
                            </div>

                            <div class="event-card">
                                <div class="event-content">
                                    <div class="title">{{ show.show_name }}</div>
                                    <div v-if="show.slot_time" class="details">
                                        <span>{{ show.slot_time.slice(0, 5) }}</span>
                                    </div>
                                </div>
                                <div class="timezone">{{ getTimezone(show.show_date) }}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <div v-if="upcomingShows.length === 0 && pastShows.length === 0" class="empty-state">
                    No shows scheduled yet.
                </div>
            </main>
        </template>

        <div v-else class="loading-text">Artist not found.</div>
    </div>
</template>

<style scoped>
.page {
    max-width: 550px;
    margin: 0 auto;
    padding: 2rem 1rem;
}

.back-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 1.5rem;
    transition: color 0.15s;
}

.back-btn:hover {
    color: var(--color-text);
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem;
}

.schedule-header {
    text-align: left;
    margin-bottom: 0.5rem;
}

.artist-avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid var(--color-border);
    margin-bottom: 1rem;
}

.artist-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.artist-avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-accent);
    background: var(--color-surface-raised, rgba(255, 255, 255, 0.04));
}

.artist-name {
    font-size: 1.8rem;
    font-weight: 800;
    margin: 0;
    color: var(--color-text);
}

.artist-tagline {
    font-size: 1rem;
    color: var(--color-text-muted);
    margin: 0.25rem 0;
}

.tour-dates {
    margin: 2rem 0;
    text-align: left;
}

.tour-dates h2 {
    margin-bottom: 1rem;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text);
}

.event-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0 1rem;
}

.event-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
}

.date-box {
    width: 50px;
    text-align: center;
    font-weight: bold;
    color: #0a3aff;
    flex-shrink: 0;
}

.date-box .day {
    font-size: 1rem;
    line-height: 1.2;
}

.date-box .weekday {
    font-size: 0.75rem;
    color: #0070f3;
}

.event-card {
    flex: 1;
    background-color: #00CB4C;
    color: #fff;
    border-radius: 12px;
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.event-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
}

.title {
    font-weight: bold;
}

.details {
    font-size: 0.875rem;
    color: #e0ffe8;
}

.timezone {
    font-size: 0.75rem;
    font-weight: 600;
    color: #e0ffe8;
    margin-left: 1rem;
}

.past .event-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
}

.past .date-box {
    color: var(--color-text-muted);
}

.past .timezone {
    color: var(--color-text-muted);
}

.empty-state {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem 0;
    font-size: 0.875rem;
}

@media (max-width: 480px) {
    .date-box {
        width: 40px;
    }

    .date-box .day {
        font-size: 0.875rem;
    }

    .date-box .weekday {
        font-size: 0.65rem;
    }

    .event-card {
        padding: 0.5rem 0.75rem;
        border-radius: 10px;
    }

    .event-content {
        gap: 0.2rem;
    }

    .title {
        font-size: 0.95rem;
    }

    .details {
        font-size: 0.75rem;
    }

    .timezone {
        font-size: 0.65rem;
        margin-left: 0.5rem;
    }

    .artist-avatar {
        width: 72px;
        height: 72px;
    }

    .artist-name {
        font-size: 1.5rem;
    }
}
</style>
