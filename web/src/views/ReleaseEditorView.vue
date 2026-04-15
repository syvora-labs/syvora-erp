<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReleases, type Release, type ReleaseType, type Track } from '../composables/useReleases'
import { useDirtyGuard } from '../composables/useDirtyGuard'
import {
    SyvoraEditorPage, SyvoraButton, SyvoraFormField, SyvoraInput, SyvoraTextarea,
    type EditorSection,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const {
    releases, fetchReleases, createRelease, updateRelease, uploadArtwork,
    addTrack, deleteTrack, reorderTrack, uploadTrack, updateTrack,
} = useReleases()

const releaseId = ref<string | null>((route.params.id as string | undefined) ?? null)
const isNew = computed(() => !releaseId.value)

const releaseTypes: { value: ReleaseType; label: string }[] = [
    { value: 'album', label: 'Album' },
    { value: 'ep', label: 'EP' },
    { value: 'single', label: 'Single' },
    { value: 'compilation', label: 'Compilation' },
]

interface ReleaseForm {
    title: string
    type: ReleaseType
    artist: string
    description: string
    release_date: string
    artwork_url: string | null
}

function emptyForm(): ReleaseForm {
    return { title: '', type: 'single', artist: '', description: '', release_date: '', artwork_url: null }
}

const form = ref<ReleaseForm>(emptyForm())
const lastSaved = ref<ReleaseForm>(emptyForm())
const pendingArtwork = ref<File | null>(null)
const artworkPreview = ref<string | null>(null)
const artworkInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const error = ref('')

const newTrackTitle = ref('')
const newTrackFile = ref<File | null>(null)
const trackSaving = ref(false)

const currentRelease = computed<Release | null>(() => {
    if (!releaseId.value) return null
    return releases.value.find(r => r.id === releaseId.value) ?? null
})

const sortedTracks = computed<Track[]>(() => {
    const ts = currentRelease.value?.tracks ?? []
    return ts.slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
})

const sections = computed<EditorSection[]>(() => {
    const base: EditorSection[] = [
        { id: 'basics', label: 'Basics' },
        { id: 'artwork', label: 'Artwork' },
        { id: 'description', label: 'Description' },
    ]
    if (!isNew.value) base.splice(2, 0, { id: 'tracks', label: 'Tracks' })
    return base
})

const dirty = computed(
    () => JSON.stringify(form.value) !== JSON.stringify(lastSaved.value) || pendingArtwork.value !== null
)
const canSave = computed(() => form.value.title.trim().length > 0 && dirty.value && !saving.value)

const { confirmDiscard } = useDirtyGuard(dirty)

onMounted(async () => {
    if (!releases.value.length) await fetchReleases()
    if (releaseId.value) loadFromCache()
})

function loadFromCache() {
    const r = currentRelease.value
    if (!r) {
        error.value = 'Release not found.'
        return
    }
    form.value = {
        title: r.title,
        type: r.type,
        artist: r.artist,
        description: r.description ?? '',
        release_date: r.release_date ?? '',
        artwork_url: r.artwork_url,
    }
    artworkPreview.value = r.artwork_url
    lastSaved.value = JSON.parse(JSON.stringify(form.value))
}

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    pendingArtwork.value = file
    const reader = new FileReader()
    reader.onload = () => { artworkPreview.value = reader.result as string }
    reader.readAsDataURL(file)
}

function buildPayload() {
    return {
        title: form.value.title.trim(),
        type: form.value.type,
        artist: form.value.artist.trim(),
        description: form.value.description.trim() || null,
        release_date: form.value.release_date || null,
        artwork_url: form.value.artwork_url,
    }
}

async function handleSave() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        let workingId = releaseId.value
        const isFirstSave = !workingId
        if (workingId) {
            await updateRelease(workingId, buildPayload())
        } else {
            const created = await createRelease(buildPayload())
            workingId = created.id
        }

        if (pendingArtwork.value && workingId) {
            const url = await uploadArtwork(pendingArtwork.value, workingId)
            await updateRelease(workingId, { artwork_url: url })
            form.value.artwork_url = url
            artworkPreview.value = url
            pendingArtwork.value = null
        }

        lastSaved.value = JSON.parse(JSON.stringify(form.value))

        if (isFirstSave && workingId) {
            // Replace URL so Tracks section appears and back nav doesn't return to /releases/new
            releaseId.value = workingId
            await router.replace(`/releases/${workingId}/edit`)
        }
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save release.'
    } finally {
        saving.value = false
    }
}

