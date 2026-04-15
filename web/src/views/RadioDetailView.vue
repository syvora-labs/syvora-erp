<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRadios, type Radio, type RadioFile } from '../composables/useRadios'
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const radioId = computed(() => route.params.id as string)

const {
    fetchRadioById, deleteRadio,
    publishRadio, unpublishRadio, archiveRadio, unarchiveRadio,
    uploadRadioFile, deleteRadioFile,
} = useRadios()

const radio = ref<Radio | null>(null)
const loadingRadio = ref(true)

const activeTab = ref('overview')

const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'files', label: 'Files', count: radio.value?.files.length ?? 0 },
])

onMounted(async () => {
    await reloadRadio()
})

async function reloadRadio() {
    loadingRadio.value = true
    radio.value = await fetchRadioById(radioId.value)
    loadingRadio.value = false
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    })
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── Lifecycle actions ────────────────────────────────────────────────────────

async function handlePublish() {
    if (!radio.value) return
    if (!radio.value.soundcloud_link) {
        alert('Cannot publish: a SoundCloud link is required.')
        return
    }
    try {
        await publishRadio(radio.value.id)
        await reloadRadio()
    } catch (e: any) {
        alert(e.message ?? 'Failed to publish.')
    }
}

async function handleUnpublish() {
    if (!radio.value) return
    try {
        await unpublishRadio(radio.value.id)
        await reloadRadio()
    } catch (e: any) {
        alert(e.message ?? 'Failed to revert to draft.')
    }
}

async function handleArchive() {
    if (!radio.value) return
    if (!confirm(`Archive "${radio.value.title}"? It will be hidden from the active list.`)) return
    try {
        await archiveRadio(radio.value.id)
        await reloadRadio()
    } catch (e: any) {
        alert(e.message ?? 'Failed to archive.')
    }
}

async function handleUnarchive() {
    if (!radio.value) return
    try {
        await unarchiveRadio(radio.value.id)
        await reloadRadio()
    } catch (e: any) {
        alert(e.message ?? 'Failed to restore.')
    }
}

