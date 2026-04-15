<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useReleases, type Release, type ReleaseType, type Track } from '../composables/useReleases'
import { useMandator } from '../composables/useMandator'
import { useContracts, type Contract } from '../composables/useContracts'
import { useArtists } from '../composables/useArtists'
import {
    SyvoraButton, SyvoraEmptyState
} from '@syvora/ui'

const {
    releases, loading, fetchReleases, deleteRelease,
} = useReleases()

const router = useRouter()
const { contractsEnabled } = useMandator()
const { artists: allArtists, fetchArtists: fetchAllArtists } = useArtists()
const { fetchContractsByRelease } = useContracts()
const releaseContracts = ref<Record<string, Contract[]>>({})

// ── Audio player ─────────────────────────────────────────────────────────────
const audioRef = ref<HTMLAudioElement | null>(null)
const playerTrack = ref<Track | null>(null)
const playerRelease = ref<Release | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const expandedReleaseId = ref<string | null>(null)

const playerQueue = computed(() => {
    if (!playerRelease.value) return []
    return (playerRelease.value.tracks ?? [])
        .filter(t => t.file_url)
        .slice()
        .sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
})

const playerTrackIdx = computed(() =>
    playerQueue.value.findIndex(t => t.id === playerTrack.value?.id)
)

const hasPrev = computed(() => playerTrackIdx.value > 0)
const hasNext = computed(() => playerTrackIdx.value < playerQueue.value.length - 1)

const progressPct = computed(() =>
    duration.value ? (currentTime.value / duration.value) * 100 : 0
)

function sortedReleaseTracks(release: Release) {
    return (release.tracks ?? [])
        .slice()
        .sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
}

function releaseHasAudio(release: Release) {
    return (release.tracks ?? []).some(t => t.file_url)
}

function isReleaseActive(release: Release) {
    return playerRelease.value?.id === release.id
}

function isTrackActive(track: Track) {
    return playerTrack.value?.id === track.id
}

function playTrack(track: Track, release: Release) {
    if (!track.file_url) return
    if (isTrackActive(track)) { togglePlayPause(); return }
    playerTrack.value = track
    playerRelease.value = release
    if (audioRef.value) {
        audioRef.value.src = track.file_url
        audioRef.value.play()
    }
}

function playRelease(release: Release) {
    if (!releaseHasAudio(release)) return
    if (isReleaseActive(release)) { togglePlayPause(); return }
    const first = sortedReleaseTracks(release).find(t => t.file_url)
    if (first) playTrack(first, release)
}

function togglePlayPause() {
    if (!audioRef.value) return
    isPlaying.value ? audioRef.value.pause() : audioRef.value.play()
}

function playPrev() {
    const prev = playerQueue.value[playerTrackIdx.value - 1]
    if (prev && playerRelease.value) playTrack(prev, playerRelease.value)
}

function playNext() {
    const next = playerQueue.value[playerTrackIdx.value + 1]
    if (next && playerRelease.value) playTrack(next, playerRelease.value)
}

function onTimeUpdate() {
    if (audioRef.value) currentTime.value = audioRef.value.currentTime
}

function onLoadedMetadata() {
    if (audioRef.value) { duration.value = audioRef.value.duration; currentTime.value = 0 }
}

function onEnded() {
    if (hasNext.value) { playNext() } else { isPlaying.value = false; currentTime.value = 0 }
}

function onSeek(e: Event) {
    const val = +(e.target as HTMLInputElement).value
    if (audioRef.value) audioRef.value.currentTime = val
    currentTime.value = val
}

function formatTime(s: number) {
    if (!isFinite(s) || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
}

async function toggleExpand(releaseId: string) {
    expandedReleaseId.value = expandedReleaseId.value === releaseId ? null : releaseId
    if (expandedReleaseId.value && contractsEnabled.value && !releaseContracts.value[releaseId]) {
        try {
            releaseContracts.value[releaseId] = await fetchContractsByRelease(releaseId)
        } catch {
            // Silently ignore — contracts are supplementary info
        }
    }
}

function closePlayer() {
    if (audioRef.value) { audioRef.value.pause(); audioRef.value.src = '' }
    playerTrack.value = null
    playerRelease.value = null
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
    fetchReleases()
    fetchAllArtists()
})

