<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReleases, type Release, type Track } from '../composables/useReleases'
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const releaseId = computed(() => route.params.id as string)

const { releases, fetchReleases, deleteRelease } = useReleases()

const release = ref<Release | null>(null)
const loading = ref(true)
const activeTab = ref('overview')

const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'tracks', label: 'Tracks', count: release.value?.tracks?.length ?? 0 },
])

const sortedTracks = computed<Track[]>(() => {
    const ts = release.value?.tracks ?? []
    return ts.slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
})

onMounted(async () => {
    await reload()
})

async function reload() {
    loading.value = true
    if (!releases.value.length) {
        await fetchReleases()
    }
    release.value = releases.value.find(r => r.id === releaseId.value) ?? null
    if (!release.value) {
        // Cache miss — refetch and retry
        await fetchReleases()
        release.value = releases.value.find(r => r.id === releaseId.value) ?? null
    }
    loading.value = false
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    })
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function handleDelete() {
    if (!release.value) return
    if (!confirm(`Delete "${release.value.title}"?`)) return
    try {
        await deleteRelease(release.value.id)
        router.push('/releases')
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete release.')
    }
}
</script>

<template>
    <div class="page">
        <header class="detail-header">
            <button class="back-btn" @click="router.push('/releases')" aria-label="Back to releases">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                </svg>
            </button>
            <div class="title-block">
                <h1 class="title">{{ release?.title ?? '…' }}</h1>
                <p v-if="release" class="subtitle">{{ release.artist }}</p>
            </div>
            <div class="actions">
                <SyvoraButton
                    v-if="release"
                    @click="router.push(`/releases/${release.id}/edit`)"
                >Edit</SyvoraButton>
                <SyvoraButton
                    v-if="release"
                    variant="ghost"
                    class="btn-danger"
                    @click="handleDelete"
                >Delete</SyvoraButton>
            </div>
        </header>

        <SyvoraTabs v-if="release" v-model="activeTab" :tabs="tabs" />

        <div v-if="loading" class="loading">Loading…</div>

        <div v-else-if="!release">
            <SyvoraEmptyState
                title="Release not found"
                description="This release may have been deleted."
            />
        </div>

        <section v-else-if="activeTab === 'overview'" class="overview">
            <div class="overview-grid" :class="{ 'overview-grid--mobile': isMobile }">
                <div class="artwork-col">
                    <div class="artwork">
                        <img v-if="release.artwork_url" :src="release.artwork_url" :alt="release.title" />
                        <div v-else class="artwork-empty">No artwork</div>
                    </div>
                </div>
                <div class="meta-col">
                    <dl class="meta">
                        <dt>Type</dt><dd>{{ release.type }}</dd>
                        <dt>Artist</dt><dd>{{ release.artist }}</dd>
                        <dt>Release date</dt><dd>{{ formatDate(release.release_date) }}</dd>
                        <dt v-if="release.description">Description</dt>
                        <dd v-if="release.description" class="description">{{ release.description }}</dd>
                    </dl>
                    <p class="audit">
                        Created {{ formatAuditDate(release.created_at) }}
                        <span v-if="release.creator_name">by {{ release.creator_name }}</span>
                        · Updated {{ formatAuditDate(release.updated_at) }}
                        <span v-if="release.updater_name">by {{ release.updater_name }}</span>
                    </p>
                </div>
            </div>
        </section>

        <section v-else-if="activeTab === 'tracks'" class="tracks">
            <div v-if="sortedTracks.length" class="track-list">
                <div v-for="track in sortedTracks" :key="track.id" class="track-row">
                    <span class="track-num">{{ track.track_number ?? '—' }}</span>
                    <span class="track-title">{{ track.title }}</span>
                    <a v-if="track.file_url" :href="track.file_url" target="_blank" class="track-play"
                        title="Open audio">▶</a>
                    <span v-else class="track-no-file" title="No audio file">–</span>
                </div>
            </div>
            <SyvoraEmptyState
                v-else
                title="No tracks yet"
                description="Add tracks by editing the release."
            />
        </section>
    </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem; }

.detail-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}

.back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: rgba(0, 0, 0, 0.04);
    border: none;
    border-radius: 50%;
    color: var(--color-text-muted);
    cursor: pointer;
}
.back-btn:hover { background: rgba(0, 0, 0, 0.08); color: var(--color-text); }

.title-block { flex: 1; min-width: 0; }
.title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.subtitle { margin: 0.125rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }

.actions { display: flex; gap: 0.5rem; }
.btn-danger { color: rgb(220, 38, 38); }

.loading { padding: 2rem; text-align: center; color: var(--color-text-muted); }

.overview { margin-top: 1.5rem; }
.overview-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 2rem;
}
.overview-grid--mobile { grid-template-columns: 1fr; }

.artwork {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}
.artwork img { width: 100%; height: 100%; object-fit: cover; }
.artwork-empty { color: var(--color-text-muted); font-size: 0.875rem; }

.meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5rem 1rem;
    margin: 0;
}
.meta dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
}
.meta dd { margin: 0; color: var(--color-text); }
.description { white-space: pre-wrap; }

.audit {
    margin-top: 1.25rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.tracks { margin-top: 1.5rem; }
.track-list {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 0.75rem;
    overflow: hidden;
}
.track-row {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.track-row:last-child { border-bottom: none; }
.track-num { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.track-title { font-weight: 500; }
.track-play, .track-no-file {
    text-decoration: none;
    color: var(--color-text-muted);
    font-size: 1rem;
}
.track-play:hover { color: var(--color-text); }
</style>
