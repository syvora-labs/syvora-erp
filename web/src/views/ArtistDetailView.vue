<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArtists, type Artist, type ArtistNote } from '../composables/useArtists'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const artistId = computed(() => route.params.id as string)

const { artists, fetchArtists, fetchNotes, createNote, updateNote, deleteNote } = useArtists()

const artist = ref<Artist | null>(null)
const notes = ref<ArtistNote[]>([])
const loadingArtist = ref(true)
const loadingNotes = ref(true)

const showModal = ref(false)
const editingNote = ref<ArtistNote | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({ title: '', content: '' })

onMounted(async () => {
    // Ensure artists are loaded
    if (artists.value.length === 0) await fetchArtists()
    artist.value = artists.value.find(a => a.id === artistId.value) ?? null
    loadingArtist.value = false

    await loadNotes()
})

async function loadNotes() {
    loadingNotes.value = true
    notes.value = await fetchNotes(artistId.value)
    loadingNotes.value = false
}

function openCreate() {
    editingNote.value = null
    form.value = { title: '', content: '' }
    error.value = ''
    showModal.value = true
}

function openEdit(note: ArtistNote) {
    editingNote.value = note
    form.value = { title: note.title, content: note.content }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingNote.value = null
}

async function saveNote() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        if (editingNote.value) {
            await updateNote(editingNote.value.id, {
                title: form.value.title.trim(),
                content: form.value.content,
            })
        } else {
            await createNote(artistId.value, {
                title: form.value.title.trim(),
                content: form.value.content,
            })
        }
        await loadNotes()
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save.'
    } finally {
        saving.value = false
    }
}

async function handleDeleteNote(note: ArtistNote) {
    if (!confirm(`Delete note "${note.title}"?`)) return
    try {
        await deleteNote(note.id)
        notes.value = notes.value.filter(n => n.id !== note.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}
</script>

<template>
    <div class="page">
        <button class="back-btn" @click="router.push('/artists')">← Artists</button>

        <div v-if="loadingArtist" class="loading-text">Loading…</div>

        <template v-else-if="artist">
            <div class="artist-header">
                <div class="artist-avatar">
                    <img v-if="artist.picture_url" :src="artist.picture_url" :alt="artist.name" />
                    <div v-else class="artist-avatar-placeholder">
                        {{ artist.name.charAt(0).toUpperCase() }}
                    </div>
                </div>
                <div class="artist-info">
                    <h1 class="artist-name">{{ artist.name }}</h1>
                    <p class="artist-since">Artist since {{ formatDate(artist.created_at) }}</p>
                </div>
            </div>

            <div class="notes-section">
                <div class="notes-header">
                    <h2 class="notes-title">Notes</h2>
                    <SyvoraButton @click="openCreate">+ New Note</SyvoraButton>
                </div>

                <div v-if="loadingNotes" class="loading-text">Loading notes…</div>

                <SyvoraEmptyState
                    v-else-if="notes.length === 0"
                    title="No notes yet"
                    description="Create a note to track information about this artist."
                />

                <div v-else class="notes-list">
                    <div v-for="note in notes" :key="note.id" class="note-card">
                        <div class="note-header">
                            <h3 class="note-title">{{ note.title }}</h3>
                            <div class="note-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(note)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteNote(note)">Delete</SyvoraButton>
                            </div>
                        </div>
                        <div class="note-content">
                            <p v-if="note.content" class="note-text">{{ note.content }}</p>
                            <p v-else class="note-empty">No content.</p>
                        </div>
                        <div class="note-meta">
                            <span v-if="note.creator_name">by {{ note.creator_name }}</span>
                            <span>{{ formatDateTime(note.created_at) }}</span>
                            <span v-if="note.updater_name"> · edited by {{ note.updater_name }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <div v-else class="loading-text">Artist not found.</div>
    </div>

    <SyvoraModal
        v-if="showModal"
        :title="editingNote ? 'Edit Note' : 'New Note'"
        size="lg"
        @close="closeModal"
    >
        <div class="modal-form">
            <SyvoraFormField label="Title" for="note-title">
                <SyvoraInput id="note-title" v-model="form.title" placeholder="Note title" />
            </SyvoraFormField>

            <SyvoraFormField label="Content" for="note-content">
                <SyvoraTextarea
                    id="note-content"
                    v-model="form.content"
                    placeholder="Write your note here…"
                    :rows="12"
                />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" @click="saveNote">{{ editingNote ? 'Save Changes' : 'Create Note' }}</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 800px;
    margin: 0 auto;
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

/* Artist header */
.artist-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2.5rem;
}

.artist-avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    border: 2px solid var(--color-border);
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
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
}

.artist-name {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 0.25rem;
    color: var(--color-text);
}

.artist-since {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

/* Notes */
.notes-section {
    margin-top: 1rem;
}

.notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
}

.notes-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
}

.notes-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.note-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.875rem;
    padding: 1.25rem 1.5rem;
    transition: border-color 0.15s;
}

.note-card:hover {
    border-color: var(--color-accent);
}

.note-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
}

.note-title {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
}

.note-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

.note-content {
    margin-bottom: 0.75rem;
}

.note-text {
    margin: 0;
    color: var(--color-text);
    font-size: 0.9rem;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
}

.note-empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-style: italic;
}

.note-meta {
    font-size: 0.73rem;
    color: var(--color-text-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}

/* Modal */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}
</style>