function handleCancel() {
    if (!confirmDiscard()) return
    router.back()
}

function onTrackFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    newTrackFile.value = file ?? null
}

async function handleAddTrack() {
    if (!releaseId.value) return
    const title = newTrackTitle.value.trim()
    if (!title) return
    trackSaving.value = true
    try {
        const nextNumber = (sortedTracks.value[sortedTracks.value.length - 1]?.track_number ?? 0) + 1
        const created = await addTrack(releaseId.value, { title, track_number: nextNumber })
        if (newTrackFile.value) {
            const url = await uploadTrack(newTrackFile.value, releaseId.value, created.id)
            await updateTrack(created.id, { file_url: url })
        }
        newTrackTitle.value = ''
        newTrackFile.value = null
        await fetchReleases()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to add track.'
    } finally {
        trackSaving.value = false
    }
}

async function handleReorder(track: Track, direction: 'up' | 'down') {
    try {
        await reorderTrack(track.id, direction, sortedTracks.value)
    } catch (e: any) {
        error.value = e.message ?? 'Failed to reorder.'
    }
}

async function handleDeleteTrack(track: Track) {
    if (!confirm(`Delete track "${track.title}"?`)) return
    try {
        await deleteTrack(track.id)
    } catch (e: any) {
        error.value = e.message ?? 'Failed to delete track.'
    }
}
</script>

<template>
    <SyvoraEditorPage
        :title="isNew ? 'New Release' : 'Edit Release'"
        :subtitle="form.title || undefined"
        :sections="sections"
        :saving="saving"
        :can-save="canSave"
        @save="handleSave"
        @cancel="handleCancel"
    >
        <template #basics>
            <div class="form-row">
                <SyvoraFormField label="Title" for="r-title" class="flex-1">
                    <SyvoraInput id="r-title" v-model="form.title" placeholder="Release title" />
                </SyvoraFormField>
                <SyvoraFormField label="Type" for="r-type">
                    <select id="r-type" v-model="form.type" class="native-select">
                        <option v-for="t in releaseTypes" :key="t.value" :value="t.value">
                            {{ t.label }}
                        </option>
                    </select>
                </SyvoraFormField>
            </div>
            <SyvoraFormField label="Artist" for="r-artist">
                <SyvoraInput id="r-artist" v-model="form.artist" placeholder="Artist name" />
            </SyvoraFormField>
            <SyvoraFormField label="Release Date" for="r-date">
                <SyvoraInput id="r-date" v-model="form.release_date" type="date" />
            </SyvoraFormField>
        </template>

        <template #artwork>
            <div class="artwork-upload">
                <div class="artwork-preview" @click="artworkInput?.click()">
                    <img v-if="artworkPreview" :src="artworkPreview" alt="Artwork" />
                    <div v-else class="artwork-placeholder">
                        <span>+</span>
                        <small>Upload artwork</small>
                    </div>
                    <div class="artwork-overlay">Change artwork</div>
                </div>
                <input ref="artworkInput" type="file" accept="image/*"
                    class="hidden-input" @change="onArtworkPick" />
            </div>
        </template>

        <template v-if="!isNew" #tracks>
            <div class="tracks-section">
                <div class="tracks-header">
                    <span class="tracks-label">Tracks</span>
                </div>
                <div v-if="sortedTracks.length" class="track-list">
                    <div v-for="(track, idx) in sortedTracks" :key="track.id" class="track-item">
                        <div class="track-reorder">
                            <button class="reorder-btn" :disabled="idx === 0" title="Move up"
                                @click="handleReorder(track, 'up')">▲</button>
                            <button class="reorder-btn"
                                :disabled="idx === sortedTracks.length - 1"
                                title="Move down" @click="handleReorder(track, 'down')">▼</button>
                        </div>
                        <span class="track-num">{{ track.track_number ?? '—' }}</span>
                        <span class="track-title-text">{{ track.title }}</span>
                        <a v-if="track.file_url" :href="track.file_url" target="_blank"
                            class="track-play" title="Open audio">▶</a>
                        <span v-else class="track-no-file" title="No audio file">–</span>
                        <button class="track-delete" title="Delete track"
                            @click="handleDeleteTrack(track)">✕</button>
                    </div>
                </div>
                <p v-else class="placeholder">No tracks yet — add one below.</p>

                <div class="add-track">
                    <p class="add-track-label">Add track</p>
                    <SyvoraFormField label="Title" for="new-track-title">
                        <SyvoraInput id="new-track-title" v-model="newTrackTitle"
                            placeholder="Track title" @keydown.enter="handleAddTrack" />
                    </SyvoraFormField>
                    <SyvoraFormField label="Audio file" for="new-track-file">
                        <label class="file-pick-btn">
                            <input id="new-track-file" type="file" accept="audio/*"
                                class="hidden-input" @change="onTrackFilePick" />
                            <span class="file-pick-icon">♪</span>
                            <span class="file-pick-text">
                                {{ newTrackFile ? newTrackFile.name : 'Choose audio file (MP3, WAV, FLAC...)' }}
                            </span>
                        </label>
                    </SyvoraFormField>
                    <SyvoraButton size="sm" :loading="trackSaving"
                        :disabled="!newTrackTitle.trim() || trackSaving" @click="handleAddTrack">
                        {{ trackSaving ? 'Uploading...' : '+ Add Track' }}
                    </SyvoraButton>
                </div>
            </div>
        </template>

        <template #description>
            <SyvoraFormField label="Description" for="r-desc">
                <SyvoraTextarea id="r-desc" v-model="form.description"
                    placeholder="Optional description..." :rows="16" />
            </SyvoraFormField>
            <p v-if="isNew" class="save-hint">
                You can add tracks after saving the release.
            </p>
        </template>
    </SyvoraEditorPage>

    <p v-if="error" class="error-msg">{{ error }}</p>