async function handleDelete() {
    if (!radio.value) return
    if (!confirm(`Delete "${radio.value.title}"? This cannot be undone.`)) return
    try {
        await deleteRadio(radio.value.id)
        router.push('/radios')
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

// ── Files ─────────────────────────────────────────────────────────────────────

const newFileLabel = ref('')
const uploading = ref(false)

async function onFilePick(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !radio.value) return
    const label = newFileLabel.value.trim() || file.name
    uploading.value = true
    try {
        await uploadRadioFile(file, radio.value.id, label)
        newFileLabel.value = ''
        await reloadRadio()
    } catch (err: any) {
        alert(err.message ?? 'Failed to upload file.')
    } finally {
        uploading.value = false
        input.value = ''
    }
}

async function handleDeleteFile(file: RadioFile) {
    if (!confirm(`Delete file "${file.label}"?`)) return
    try {
        await deleteRadioFile(file)
        await reloadRadio()
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete file.')
    }
}

function downloadFile(file: RadioFile) {
    const a = document.createElement('a')
    a.href = file.file_url
    a.download = file.file_name
    a.target = '_blank'
    a.click()
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <button class="back-btn" @click="router.push('/radios')">← Radios</button>

        <div v-if="loadingRadio" class="loading-text">Loading…</div>

        <template v-else-if="radio">
            <div class="radio-header">
                <div class="radio-info">
                    <div class="radio-name-row">
                        <h1 class="radio-name">{{ radio.title }}</h1>
                        <span v-if="radio.is_draft" class="badge badge-draft">Draft</span>
                        <span v-else class="badge badge-published">Published</span>
                        <span v-if="radio.is_archived" class="badge badge-archived">Archived</span>
                    </div>
                    <p class="radio-date-line">{{ formatDate(radio.release_date) }}</p>
                    <div class="radio-header-actions">
                        <SyvoraButton size="sm" @click="router.push(`/radios/${radioId}/edit`)">Edit</SyvoraButton>
                        <SyvoraButton
                            v-if="radio.is_draft"
                            size="sm"
                            :disabled="!radio.soundcloud_link"
                            :title="!radio.soundcloud_link ? 'Add a SoundCloud link before publishing' : ''"
                            @click="handlePublish"
                        >
                            Publish
                        </SyvoraButton>
                        <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnpublish">Revert to Draft</SyvoraButton>
                        <SyvoraButton v-if="!radio.is_archived" variant="ghost" size="sm" @click="handleArchive">Archive</SyvoraButton>
                        <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnarchive">Restore</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete">Delete</SyvoraButton>
                    </div>
                </div>
            </div>

            <SyvoraTabs v-model="activeTab" :tabs="tabs" />

            <!-- Overview tab -->
            <div v-if="activeTab === 'overview'" class="tab-content">
                <div v-if="radio.artists.length" class="detail-section">
                    <h3 class="detail-label">Artists</h3>
                    <div class="artist-badges">
                        <span v-for="(artist, i) in radio.artists" :key="i" class="badge badge-deposit">
                            {{ artist }}
                        </span>
                    </div>
                </div>

                <div v-if="radio.description" class="detail-section">
                    <h3 class="detail-label">Description</h3>
                    <p class="detail-text">{{ radio.description }}</p>
                </div>

                <div v-if="radio.soundcloud_link" class="detail-section">
                    <h3 class="detail-label">SoundCloud</h3>
                    <a :href="radio.soundcloud_link" target="_blank" rel="noopener noreferrer" class="ext-link">
                        {{ radio.soundcloud_link }} ↗
                    </a>
                </div>

                <div class="detail-section detail-audit">
                    <span>Created by {{ radio.creator_name ?? 'Unknown' }} · {{ formatAuditDate(radio.created_at) }}</span>
                    <span v-if="radio.updater_name"> · Updated by {{ radio.updater_name }} · {{ formatAuditDate(radio.updated_at) }}</span>
                </div>
            </div>

            <!-- Files tab -->
            <div v-if="activeTab === 'files'" class="tab-content">
                <div class="section-header">
                    <h2 class="section-title">Attached Files</h2>
                </div>

                <div class="file-add-row">
                    <input
                        v-model="newFileLabel"
                        class="label-input"
                        placeholder="File label (e.g. SoundCloud Artwork)"
                        :disabled="uploading"
                    />
                    <label class="file-pick-btn" :class="{ disabled: uploading }">
                        {{ uploading ? 'Uploading…' : 'Choose File' }}
                        <input
                            type="file"
                            class="hidden-input"
                            :disabled="uploading"
                            @change="onFilePick"
                        />
                    </label>
                </div>

                <SyvoraEmptyState v-if="radio.files.length === 0">
                    No files attached to this radio yet.
                </SyvoraEmptyState>

                <div v-else class="files-list">
                    <div v-for="f in radio.files" :key="f.id" class="file-row">
                        <span class="file-row-label">{{ f.label }}</span>
                        <span class="file-row-name">{{ f.file_name }}</span>
                        <span class="file-row-size">{{ formatFileSize(f.file_size) }}</span>
                        <button class="file-row-btn" title="Download" @click="downloadFile(f)">&#8595;</button>
                        <button class="file-row-btn file-row-delete" title="Delete" @click="handleDeleteFile(f)">&times;</button>
                    </div>
                </div>
            </div>
        </template>

        <div v-else class="loading-text">Radio not found.</div>
    </div>
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
.radio-header { display: flex; align-items: flex-start; gap: 1.5rem; margin-bottom: 1.5rem; }
.radio-info { flex: 1; min-width: 0; }
.radio-name-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.radio-name { font-size: 2rem; font-weight: 800; margin: 0; color: var(--color-text); letter-spacing: -0.02em; }
.radio-date-line { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.9rem; }
.radio-header-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-top: 0.75rem; }

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
.artist-badges { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.ext-link {
    font-size: 0.875rem; font-weight: 600; color: var(--color-accent);
    text-decoration: none; word-break: break-all;
}
.ext-link:hover { opacity: 0.75; }

.detail-audit { font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.7; }

/* ── Section header ──────────────────────────────────────────────────────── */
.section-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;
}
.section-title { font-size: 1.25rem; font-weight: 700; margin: 0; color: var(--color-text); }

/* ── Files ───────────────────────────────────────────────────────────────── */
.file-add-row {
    display: flex; gap: 0.5rem; align-items: stretch; margin-bottom: 1rem;
}
.label-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm, 0.625rem);
    color: var(--color-text);
    font-size: 1rem;
    font-family: inherit;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.85) inset,
        0 1px 3px rgba(0, 0, 0, 0.04) inset;
}
.label-input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(22, 163, 74, 0.4);
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.95) inset,
        0 1px 3px rgba(0, 0, 0, 0.04) inset,
        0 0 0 3px rgba(22, 163, 74, 0.1);
}
.label-input:disabled { opacity: 0.6; cursor: not-allowed; }

.file-pick-btn {
    display: inline-flex; align-items: center; padding: 0 1rem;
    background: var(--color-accent); color: #fff; border-radius: var(--radius-sm);
    font-size: 0.875rem; font-weight: 600; cursor: pointer;
    white-space: nowrap; transition: opacity 0.15s;
}
.file-pick-btn:hover { opacity: 0.85; }
.file-pick-btn.disabled { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
.hidden-input { display: none; }

.files-list { display: flex; flex-direction: column; gap: 0.5rem; }
.file-row {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.625rem 0.875rem; border-radius: var(--radius-sm);
    background: rgba(115, 195, 254, 0.06); border: 1px solid rgba(115, 195, 254, 0.12);
    font-size: 0.875rem;
}
.file-row-label { font-weight: 600; color: var(--color-text); flex-shrink: 0; }
.file-row-name { color: var(--color-text-muted); font-size: 0.8125rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-row-size { color: var(--color-text-muted); font-size: 0.8125rem; flex-shrink: 0; }
.file-row-btn {
    background: none; border: none; cursor: pointer;
    color: var(--color-accent); font-size: 1rem; padding: 0 0.25rem;
    line-height: 1; flex-shrink: 0;
}
.file-row-btn:hover { opacity: 0.7; }
.file-row-delete { color: var(--color-error); }

:deep(.btn-danger) { color: var(--color-error, #f87171); }

/* ── Responsive ──────────────────────────────────────────────────────── */
.mobile .radio-header { flex-direction: column; align-items: center; text-align: center; }
.mobile .radio-name { font-size: 1.5rem; }
.mobile .radio-name-row { justify-content: center; }
.mobile .radio-header-actions { justify-content: center; }
.mobile .file-add-row { flex-direction: column; }
.mobile .file-row { flex-wrap: wrap; }
</style>
