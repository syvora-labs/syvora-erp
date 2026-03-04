<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useArtists, type Artist } from '../composables/useArtists'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraTabs,
} from '@syvora/ui'

const router = useRouter()
const { artists, managedArtists, generalArtists, loading, fetchArtists, createArtist, updateArtist, deleteArtist, uploadArtistPicture } = useArtists()

const activeTab = ref<'managed' | 'general'>('managed')
const displayedArtists = computed(() => activeTab.value === 'managed' ? managedArtists.value : generalArtists.value)

const showModal = ref(false)
const editingArtist = ref<Artist | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({ name: '', is_managed: false })
const pictureFile = ref<File | null>(null)
const picturePreview = ref<string | null>(null)
const pictureInput = ref<HTMLInputElement | null>(null)

onMounted(fetchArtists)

function openCreate() {
    editingArtist.value = null
    form.value = { name: '', is_managed: false }
    pictureFile.value = null
    picturePreview.value = null
    error.value = ''
    showModal.value = true
}

function openEdit(artist: Artist) {
    editingArtist.value = artist
    form.value = { name: artist.name, is_managed: artist.is_managed }
    pictureFile.value = null
    picturePreview.value = artist.picture_url ?? null
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingArtist.value = null
}

function onPicturePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    pictureFile.value = file
    picturePreview.value = URL.createObjectURL(file)
}

async function saveArtist() {
    if (!form.value.name.trim()) {
        error.value = 'Artist name is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        if (editingArtist.value) {
            let picture_url = editingArtist.value.picture_url
            if (pictureFile.value) {
                picture_url = await uploadArtistPicture(pictureFile.value, editingArtist.value.id)
            }
            await updateArtist(editingArtist.value.id, { name: form.value.name.trim(), picture_url, is_managed: form.value.is_managed })
        } else {
            const newArtist = await createArtist({ name: form.value.name.trim(), is_managed: form.value.is_managed })
            if (pictureFile.value) {
                const picture_url = await uploadArtistPicture(pictureFile.value, newArtist.id)
                await updateArtist(newArtist.id, { picture_url })
            }
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(artist: Artist) {
    if (!confirm(`Delete "${artist.name}"? All notes will also be deleted.`)) return
    try {
        await deleteArtist(artist.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

function openArtist(artist: Artist) {
    router.push(`/artists/${artist.id}`)
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Artists</h1>
                <p class="page-subtitle">Manage your roster of artists</p>
            </div>
            <SyvoraButton @click="openCreate">+ New Artist</SyvoraButton>
        </div>

        <SyvoraTabs
            v-model="activeTab"
            :tabs="[
                { key: 'managed', label: 'Managed by EB', count: managedArtists.length },
                { key: 'general', label: 'General', count: generalArtists.length },
            ]"
        />

        <div v-if="loading" class="loading-text">Loading…</div>

        <SyvoraEmptyState v-else-if="displayedArtists.length === 0" title="No artists yet" description="Add your first artist to get started." />

        <div v-else class="artists-grid">
            <div
                v-for="artist in displayedArtists"
                :key="artist.id"
                class="artist-card"
                @click="openArtist(artist)"
            >
                <div class="artist-picture">
                    <img v-if="artist.picture_url" :src="artist.picture_url" :alt="artist.name" />
                    <div v-else class="artist-picture-placeholder">
                        <span>{{ artist.name.charAt(0).toUpperCase() }}</span>
                    </div>
                </div>
                <div class="artist-body">
                    <h3 class="artist-name">{{ artist.name }}</h3>
                    <p class="artist-meta">Added {{ formatDate(artist.created_at) }}</p>
                    <div class="artist-actions" @click.stop>
                        <SyvoraButton variant="ghost" size="sm" @click="openEdit(artist)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(artist)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <SyvoraModal v-if="showModal" :title="editingArtist ? 'Edit Artist' : 'New Artist'" size="md" @close="closeModal">
        <div class="modal-form">
            <div class="picture-upload">
                <div class="picture-preview" @click="pictureInput?.click()">
                    <img v-if="picturePreview" :src="picturePreview" :alt="form.name || 'Artist'" />
                    <div v-else class="picture-placeholder">
                        <span class="picture-icon">+</span>
                        <small>Artist photo</small>
                    </div>
                    <div class="picture-overlay">Change photo</div>
                </div>
                <input ref="pictureInput" type="file" accept="image/*" class="hidden-input" @change="onPicturePick" />
            </div>

            <SyvoraFormField label="Artist Name" for="artist-name">
                <SyvoraInput id="artist-name" v-model="form.name" placeholder="e.g. DJ Horizon" />
            </SyvoraFormField>

            <label class="checkbox-field">
                <input type="checkbox" v-model="form.is_managed" />
                <span>Managed by EB</span>
            </label>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" @click="saveArtist">{{ editingArtist ? 'Save Changes' : 'Create Artist' }}</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 1100px;
    margin: 0 auto;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
}

.page-title {
    font-size: 1.75rem;
    font-weight: 800;
    margin: 0 0 0.25rem;
    color: var(--color-text);
}

.page-subtitle {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem;
}

.artists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.25rem;
}

.artist-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
}

.artist-card:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
}

.artist-picture {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
}

.artist-picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.artist-picture-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    font-weight: 700;
    color: var(--color-accent);
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
}

.artist-body {
    padding: 1rem;
}

.artist-name {
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
    color: var(--color-text);
}

.artist-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0 0 0.75rem;
}

.artist-actions {
    display: flex;
    gap: 0.5rem;
}

/* Modal */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.picture-upload {
    display: flex;
    justify-content: center;
}

.picture-preview {
    position: relative;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
    border: 2px dashed var(--color-border);
    transition: border-color 0.15s;
}

.picture-preview:hover {
    border-color: var(--color-accent);
}

.picture-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.picture-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--color-text-muted);
}

.picture-icon {
    font-size: 1.5rem;
    line-height: 1;
}

.picture-placeholder small {
    font-size: 0.65rem;
}

.picture-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: white;
    opacity: 0;
    transition: opacity 0.15s;
}

.picture-preview:hover .picture-overlay {
    opacity: 1;
}

.hidden-input {
    display: none;
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

.checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--color-text);
    cursor: pointer;
}

.checkbox-field input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--color-accent);
    cursor: pointer;
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}
</style>