function resolveArtistId(release: Release): string | null {
    const match = allArtists.value.find(
        a => a.name.toLowerCase() === release.artist.toLowerCase()
    )
    return match?.id ?? null
}

function createContractFromRelease(release: Release) {
    const artistId = resolveArtistId(release)
    const query: Record<string, string> = {
        releaseId: release.id,
        releaseTitle: release.title,
        releaseArtist: release.artist,
    }
    if (artistId) query.artistId = artistId
    router.push({ path: '/contracts', query })
}

async function handleDelete(release: Release) {
    if (!confirm(`Delete "${release.title}"? This will also delete all tracks.`)) return
    try {
        await deleteRelease(release.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete release.')
    }
}

function contractStatusClass(status: string): string {
    const map: Record<string, string> = {
        draft: 'badge-deposit', open: 'badge-warning',
        partially_signed: 'badge-claim', fully_signed: 'badge-success',
        voided: 'badge-disabled',
    }
    return map[status] ?? 'badge-deposit'
}

function typeBadgeClass(type: ReleaseType) {
    const map: Record<ReleaseType, string> = {
        album: 'badge-success', ep: 'badge-warning', single: 'badge-claim', compilation: 'badge-deposit',
    }
    return map[type] ?? 'badge-success'
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
    <div class="page" :class="{ 'has-player': playerTrack }">
        <div class="page-header">
            <div>
                <h1 class="page-title">Releases</h1>
                <p class="page-subtitle">Manage albums, EPs, singles, and compilations</p>
            </div>
            <SyvoraButton @click="router.push('/releases/new')">+ New Release</SyvoraButton>
        </div>

        <div v-if="loading" class="loading-text">Loading releases…</div>

        <SyvoraEmptyState v-else-if="releases.length === 0">
            No releases yet. Create your first one.
        </SyvoraEmptyState>

        <div v-else class="release-grid">
            <div
                v-for="release in releases"
                :key="release.id"
                class="release-card"
                :class="{ 'is-active': isReleaseActive(release) }"
                style="cursor: pointer;"
                @click="router.push(`/releases/${release.id}`)"
            >
                <!-- Artwork + play overlay -->
                <div
                    class="release-artwork"
                    :class="{ clickable: releaseHasAudio(release) }"
                    @click="playRelease(release)"
                >
                    <img v-if="release.artwork_url" :src="release.artwork_url" :alt="release.title" />
                    <div v-else class="release-artwork-placeholder"><span>♪</span></div>

                    <div v-if="releaseHasAudio(release)" class="play-overlay">
                        <div class="play-circle">
                            <span v-if="isReleaseActive(release) && isPlaying" class="play-icon">⏸</span>
                            <span v-else class="play-icon">▶</span>
                        </div>
                    </div>

                    <div v-if="isReleaseActive(release)" class="now-playing-dot" :class="{ pulsing: isPlaying }" />
                </div>

                <div class="release-info">
                    <div class="release-meta">
                        <span class="badge" :class="typeBadgeClass(release.type)">{{ release.type.toUpperCase() }}</span>
                        <span class="release-date">{{ formatDate(release.release_date) }}</span>
                    </div>
                    <h3 class="release-title">{{ release.title }}</h3>
                    <p class="release-artist">{{ release.artist }}</p>
                    <p v-if="release.description" class="release-desc">{{ release.description }}</p>

                    <div class="release-audit">
                        <span>Created by {{ release.creator_name ?? 'Unknown' }} · {{ formatAuditDate(release.created_at) }}</span>
                        <span v-if="release.updater_name"> · Updated by {{ release.updater_name }} · {{ formatAuditDate(release.updated_at) }}</span>
                    </div>

                    <!-- Track count toggle -->
                    <button
                        v-if="release.tracks?.length"
                        class="tracks-toggle"
                        :class="{ expanded: expandedReleaseId === release.id }"
                        @click.stop="toggleExpand(release.id)"
                    >
                        <span>{{ release.tracks.length }} track{{ release.tracks.length !== 1 ? 's' : '' }}</span>
                        <span class="toggle-chevron">▾</span>
                    </button>

                    <!-- Inline tracklist -->
                    <div v-if="expandedReleaseId === release.id" class="inline-tracks">
                        <div
                            v-for="track in sortedReleaseTracks(release)"
                            :key="track.id"
                            class="inline-track"
                            :class="{
                                'track-active': isTrackActive(track),
                                'track-playing': isTrackActive(track) && isPlaying,
                            }"
                            @click.stop="playTrack(track, release)"
                        >
                            <button
                                class="inline-play-btn"
                                :class="{ 'has-audio': !!track.file_url }"
                                :disabled="!track.file_url"
                                :title="track.file_url ? (isTrackActive(track) && isPlaying ? 'Pause' : 'Play') : 'No audio'"
                            >
                                <span v-if="isTrackActive(track) && isPlaying">⏸</span>
                                <span v-else-if="track.file_url">▶</span>
                                <span v-else class="no-audio-dash">—</span>
                            </button>
                            <span v-if="track.track_number" class="inline-num">{{ track.track_number }}</span>
                            <span class="inline-title">{{ track.title }}</span>
                        </div>
                    </div>

                    <div v-if="expandedReleaseId === release.id && contractsEnabled && releaseContracts[release.id]?.length" class="inline-contracts">
                        <span class="contracts-label">Contracts</span>
                        <div v-for="c in releaseContracts[release.id]" :key="c.id" class="contract-mini">
                            <span class="badge" :class="contractStatusClass(c.status)">{{ c.status.replace(/_/g, ' ') }}</span>
                            <span class="contract-mini-title">{{ c.title }}</span>
                            <span class="contract-mini-progress">{{ c.signature_count }}/{{ c.signatory_count }} signed</span>
                            <RouterLink to="/contracts" class="contract-mini-link">View</RouterLink>
                        </div>
                    </div>

                    <div class="release-actions">
                        <SyvoraButton v-if="contractsEnabled" variant="ghost" size="sm" @click.stop="createContractFromRelease(release)">Contract</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" @click.stop="router.push(`/releases/${release.id}/edit`)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click.stop="handleDelete(release)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Hidden audio element -->
    <audio
        ref="audioRef"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @ended="onEnded"
        @play="isPlaying = true"
        @pause="isPlaying = false"
    />

    <!-- Player bar -->
    <Transition name="player-slide">
        <div v-if="playerTrack" class="player-bar">
            <div class="player-left">
                <div class="player-thumb">
                    <img v-if="playerRelease?.artwork_url" :src="playerRelease.artwork_url" alt="" />
                    <div v-else class="player-thumb-placeholder">♪</div>
                </div>
                <div class="player-info">
                    <span class="player-track-name">{{ playerTrack.title }}</span>
                    <span class="player-release-name">{{ playerRelease?.artist }} · {{ playerRelease?.title }}</span>
                </div>
            </div>

            <div class="player-center">
                <div class="player-controls">
                    <button class="ctrl-btn" :disabled="!hasPrev" title="Previous" @click="playPrev">⏮</button>
                    <button class="ctrl-btn ctrl-play" :title="isPlaying ? 'Pause' : 'Play'" @click="togglePlayPause">
                        <span v-if="isPlaying">⏸</span>
                        <span v-else>▶</span>
                    </button>
                    <button class="ctrl-btn" :disabled="!hasNext" title="Next" @click="playNext">⏭</button>
                </div>
                <div class="player-progress">
                    <span class="player-time">{{ formatTime(currentTime) }}</span>
                    <input
                        type="range"
                        class="progress-range"
                        :max="duration || 100"
                        :value="currentTime"
                        step="0.1"
                        :style="{ background: `linear-gradient(to right, var(--color-accent) ${progressPct}%, rgba(0,0,0,0.12) ${progressPct}%)` }"
                        @input="onSeek"
                    />
                    <span class="player-time">{{ formatTime(duration) }}</span>
                </div>
            </div>

            <button class="player-close" title="Close player" @click="closePlayer">✕</button>
        </div>
    </Transition>

</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; transition: padding-bottom 0.3s; }
.page.has-player { padding-bottom: 88px; }
.page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 2rem; gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }

