<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRadios, type Radio, type RadioFile } from '../composables/useRadios'
import { useArtists } from '../composables/useArtists'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, SyvoraTabs
} from '@syvora/ui'

const router = useRouter()

function goToRadio(radio: Radio) {
    router.push(`/radios/${radio.id}`)
}

const {
    activeRadios, archivedRadios, loading,
    fetchRadios, createRadio, updateRadio, deleteRadio,
    publishRadio, unpublishRadio, archiveRadio, unarchiveRadio,
    uploadRadioFile, deleteRadioFile,
} = useRadios()

const { artists, fetchArtists } = useArtists()

const activeTab = ref<'active' | 'archived'>('active')

const showModal = ref(false)
const editingRadio = ref<Radio | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({
    title: '',
    description: '',
    artists: [] as string[],
    release_date: '',
    soundcloud_link: '',
})

interface PendingFile {
    file: File
    label: string
}
const pendingFiles = ref<PendingFile[]>([])
const newFileLabel = ref('')

onMounted(() => {
    fetchRadios()
    fetchArtists()
})

function openCreate() {
    editingRadio.value = null
    form.value = { title: '', description: '', artists: [], release_date: '', soundcloud_link: '' }
    pendingFiles.value = []
    newFileLabel.value = ''
    error.value = ''
    showModal.value = true
}

function openEdit(radio: Radio) {
    editingRadio.value = radio
    form.value = {
        title: radio.title,
        description: radio.description ?? '',
        artists: [...radio.artists],
        release_date: radio.release_date ?? '',
        soundcloud_link: radio.soundcloud_link ?? '',
    }
    pendingFiles.value = []
    newFileLabel.value = ''
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingRadio.value = null
}

function onFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const label = newFileLabel.value.trim() || file.name
    pendingFiles.value.push({ file, label })
    newFileLabel.value = ''
    ;(e.target as HTMLInputElement).value = ''
}

function removePendingFile(index: number) {
    pendingFiles.value.splice(index, 1)
}

async function saveRadio() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description.trim() || null,
            artists: form.value.artists,
            release_date: form.value.release_date || null,
            soundcloud_link: form.value.soundcloud_link.trim() || null,
        }
        if (editingRadio.value) {
            await updateRadio(editingRadio.value.id, payload)
            for (const pf of pendingFiles.value) {
                await uploadRadioFile(pf.file, editingRadio.value.id, pf.label)
            }
            await fetchRadios()
        } else {
            const newRadio = await createRadio(payload)
            for (const pf of pendingFiles.value) {
                await uploadRadioFile(pf.file, newRadio.id, pf.label)
            }
            if (pendingFiles.value.length) await fetchRadios()
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save radio.'
    } finally {
        saving.value = false
    }
}