</template>

<style scoped>
.form-row { display: flex; gap: 1rem; }
.flex-1 { flex: 1; }

.native-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0.5rem;
    background: #fff;
    font-size: 0.875rem;
    color: var(--color-text);
}

.artwork-upload {
    display: flex;
    justify-content: center;
}
.artwork-preview {
    position: relative;
    width: 320px;
    height: 320px;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    cursor: pointer;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}
.artwork-preview img { width: 100%; height: 100%; object-fit: cover; }
.artwork-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-muted);
}
.artwork-placeholder span { font-size: 2rem; line-height: 1; }
.artwork-placeholder small { font-size: 0.75rem; }
.artwork-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    font-size: 0.875rem;
}
.artwork-preview:hover .artwork-overlay { opacity: 1; }
.hidden-input { display: none; }

.tracks-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.tracks-header { display: flex; align-items: baseline; gap: 0.5rem; }
.tracks-label { font-weight: 600; }

.track-list {
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 0.5rem;
    overflow: hidden;
}
.track-item {
    display: grid;
    grid-template-columns: auto 2.5rem 1fr auto auto;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.track-item:last-child { border-bottom: none; }
.track-reorder { display: flex; flex-direction: column; gap: 0.125rem; }
.reorder-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.625rem;
    line-height: 1;
    padding: 0;
}
.reorder-btn:disabled { opacity: 0.3; cursor: default; }
.track-num { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.track-title-text { font-weight: 500; }
.track-play, .track-no-file { text-decoration: none; color: var(--color-text-muted); }
.track-play:hover { color: var(--color-text); }
.track-delete {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
}
.track-delete:hover { color: rgb(220, 38, 38); }

.placeholder { color: var(--color-text-muted); font-size: 0.875rem; padding: 0.5rem 0; }

.add-track {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.5rem;
}
.add-track-label { margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; }

.file-pick-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    border: 1px dashed rgba(0, 0, 0, 0.16);
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}
.file-pick-icon { font-size: 1rem; }

.save-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
}

.error-msg {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.625rem 1rem;
    background: rgba(220, 38, 38, 0.95);
    color: #fff;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    z-index: 700;
}
</style>