/* ── Grid ─────────────────────────────────────────────────────────────────── */
.release-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }

.release-card {
    background: var(--color-surface); backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--color-border);
    border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow-card);
    transition: box-shadow 0.3s, border-color 0.3s; display: flex; flex-direction: column;
}
.release-card:hover { box-shadow: var(--shadow-card-hover); }
.release-card.is-active { border-color: rgba(115, 195, 254, 0.4); }

/* ── Artwork ──────────────────────────────────────────────────────────────── */
.release-artwork {
    width: 100%; aspect-ratio: 1; overflow: hidden; flex-shrink: 0;
    position: relative;
}
.release-artwork.clickable { cursor: pointer; }
.release-artwork img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
.release-artwork.clickable:hover img { transform: scale(1.04); }
.release-artwork-placeholder {
    width: 100%; height: 100%;
    background: linear-gradient(135deg, rgba(115,195,254,0.08), rgba(115,195,254,0.18));
    display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--color-accent);
}

.play-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.25);
    opacity: 0; transition: opacity 0.2s;
}
.release-artwork.clickable:hover .play-overlay,
.release-card.is-active .play-overlay { opacity: 1; }

.play-circle {
    width: 48px; height: 48px; border-radius: 50%;
    background: rgba(255,255,255,0.95);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    transform: scale(0.9); transition: transform 0.15s;
}
.release-artwork.clickable:hover .play-circle { transform: scale(1); }
.play-icon { font-size: 1rem; color: var(--color-accent); line-height: 1; margin-left: 2px; }

