<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { useReleases, type Release, type ReleaseType, type Track } from '../composables/useReleases'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState
} from '@syvora/ui'

const {
    releases, loading, fetchReleases, createRelease, updateRelease, deleteRelease,
    uploadArtwork, addTrack, updateTrack, deleteTrack, uploadTrack, reorderTrack,
} = useReleases()

const showModal = ref(false)
const editingRelease = ref<Release | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({ title: '', type: 'album' as ReleaseType, artist: '', description: '', release_date: '' })
const artworkFile = ref<File | null>(null)
const artworkPreview = ref<string | null>(null)

const newTrackTitle = ref('')
const newTrackFile = ref<File | null>(null)
const trackSaving = ref(false)

const releaseTypes: { value: ReleaseType; label: string }[] = [
    { value: 'album', label: 'Album' },
    { value: 'ep', label: 'EP' },
    { value: 'single', label: 'Single' },
    { value: 'compilation', label: 'Compilation' },
]

// Sorted tracks for the currently editing release
const sortedTracks = computed(() =>
    (editingRelease.value?.tracks ?? []).slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
)

// Whether the current release type uses track ordering
const showOrdering = computed(() => editingRelease.value?.type === 'album' || editingRelease.value?.type === 'compilation')

onMounted(fetchReleases)

function openCreate() {
    editingRelease.value = null
    form.value = { title: '', type: 'album', artist: '', description: '', release_date: '' }
    artworkFile.value = null
    artworkPreview.value = null
    error.value = ''
    showModal.value = true
}

function openEdit(release: Release) {
    editingRelease.value = { ...release, tracks: release.tracks ? [...release.tracks] : [] }
    form.value = {
        title: release.title,
        type: release.type,
        artist: release.artist,
        description: release.description ?? '',
        release_date: release.release_date ?? '',
    }
    artworkFile.value = null
    artworkPreview.value = release.artwork_url ?? null
    error.value = ''
    newTrackTitle.value = ''
    newTrackFile.value = null
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingRelease.value = null
}

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    artworkFile.value = file
    artworkPreview.value = URL.createObjectURL(file)
}

function onTrackFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    newTrackFile.value = file
    if (!newTrackTitle.value) newTrackTitle.value = file.name.replace(/\.[^.]+$/, '')
}

function nextTrackNumber(): number {
    const tracks = editingRelease.value?.tracks ?? []
    if (!tracks.length) return 1
    const max = Math.max(...tracks.map(t => t.track_number ?? 0))
    return max + 1
}

async function saveRelease() {
    if (!form.value.title.trim() || !form.value.artist.trim()) {
        error.value = 'Title and artist are required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            title: form.value.title.trim(),
            type: form.value.type,
            artist: form.value.artist.trim(),
            description: form.value.description.trim() || null,
            release_date: form.value.release_date || null,
        }
        if (editingRelease.value) {
            let artwork_url = editingRelease.value.artwork_url
            if (artworkFile.value) artwork_url = await uploadArtwork(artworkFile.value, editingRelease.value.id)
            await updateRelease(editingRelease.value.id, { ...payload, artwork_url })
        } else {
            const r = await createRelease(payload)
            if (artworkFile.value) {
                const artwork_url = await uploadArtwork(artworkFile.value, r.id)
                await updateRelease(r.id, { artwork_url })
            }
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save release.'
    } finally {
        saving.value = false
    }
}

async function handleAddTrack() {
    if (!editingRelease.value || !newTrackTitle.value.trim()) return
    trackSaving.value = true
    error.value = ''
    try {
        const track = await addTrack(editingRelease.value.id, {
            title: newTrackTitle.value.trim(),
            track_number: nextTrackNumber(),
        })
        if (newTrackFile.value) {
            const fileUrl = await uploadTrack(newTrackFile.value, editingRelease.value.id, track.id)
            await supabase.from('tracks').update({ file_url: fileUrl }).eq('id', track.id)
            await fetchReleases()
        }
        newTrackTitle.value = ''
        newTrackFile.value = null
        syncEditingTracks()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to add track.'
    } finally {
        trackSaving.value = false
    }
}