async function handlePublish(radio: Radio) {
    if (!radio.soundcloud_link) {
        alert('Cannot publish: a SoundCloud link is required.')
        return
    }
    try { await publishRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to publish radio.') }
}

async function handleUnpublish(radio: Radio) {
    try { await unpublishRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to revert to draft.') }
}

async function handleArchive(radio: Radio) {
    if (!confirm(`Archive "${radio.title}"? It will be hidden from the active list.`)) return
    try { await archiveRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to archive radio.') }
}

async function handleUnarchive(radio: Radio) {
    try { await unarchiveRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to restore radio.') }
}

async function handleDelete(radio: Radio) {
    if (!confirm(`Delete "${radio.title}"?`)) return
    try { await deleteRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to delete radio.') }
}

async function handleDeleteFile(file: RadioFile) {
    if (!confirm(`Delete file "${file.label}"?`)) return
    try { await deleteRadioFile(file) }
    catch (e: any) { alert(e.message ?? 'Failed to delete file.') }
}

function downloadFile(file: RadioFile) {
    const a = document.createElement('a')
    a.href = file.file_url
    a.download = file.file_name
    a.target = '_blank'
    a.click()
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

function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Radios</h1>
                <p class="page-subtitle">Manage radio episodes, artwork, and publishing</p>
            </div>
            <SyvoraButton @click="openCreate">+ New Radio</SyvoraButton>
        </div>

        <SyvoraTabs
            v-model="activeTab"
            :tabs="[
                { key: 'active', label: 'Active', count: activeRadios.length },
                { key: 'archived', label: 'Archived', count: archivedRadios.length },
            ]"
        />

        <div v-if="loading" class="loading-text">Loading radios...</div>

        <!-- Active radios -->
        <template v-else-if="activeTab === 'active'">
            <SyvoraEmptyState v-if="activeRadios.length === 0">
                No active radios. Create your first one.
            </SyvoraEmptyState>

            <div v-else class="radios-list">
                <div
                    v-for="radio in activeRadios"
                    :key="radio.id"
                    class="radio-card radio-card--clickable"
                    :class="{ 'radio-card--draft': radio.is_draft }"
                    @click="goToRadio(radio)"
                >
                    <div class="radio-body">
                        <div class="radio-meta">
                            <span v-if="radio.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>
                            <span class="radio-date">{{ formatDate(radio.release_date) }}</span>
                        </div>

                        <h3 class="radio-title">{{ radio.title }}</h3>

                        <div v-if="radio.artists.length" class="radio-artists">
                            <span v-for="(artist, i) in radio.artists" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="radio-audit">
                            <span>Created by {{ radio.creator_name ?? 'Unknown' }} · {{ formatAuditDate(radio.created_at) }}</span>
                            <span v-if="radio.updater_name"> · Updated by {{ radio.updater_name }} · {{ formatAuditDate(radio.updated_at) }}</span>
                        </div>

                        <div class="radio-footer">
                            <a v-if="radio.soundcloud_link && !radio.is_draft" :href="radio.soundcloud_link" target="_blank" class="soundcloud-link" @click.stop>
                                SoundCloud &#8599;
                            </a>
                            <div class="radio-actions" @click.stop>
                                <SyvoraButton v-if="radio.is_draft" size="sm" :disabled="!radio.soundcloud_link" :title="!radio.soundcloud_link ? 'Add a SoundCloud link before publishing' : ''" @click="handlePublish(radio)">
                                    Publish
                                </SyvoraButton>
                                <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnpublish(radio)">
                                    Revert to Draft
                                </SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(radio)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click="handleArchive(radio)">Archive</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(radio)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Archived radios -->
        <template v-else>
            <SyvoraEmptyState v-if="archivedRadios.length === 0">
                No archived radios.
            </SyvoraEmptyState>

            <div v-else class="radios-list">
                <div
                    v-for="radio in archivedRadios"
                    :key="radio.id"
                    class="radio-card radio-card--clickable radio-card--archived"
                    @click="goToRadio(radio)"
                >
                    <div class="radio-body">
                        <div class="radio-meta">
                            <span class="badge badge-archived">Archived</span>
                            <span v-if="radio.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>
                            <span class="radio-date">{{ formatDate(radio.release_date) }}</span>
                        </div>

                        <h3 class="radio-title">{{ radio.title }}</h3>

                        <div v-if="radio.artists.length" class="radio-artists">
                            <span v-for="(artist, i) in radio.artists" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="radio-audit">
                            <span>Created by {{ radio.creator_name ?? 'Unknown' }} · {{ formatAuditDate(radio.created_at) }}</span>
                            <span v-if="radio.updater_name"> · Updated by {{ radio.updater_name }} · {{ formatAuditDate(radio.updated_at) }}</span>
                        </div>

                        <div class="radio-footer">
                            <div class="radio-actions" @click.stop>
                                <SyvoraButton variant="ghost" size="sm" @click="handleUnarchive(radio)">Restore</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(radio)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>

    <SyvoraModal v-if="showModal" :title="editingRadio ? 'Edit Radio' : 'New Radio'" size="lg" @close="closeModal">
        <div class="modal-form">
            <div v-if="editingRadio && !editingRadio.is_draft" class="published-notice">
                <span class="badge badge-published">Published</span>
                Editing will update the live radio.
            </div>

            <SyvoraFormField label="Radio Title" for="rd-title">
                <SyvoraInput id="rd-title" v-model="form.title" placeholder="Radio episode name" />
            </SyvoraFormField>

            <SyvoraFormField label="Artists" for="rd-artists">
                <div class="multi-select-wrap">
                    <div v-if="form.artists.length" class="selected-artists">
                        <span v-for="(name, i) in form.artists" :key="i" class="selected-artist-chip">
                            {{ name }}
                            <button type="button" class="chip-remove" @click="form.artists.splice(i, 1)">&times;</button>
                        </span>
                    </div>
                    <select
                        id="rd-artists"
                        class="syvora-select"
                        @change="(e: Event) => {
                            const val = (e.target as HTMLSelectElement).value
                            if (val && !form.artists.includes(val)) form.artists.push(val)
                            ;(e.target as HTMLSelectElement).value = ''
                        }"
                    >
                        <option value="">Add artist...</option>
                        <option
                            v-for="a in artists"
                            :key="a.id"
                            :value="a.name"
                            :disabled="form.artists.includes(a.name)"
                        >{{ a.name }}</option>
                    </select>
                </div>
            </SyvoraFormField>

            <SyvoraFormField label="Release Date" for="rd-date">
                <SyvoraInput id="rd-date" v-model="form.release_date" type="date" />
            </SyvoraFormField>

            <SyvoraFormField label="SoundCloud Link" for="rd-soundcloud">
                <SyvoraInput id="rd-soundcloud" v-model="form.soundcloud_link" placeholder="https://soundcloud.com/..." />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="rd-desc">
                <SyvoraTextarea id="rd-desc" v-model="form.description" placeholder="Radio description..." :rows="3" />
            </SyvoraFormField>

            <!-- Existing files (edit mode) -->
            <div v-if="editingRadio && editingRadio.files.length" class="form-section">
                <label class="form-section-label">Attached Files</label>
                <div class="existing-files">
                    <div v-for="f in editingRadio.files" :key="f.id" class="file-row">
                        <span class="file-row-label">{{ f.label }}</span>
                        <span class="file-row-size">{{ formatFileSize(f.file_size) }}</span>
                        <button class="file-row-btn" title="Download" @click="downloadFile(f)">&#8595;</button>
                        <button class="file-row-btn file-row-delete" title="Delete" @click="handleDeleteFile(f)">&times;</button>
                    </div>
                </div>
            </div>

            <!-- Add new files -->
            <div class="form-section">
                <label class="form-section-label">Add Files</label>
                <div class="file-add-row">
                    <input
                        v-model="newFileLabel"
                        class="syvora-select"
                        placeholder="File label (e.g. SoundCloud Artwork)"
                    />
                    <label class="file-pick-btn">
                        Choose File
                        <input type="file" class="hidden-input" @change="onFilePick" />
                    </label>
                </div>
                <div v-if="pendingFiles.length" class="pending-files">
                    <div v-for="(pf, i) in pendingFiles" :key="i" class="file-row">
                        <span class="file-row-label">{{ pf.label }}</span>
                        <span class="file-row-size">{{ formatFileSize(pf.file.size) }}</span>
                        <button class="file-row-btn file-row-delete" title="Remove" @click="removePendingFile(i)">&times;</button>
                    </div>
                </div>
            </div>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveRadio">
                {{ editingRadio ? 'Save Changes' : 'Save as Draft' }}
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

.radios-list { display: flex; flex-direction: column; gap: 1rem; }

.radio-card {
    background: var(--color-surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    display: flex;
    transition: box-shadow 0.3s;
}
.radio-card:hover { box-shadow: var(--shadow-card-hover); }
.radio-card--clickable { cursor: pointer; }
.radio-card--draft {
    opacity: 0.82;
    border-style: dashed;
}
.radio-card--archived {
    opacity: 0.6;
}

.radio-body { flex: 1; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }

.radio-meta { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.radio-date { font-size: 0.8125rem; color: var(--color-text-muted); }
.radio-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.radio-artists { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.radio-desc {
    font-size: 0.9rem; color: var(--color-text-muted); margin: 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.radio-files { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.files-label { font-size: 0.8125rem; color: var(--color-text-muted); }
.file-chip {
    display: inline-flex; align-items: center; gap: 0.375rem;
    padding: 0.25rem 0.5rem; border-radius: var(--radius-sm);
    background: rgba(115, 195, 254, 0.08); border: 1px solid rgba(115, 195, 254, 0.18);
    font-size: 0.8125rem;
}
.file-chip-label { font-weight: 500; }
.file-chip-size { color: var(--color-text-muted); font-size: 0.75rem; }
.file-chip-action {
    background: none; border: none; cursor: pointer;
    color: var(--color-accent); font-size: 0.9rem; padding: 0 0.125rem;
    line-height: 1;
}
.file-chip-action:hover { opacity: 0.7; }
.file-chip-delete { color: var(--color-error); }

.radio-audit {
    font-size: 0.75rem; color: var(--color-text-muted);
    opacity: 0.7;
}

.radio-footer {
    display: flex; align-items: center; justify-content: flex-end;
    margin-top: auto; padding-top: 0.5rem;
}
.radio-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.soundcloud-link { font-size: 0.875rem; font-weight: 600; color: var(--color-accent); text-decoration: none; }
.soundcloud-link:hover { opacity: 0.75; }

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

.syvora-select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm, 0.625rem);
    color: var(--color-text);
    font-size: 1rem;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.85) inset,
        0 1px 3px rgba(0, 0, 0, 0.04) inset;
}
.syvora-select:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(22, 163, 74, 0.4);
    box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.95) inset,
        0 1px 3px rgba(0, 0, 0, 0.04) inset,
        0 0 0 3px rgba(22, 163, 74, 0.1);
}

.published-notice {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.8125rem; color: var(--color-text-muted);
    padding: 0.5rem 0.75rem;
    background: rgba(115, 195, 254, 0.06);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(115, 195, 254, 0.15);
}

.form-section { display: flex; flex-direction: column; gap: 0.5rem; }
.form-section-label { font-size: 0.875rem; font-weight: 600; color: var(--color-text); }

.file-add-row { display: flex; gap: 0.5rem; align-items: stretch; }
.file-add-row .syvora-select { flex: 1; }
.file-pick-btn {
    display: inline-flex; align-items: center; padding: 0 1rem;
    background: var(--color-accent); color: #fff; border-radius: var(--radius-sm);
    font-size: 0.875rem; font-weight: 600; cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
}
.file-pick-btn:hover { opacity: 0.85; }
.hidden-input { display: none; }

.existing-files, .pending-files { display: flex; flex-direction: column; gap: 0.375rem; }
.file-row {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.375rem 0.625rem; border-radius: var(--radius-sm);
    background: rgba(115, 195, 254, 0.06); border: 1px solid rgba(115, 195, 254, 0.12);
    font-size: 0.875rem;
}
.file-row-label { flex: 1; font-weight: 500; }
.file-row-size { color: var(--color-text-muted); font-size: 0.8125rem; }
.file-row-btn {
    background: none; border: none; cursor: pointer;
    color: var(--color-accent); font-size: 1rem; padding: 0 0.25rem;
    line-height: 1;
}
.file-row-btn:hover { opacity: 0.7; }
.file-row-delete { color: var(--color-error); }

.multi-select-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
.selected-artists { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.selected-artist-chip {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.25rem 0.5rem; border-radius: var(--radius-sm);
    background: rgba(115, 195, 254, 0.1); border: 1px solid rgba(115, 195, 254, 0.22);
    font-size: 0.8125rem; font-weight: 500;
}
.chip-remove {
    background: none; border: none; cursor: pointer;
    color: var(--color-text-muted); font-size: 1rem; line-height: 1;
    padding: 0 0.125rem;
}
.chip-remove:hover { color: var(--color-error); }

:deep(.btn-danger) { color: var(--color-error); }
</style>
