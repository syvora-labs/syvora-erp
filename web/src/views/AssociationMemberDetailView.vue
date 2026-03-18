<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    useAssociations,
    type AssociationMember,
    type AssociationMemberNote,
} from '../composables/useAssociations'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, useIsMobile,
} from '@syvora/ui'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const memberId = computed(() => route.params.id as string)

const { members, fetchMembers, fetchMemberNotes, createMemberNote, updateMemberNote, deleteMemberNote } = useAssociations()

const member = ref<AssociationMember | null>(null)
const notes = ref<AssociationMemberNote[]>([])
const loadingMember = ref(true)
const loadingNotes = ref(true)

// Note modal
const showNoteModal = ref(false)
const editingNote = ref<AssociationMemberNote | null>(null)
const noteForm = ref({ title: '', content: '' })
const savingNote = ref(false)
const noteError = ref('')
const viewingNote = ref<AssociationMemberNote | null>(null)

onMounted(async () => {
    if (members.value.length === 0) await fetchMembers()
    member.value = members.value.find(m => m.id === memberId.value) ?? null
    loadingMember.value = false
    await loadNotes()
})

async function loadNotes() {
    loadingNotes.value = true
    notes.value = await fetchMemberNotes(memberId.value)
    loadingNotes.value = false
}

function renderMarkdown(content: string): string {
    return marked.parse(content) as string
}

// Note handlers
function openCreateNote() {
    editingNote.value = null
    noteForm.value = { title: '', content: '' }
    noteError.value = ''
    showNoteModal.value = true
}

function openEditNote(note: AssociationMemberNote) {
    editingNote.value = note
    noteForm.value = { title: note.title, content: note.content }
    noteError.value = ''
    showNoteModal.value = true
}

function openViewNote(note: AssociationMemberNote) {
    viewingNote.value = note
}

async function saveNote() {
    if (!noteForm.value.title.trim()) { noteError.value = 'Title is required.'; return }
    if (!noteForm.value.content.trim()) { noteError.value = 'Content is required.'; return }
    savingNote.value = true
    noteError.value = ''
    try {
        const payload = { title: noteForm.value.title.trim(), content: noteForm.value.content.trim() }
        if (editingNote.value) {
            await updateMemberNote(editingNote.value.id, payload)
        } else {
            await createMemberNote(memberId.value, payload)
        }
        await loadNotes()
        showNoteModal.value = false
    } catch (e: any) {
        noteError.value = e.message ?? 'Failed to save note.'
    } finally {
        savingNote.value = false
    }
}

async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return
    try {
        await deleteMemberNote(noteId)
        if (viewingNote.value?.id === noteId) viewingNote.value = null
        await loadNotes()
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete note.')
    }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <button class="back-btn" @click="router.push('/associations')">← Associations</button>

        <div v-if="loadingMember" class="loading-text">Loading...</div>

        <template v-else-if="member">
            <!-- Member header -->
            <div class="member-header">
                <div
                    class="member-avatar-lg"
                    :style="member.role_color ? {
                        background: member.role_color + '1f',
                        color: member.role_color,
                        borderColor: member.role_color + '40',
                    } : {}"
                >
                    {{ member.name.charAt(0).toUpperCase() }}
                </div>
                <div class="member-header-info">
                    <div class="member-name-row">
                        <h1 class="member-name">{{ member.name }}</h1>
                        <span
                            v-if="member.role_name"
                            class="role-badge"
                            :style="{ background: member.role_color + '1f', color: member.role_color }"
                        >
                            {{ member.role_name }}
                        </span>
                    </div>
                    <div class="member-contact">
                        <span v-if="member.email">{{ member.email }}</span>
                        <span v-if="member.phone">{{ member.phone }}</span>
                        <span v-if="member.address">{{ member.address }}</span>
                    </div>
                    <p class="member-since">Member since {{ formatDate(member.created_at) }}</p>
                </div>
            </div>

            <!-- Notes section -->
            <div class="section-header">
                <h2 class="section-title">Notes</h2>
                <SyvoraButton size="sm" @click="openCreateNote">+ Add Note</SyvoraButton>
            </div>

            <!-- Viewing a single note -->
            <template v-if="viewingNote">
                <div class="section-header" style="justify-content: flex-start; margin-top: 0;">
                    <button class="back-btn" @click="viewingNote = null">← Back to notes</button>
                </div>
                <SyvoraCard>
                    <div class="note-detail">
                        <h2 class="note-detail-title">{{ viewingNote.title || 'Untitled' }}</h2>
                        <div class="note-detail-meta">
                            {{ viewingNote.creator_name ?? 'Unknown' }} · {{ formatDateTime(viewingNote.created_at) }}
                            <span v-if="viewingNote.updated_at !== viewingNote.created_at">
                                · edited {{ formatDateTime(viewingNote.updated_at) }}
                            </span>
                        </div>
                        <div class="markdown-body" v-html="renderMarkdown(viewingNote.content)"></div>
                        <div class="note-detail-actions">
                            <SyvoraButton size="sm" @click="openEditNote(viewingNote)">Edit</SyvoraButton>
                            <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteNote(viewingNote.id)">Delete</SyvoraButton>
                        </div>
                    </div>
                </SyvoraCard>
            </template>

            <!-- Notes list -->
            <template v-else>
                <div v-if="loadingNotes" class="loading-text">Loading notes...</div>

                <SyvoraEmptyState v-else-if="notes.length === 0" title="No notes yet"
                    description="Add a note to track information about this member." />

                <SyvoraCard v-else>
                    <div class="note-list">
                        <div v-for="note in notes" :key="note.id" class="note-row" @click="openViewNote(note)">
                            <div class="note-title">{{ note.title || 'Untitled' }}</div>
                            <div class="note-preview">{{ note.content.slice(0, 120) }}{{ note.content.length > 120 ? '...' : '' }}</div>
                            <div class="note-footer">
                                <span class="note-meta">{{ note.creator_name ?? 'Unknown' }} · {{ formatDateTime(note.created_at) }}</span>
                                <div class="note-actions" @click.stop>
                                    <SyvoraButton variant="ghost" size="sm" @click="openEditNote(note)">Edit</SyvoraButton>
                                    <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteNote(note.id)">Delete</SyvoraButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </SyvoraCard>
            </template>
        </template>

        <div v-else class="loading-text">Member not found.</div>
    </div>

    <!-- ── Note Modal ─────────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showNoteModal" :title="editingNote ? 'Edit Note' : 'Add Note'" size="lg" @close="showNoteModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Title" for="mn-title">
                <SyvoraInput id="mn-title" v-model="noteForm.title" placeholder="Note title" />
            </SyvoraFormField>
            <SyvoraFormField label="Content" for="mn-content">
                <textarea id="mn-content" v-model="noteForm.content" class="native-textarea" rows="12"
                    placeholder="Write your note... (Markdown supported)"></textarea>
            </SyvoraFormField>
            <p class="hint-text">Supports Markdown: **bold**, *italic*, # headings, - lists, ```code```, etc.</p>
            <p v-if="noteError" class="error-msg">{{ noteError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showNoteModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingNote" :disabled="savingNote" @click="saveNote">
                {{ editingNote ? 'Save Changes' : 'Add Note' }}
            </SyvoraButton>
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

/* ── Member header ────────────────────────────────────────────────────── */
.member-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.member-avatar-lg {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
    border: 2px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 700;
    flex-shrink: 0;
}

.member-header-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.member-name-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.member-name {
    font-size: 2rem;
    font-weight: 800;
    margin: 0;
    color: var(--color-text);
}

.role-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 999px;
    white-space: nowrap;
}

.member-contact {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
}

.member-contact span + span::before {
    content: '\00b7';
    margin-right: 0.5rem;
}

.member-since {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

/* ── Section header ───────────────────────────────────────────────────── */
.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
}

.section-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
}