.now-playing-dot {
    position: absolute; top: 8px; right: 8px;
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 0 rgba(115,195,254,0.4);
}
.now-playing-dot.pulsing {
    animation: pulse-ring 1.8s ease-out infinite;
}
@keyframes pulse-ring {
    0%   { box-shadow: 0 0 0 0   rgba(115,195,254,0.5); }
    70%  { box-shadow: 0 0 0 8px rgba(115,195,254,0); }
    100% { box-shadow: 0 0 0 0   rgba(115,195,254,0); }
}

/* ── Info ─────────────────────────────────────────────────────────────────── */
.release-info { padding: 1.125rem; display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.release-meta { display: flex; align-items: center; gap: 0.625rem; }
.release-date { font-size: 0.8rem; color: var(--color-text-muted); }
.release-title { font-size: 1.0625rem; font-weight: 700; letter-spacing: -0.01em; margin: 0.125rem 0 0; }
.release-artist { font-size: 0.9rem; color: var(--color-text-muted); margin: 0; }
.release-desc {
    font-size: 0.85rem; color: var(--color-text-muted); margin: 0.25rem 0 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.release-audit {
    font-size: 0.72rem; color: var(--color-text-muted);
    opacity: 0.7; margin-top: 0.125rem;
}
.release-actions { display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; }

/* ── Track toggle button ──────────────────────────────────────────────────── */
.tracks-toggle {
    display: flex; align-items: center; gap: 0.375rem;
    background: none; border: none; cursor: pointer; padding: 0.25rem 0;
    font-size: 0.8125rem; color: var(--color-text-muted);
    transition: color 0.15s; text-align: left;
}
.tracks-toggle:hover { color: var(--color-text); }
.toggle-chevron {
    font-size: 0.7rem; transition: transform 0.2s; display: inline-block;
}
.tracks-toggle.expanded .toggle-chevron { transform: rotate(180deg); }

/* ── Inline tracklist ─────────────────────────────────────────────────────── */
.inline-tracks {
    display: flex; flex-direction: column; gap: 1px;
    margin: 0.25rem 0;
    border-radius: 0.5rem; overflow: hidden;
}
.inline-track {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.35);
    cursor: pointer; transition: background 0.15s;
    border-radius: 0.375rem;
}
.inline-track:hover { background: rgba(255,255,255,0.6); }
.inline-track.track-active { background: rgba(115,195,254,0.08); }
.inline-track.track-playing { background: rgba(115,195,254,0.12); }

.inline-play-btn {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    background: none; border: 1.5px solid transparent;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--color-text-muted);
    font-size: 0.6rem; transition: color 0.15s, border-color 0.15s, background 0.15s;
    padding: 0;
}
.inline-play-btn.has-audio { border-color: rgba(0,0,0,0.15); }
.inline-play-btn.has-audio:hover { color: var(--color-accent); border-color: var(--color-accent); background: rgba(115,195,254,0.08); }
.inline-track.track-active .inline-play-btn { color: var(--color-accent); border-color: var(--color-accent); }
.inline-play-btn:disabled { cursor: default; opacity: 0.4; }
.no-audio-dash { font-size: 0.75rem; }