async function handleReorder(track: Track, direction: 'up' | 'down') {
    if (!editingRelease.value) return
    await reorderTrack(track.id, direction, editingRelease.value.tracks ?? [])
    syncEditingTracks()
}

async function handleDeleteTrack(track: Track) {
    if (!confirm(`Delete track "${track.title}"?`)) return
    try {
        await deleteTrack(track.id)
        syncEditingTracks()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to delete track.'
    }
}

function syncEditingTracks() {
    const updated = releases.value.find(r => r.id === editingRelease.value?.id)
    if (updated) editingRelease.value = { ...updated }
}

async function handleDelete(release: Release) {
    if (!confirm(`Delete "${release.title}"? This will also delete all tracks.`)) return
    try {
        await deleteRelease(release.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete release.')
    }
}

function typeBadgeClass(type: ReleaseType) {
    const map: Record<ReleaseType, string> = { album: 'badge-success', ep: 'badge-warning', single: 'badge-claim', compilation: 'badge-deposit' }
    return map[type] ?? 'badge-success'
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Releases</h1>
                <p class="page-subtitle">Manage albums, EPs, singles, and compilations</p>
            </div>
            <SyvoraButton @click="openCreate">+ New Release</SyvoraButton>
        </div>

        <div v-if="loading" class="loading-text">Loading releases…</div>

        <SyvoraEmptyState v-else-if="releases.length === 0">
            No releases yet. Create your first one.
        </SyvoraEmptyState>

        <div v-else class="release-grid">
            <div v-for="release in releases" :key="release.id" class="release-card">
                <div class="release-artwork">
                    <img v-if="release.artwork_url" :src="release.artwork_url" :alt="release.title" />
                    <div v-else class="release-artwork-placeholder"><span>♪</span></div>
                </div>
                <div class="release-info">
                    <div class="release-meta">
                        <span class="badge" :class="typeBadgeClass(release.type)">{{ release.type.toUpperCase() }}</span>
                        <span class="release-date">{{ formatDate(release.release_date) }}</span>
                    </div>
                    <h3 class="release-title">{{ release.title }}</h3>
                    <p class="release-artist">{{ release.artist }}</p>
                    <p v-if="release.description" class="release-desc">{{ release.description }}</p>
                    <div v-if="release.tracks?.length" class="release-tracks-count">
                        {{ release.tracks.length }} track{{ release.tracks.length !== 1 ? 's' : '' }}
                    </div>
                    <div class="release-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="openEdit(release)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(release)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <SyvoraModal v-if="showModal" :title="editingRelease ? 'Edit Release' : 'New Release'" size="lg" @close="closeModal">
        <div class="modal-form">
            <!-- Artwork -->
            <div class="artwork-upload">
                <div class="artwork-preview" @click="($refs.artworkInput as HTMLInputElement).click()">
                    <img v-if="artworkPreview" :src="artworkPreview" alt="Artwork" />
                    <div v-else class="artwork-placeholder">
                        <span>+</span>
                        <small>Upload artwork</small>
                    </div>
                    <div class="artwork-overlay">Change artwork</div>
                </div>
                <input ref="artworkInput" type="file" accept="image/*" class="hidden-input" @change="onArtworkPick" />
            </div>

            <div class="form-row">
                <SyvoraFormField label="Title" for="r-title" class="flex-1">
                    <SyvoraInput id="r-title" v-model="form.title" placeholder="Release title" />
                </SyvoraFormField>
                <SyvoraFormField label="Type" for="r-type">
                    <select id="r-type" v-model="form.type" class="native-select">
                        <option v-for="t in releaseTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
                    </select>
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Artist" for="r-artist">
                <SyvoraInput id="r-artist" v-model="form.artist" placeholder="Artist name" />
            </SyvoraFormField>

            <SyvoraFormField label="Release Date" for="r-date">
                <SyvoraInput id="r-date" v-model="form.release_date" type="date" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="r-desc">
                <SyvoraTextarea id="r-desc" v-model="form.description" placeholder="Optional description…" :rows="2" />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>

            <!-- Tracks section — only shown when editing an existing release -->
            <div v-if="editingRelease" class="tracks-section">
                <div class="tracks-header">
                    <span class="tracks-label">Tracks</span>
                    <span v-if="showOrdering" class="tracks-hint">Use arrows to set track order</span>
                </div>

                <div v-if="sortedTracks.length" class="track-list">
                    <div v-for="(track, idx) in sortedTracks" :key="track.id" class="track-item">
                        <!-- Reorder arrows (albums & compilations) -->
                        <div v-if="showOrdering" class="track-reorder">
                            <button
                                class="reorder-btn"
                                :disabled="idx === 0"
                                title="Move up"
                                @click="handleReorder(track, 'up')"
                            >▲</button>
                            <button
                                class="reorder-btn"
                                :disabled="idx === sortedTracks.length - 1"
                                title="Move down"
                                @click="handleReorder(track, 'down')"
                            >▼</button>
                        </div>

                        <span class="track-num">{{ track.track_number ?? '—' }}</span>
                        <span class="track-title-text">{{ track.title }}</span>

                        <a v-if="track.file_url" :href="track.file_url" target="_blank" class="track-play" title="Play">▶</a>
                        <span v-else class="track-no-file" title="No audio file">–</span>

                        <button class="track-delete" title="Delete track" @click="handleDeleteTrack(track)">✕</button>
                    </div>
                </div>
                <p v-else class="placeholder">No tracks yet — add one below.</p>

                <!-- Add track form -->
                <div class="add-track">
                    <p class="add-track-label">Add track</p>

                    <SyvoraFormField label="Title" for="new-track-title">
                        <SyvoraInput
                            id="new-track-title"
                            v-model="newTrackTitle"
                            placeholder="Track title"
                            @keydown.enter="handleAddTrack"
                        />
                    </SyvoraFormField>

                    <SyvoraFormField label="Audio file" for="new-track-file">
                        <label class="file-pick-btn">
                            <input
                                id="new-track-file"
                                type="file"
                                accept="audio/*"
                                class="hidden-input"
                                @change="onTrackFilePick"
                            />
                            <span class="file-pick-icon">♪</span>
                            <span class="file-pick-text">{{ newTrackFile ? newTrackFile.name : 'Choose audio file (MP3, WAV, FLAC…)' }}</span>
                        </label>
                    </SyvoraFormField>

                    <SyvoraButton
                        size="sm"
                        :loading="trackSaving"
                        :disabled="!newTrackTitle.trim() || trackSaving"
                        @click="handleAddTrack"
                    >
                        {{ trackSaving ? 'Uploading…' : '+ Add Track' }}
                    </SyvoraButton>
                </div>
            </div>

            <p v-if="editingRelease === null" class="save-hint">
                You can add tracks after creating the release.
            </p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveRelease">
                {{ editingRelease ? 'Save Changes' : 'Create Release' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; }
.page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 2rem; gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }

.release-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }

.release-card {
    background: var(--color-surface); backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--color-border);
    border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow-card);
    transition: box-shadow 0.3s; display: flex; flex-direction: column;
}
.release-card:hover { box-shadow: var(--shadow-card-hover); }
.release-artwork { width: 100%; aspect-ratio: 1; overflow: hidden; flex-shrink: 0; }
.release-artwork img { width: 100%; height: 100%; object-fit: cover; }
.release-artwork-placeholder {
    width: 100%; height: 100%;
    background: linear-gradient(135deg, rgba(22,163,74,0.08), rgba(22,163,74,0.18));
    display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--color-accent);
}
.release-info { padding: 1.125rem; display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.release-meta { display: flex; align-items: center; gap: 0.625rem; }
.release-date { font-size: 0.8rem; color: var(--color-text-muted); }
.release-title { font-size: 1.0625rem; font-weight: 700; letter-spacing: -0.01em; margin: 0.125rem 0 0; }
.release-artist { font-size: 0.9rem; color: var(--color-text-muted); margin: 0; }
.release-desc {
    font-size: 0.85rem; color: var(--color-text-muted); margin: 0.25rem 0 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.release-tracks-count { font-size: 0.8125rem; color: var(--color-text-muted); }
.release-actions { display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; }

/* Modal */
.modal-form { display: flex; flex-direction: column; gap: 1rem; }
.artwork-upload { display: flex; justify-content: center; }
.artwork-preview {
    width: 140px; height: 140px; border-radius: 1rem; overflow: hidden;
    cursor: pointer; position: relative;
    background: rgba(22,163,74,0.08); border: 1.5px dashed rgba(22,163,74,0.3);
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
.native-select {
    width: 100%; padding: 0.75rem 1rem;
    background: rgba(255,255,255,0.58); border: 1px solid rgba(255,255,255,0.52);
    border-radius: var(--radius-sm); color: var(--color-text); font-size: 1rem; cursor: pointer;
}
.native-select:focus { outline: none; border-color: rgba(22,163,74,0.4); box-shadow: 0 0 0 3px rgba(22,163,74,0.1); }
.hidden-input { display: none; }
.save-hint { font-size: 0.8125rem; color: var(--color-text-muted); text-align: center; margin: 0; }

/* Tracks section */
.tracks-section {
    border-top: 1px solid var(--color-border-subtle);
    padding-top: 1rem;
    display: flex; flex-direction: column; gap: 0.875rem;
}
.tracks-header { display: flex; align-items: center; justify-content: space-between; }
.tracks-label { font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.tracks-hint { font-size: 0.75rem; color: var(--color-text-muted); }

.track-list { display: flex; flex-direction: column; gap: 0.3rem; }

.track-item {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255,255,255,0.4); border-radius: 0.625rem;
}
.track-reorder { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
.reorder-btn {
    background: none; border: none; cursor: pointer; padding: 0 0.1rem;
    font-size: 0.55rem; color: var(--color-text-muted); line-height: 1.4;
    transition: color 0.15s;
}
.reorder-btn:hover:not(:disabled) { color: var(--color-accent); }
.reorder-btn:disabled { opacity: 0.25; cursor: default; }

.track-num {
    min-width: 1.5rem; text-align: right;
    font-size: 0.8125rem; color: var(--color-text-muted); font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}
.track-title-text { flex: 1; font-size: 0.9rem; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-play { color: var(--color-accent); text-decoration: none; font-size: 0.8rem; flex-shrink: 0; }
.track-no-file { font-size: 0.75rem; color: var(--color-text-muted); flex-shrink: 0; }
.track-delete {
    background: none; border: none; color: var(--color-text-muted);
    cursor: pointer; font-size: 0.7rem; padding: 0.2rem 0.3rem;
    border-radius: 0.25rem; transition: color 0.15s, background 0.15s; flex-shrink: 0;
}
.track-delete:hover { color: var(--color-error); background: rgba(220,38,38,0.08); }

/* Add track */
.add-track {
    display: flex; flex-direction: column; gap: 0.75rem;
    padding: 0.875rem; background: rgba(255,255,255,0.3);
    border-radius: 0.875rem; border: 1px dashed rgba(0,0,0,0.1);
}
.add-track-label { font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); margin: 0; }

.file-pick-btn {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.625rem 1rem;
    background: rgba(255,255,255,0.5); border: 1px dashed rgba(0,0,0,0.15);
    border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s;
    width: 100%;
}
.file-pick-btn:hover { background: rgba(255,255,255,0.75); }
.file-pick-icon { font-size: 1rem; color: var(--color-accent); flex-shrink: 0; }
.file-pick-text { font-size: 0.8125rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

:deep(.btn-danger) { color: var(--color-error); }
</style>