/* ── Notes ─────────────────────────────────────────────────────────────── */
.note-list {
    display: flex;
    flex-direction: column;
}

.note-row {
    padding: 1rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    transition: background 0.15s;
    cursor: pointer;
}

.note-row:last-child {
    border-bottom: none;
}

.note-row:hover {
    background: rgba(115, 195, 254, 0.04);
}

.note-title {
    font-size: 0.9375rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
}

.note-preview {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin-bottom: 0.5rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.note-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.note-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
}

.note-actions {
    display: flex;
    gap: 0.375rem;
}

/* ── Note detail ──────────────────────────────────────────────────────── */
.note-detail {
    padding: 0.5rem 0;
}

.note-detail-title {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 0.5rem;
}

.note-detail-meta {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.note-detail-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border-subtle);
}

/* ── Markdown rendering ───────────────────────────────────────────────── */
.markdown-body {
    font-size: 0.9375rem;
    line-height: 1.7;
    word-wrap: break-word;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
    margin: 1.25rem 0 0.5rem;
    font-weight: 700;
    line-height: 1.3;
}

.markdown-body :deep(h1) { font-size: 1.5rem; }
.markdown-body :deep(h2) { font-size: 1.25rem; }
.markdown-body :deep(h3) { font-size: 1.1rem; }

.markdown-body :deep(p) {
    margin: 0 0 0.75rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
    margin: 0 0 0.75rem;
    padding-left: 1.5rem;
}

.markdown-body :deep(li) {
    margin-bottom: 0.25rem;
}

.markdown-body :deep(code) {
    background: rgba(115, 195, 254, 0.08);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.markdown-body :deep(pre) {
    background: rgba(0, 0, 0, 0.04);
    padding: 1rem;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    margin: 0 0 0.75rem;
}

.markdown-body :deep(pre code) {
    background: none;
    padding: 0;
}

.markdown-body :deep(blockquote) {
    border-left: 3px solid var(--color-accent);
    padding-left: 1rem;
    margin: 0 0 0.75rem;
    color: var(--color-text-muted);
}

.markdown-body :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border-subtle);
    margin: 1rem 0;
}

.markdown-body :deep(a) {
    color: var(--color-accent);
    text-decoration: none;
}

.markdown-body :deep(a:hover) {
    text-decoration: underline;
}

.markdown-body :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 0.75rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
    border: 1px solid var(--color-border-subtle);
    padding: 0.5rem 0.75rem;
    text-align: left;
}

.markdown-body :deep(th) {
    font-weight: 600;
    background: rgba(0, 0, 0, 0.02);
}

.markdown-body :deep(img) {
    max-width: 100%;
    border-radius: var(--radius-sm);
}

/* ── Modal / forms ────────────────────────────────────────────────────── */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.native-textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
    font-family: inherit;
    resize: vertical;
}

.native-textarea:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
}

.hint-text {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}

/* ── Mobile ───────────────────────────────────────────────────────────── */
.mobile .member-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.mobile .member-avatar-lg {
    width: 72px;
    height: 72px;
    font-size: 2rem;
}

.mobile .member-name {
    font-size: 1.5rem;
}

.mobile .member-name-row {
    flex-wrap: wrap;
    justify-content: center;
}

.mobile .member-contact {
    justify-content: center;
}

.mobile .note-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .section-header {
    flex-wrap: wrap;
    gap: 0.75rem;
}

.mobile .back-btn {
    font-size: 0.75rem;
}
</style>