.inline-num {
    min-width: 1.25rem; text-align: right; flex-shrink: 0;
    font-size: 0.75rem; color: var(--color-text-muted); font-variant-numeric: tabular-nums;
}
.inline-title {
    flex: 1; font-size: 0.85rem; font-weight: 500;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.inline-track.track-active .inline-title { color: var(--color-accent); }

/* ── Inline contracts ─────────────────────────────────────────────────────── */
.inline-contracts {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
}

.contracts-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
}

.contract-mini {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0;
    font-size: 0.8125rem;
}

.contract-mini-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.contract-mini-progress {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    flex-shrink: 0;
}

.contract-mini-link {
    color: var(--color-accent);
    text-decoration: none;
    font-size: 0.75rem;
    flex-shrink: 0;
}

.contract-mini-link:hover {
    text-decoration: underline;
}

/* ── Player bar ───────────────────────────────────────────────────────────── */
.player-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
    height: 72px;
    display: flex; align-items: center; gap: 1rem;
    padding: 0 1.5rem;
    background: rgba(255,255,255,0.88);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -4px 24px rgba(0,0,0,0.07);
}

.player-left {
    display: flex; align-items: center; gap: 0.75rem;
    min-width: 0; flex: 0 0 220px;
}
.player-thumb {
    width: 44px; height: 44px; border-radius: 0.375rem; flex-shrink: 0;
    overflow: hidden; background: rgba(115,195,254,0.12);
    display: flex; align-items: center; justify-content: center;
}
.player-thumb img { width: 100%; height: 100%; object-fit: cover; }
.player-thumb-placeholder { font-size: 1.25rem; color: var(--color-accent); }
.player-info { min-width: 0; }
.player-track-name {
    display: block; font-size: 0.875rem; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.player-release-name {
    display: block; font-size: 0.75rem; color: var(--color-text-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.player-center {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.375rem;
    min-width: 0;
}
.player-controls { display: flex; align-items: center; gap: 0.5rem; }

.ctrl-btn {
    background: none; border: none; cursor: pointer;
    font-size: 1rem; color: var(--color-text-muted);
    padding: 0.25rem; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s, background 0.15s;
    width: 30px; height: 30px;
}
.ctrl-btn:hover:not(:disabled) { color: var(--color-text); background: rgba(0,0,0,0.06); }
.ctrl-btn:disabled { opacity: 0.3; cursor: default; }
.ctrl-play {
    width: 36px; height: 36px;
    background: var(--color-accent); color: #fff !important;
    font-size: 0.875rem; border-radius: 50%;
    box-shadow: 0 2px 8px rgba(115,195,254,0.35);
}
.ctrl-play:hover { background: color-mix(in srgb, var(--color-accent) 85%, black) !important; }

.player-progress {
    display: flex; align-items: center; gap: 0.5rem;
    width: 100%; max-width: 480px;
}
.player-time { font-size: 0.7rem; color: var(--color-text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }

.progress-range {
    -webkit-appearance: none; appearance: none;
    flex: 1; height: 4px; border-radius: 2px; cursor: pointer; outline: none;
    border: none;
}
.progress-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--color-accent); cursor: pointer;
    box-shadow: 0 1px 4px rgba(115,195,254,0.4);
    transition: transform 0.1s;
}
.progress-range:hover::-webkit-slider-thumb { transform: scale(1.25); }
.progress-range::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 50%; border: none;
    background: var(--color-accent); cursor: pointer;
}

.player-close {
    background: none; border: none; cursor: pointer;
    font-size: 0.75rem; color: var(--color-text-muted);
    padding: 0.375rem; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
}
.player-close:hover { color: var(--color-text); background: rgba(0,0,0,0.06); }

/* Player slide transition */
.player-slide-enter-active,
.player-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.player-slide-enter-from,
.player-slide-leave-to { transform: translateY(100%); opacity: 0; }

:deep(.btn-danger) { color: var(--color-error); }
</style>
