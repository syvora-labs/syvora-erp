<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
    useMeetings,
    type Meeting, type MeetingMember, type MeetingNote, type MeetingTask, type MandatorUser,
} from '../composables/useMeetings'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()

const {
    meetings, loading, fetchMeetings,
    createMeeting, updateMeeting, deleteMeeting,
    fetchMeetingMembers, addMeetingMember, removeMeetingMember,
    fetchMeetingNotes, createNote, updateNote, deleteNote,
    fetchMeetingTasks, createTask, updateTask, deleteTask, toggleTaskCompleted,
    fetchMandatorUsers,
} = useMeetings()

// ── Meeting CRUD modal ──────────────────────────────────────────────────────
const showModal = ref(false)
const editingMeeting = ref<Meeting | null>(null)
const saving = ref(false)
const error = ref('')
const form = ref({ title: '', description: '', scheduled_at: '' })

// ── Detail view ─────────────────────────────────────────────────────────────
const selectedMeeting = ref<Meeting | null>(null)
const detailTab = ref('notes')

const members = ref<MeetingMember[]>([])
const notes = ref<MeetingNote[]>([])
const tasks = ref<MeetingTask[]>([])
const mandatorUsers = ref<MandatorUser[]>([])

// ── Note form ───────────────────────────────────────────────────────────────
const showNoteModal = ref(false)
const editingNote = ref<MeetingNote | null>(null)
const noteForm = ref({ content: '' })
const savingNote = ref(false)
const noteError = ref('')

// ── Task form ───────────────────────────────────────────────────────────────
const showTaskModal = ref(false)
const editingTask = ref<MeetingTask | null>(null)
const taskForm = ref({ title: '', deadline: '', assigned_to: '' })
const savingTask = ref(false)
const taskError = ref('')

// ── Member add ──────────────────────────────────────────────────────────────
const showAddMember = ref(false)
const addMemberUserId = ref('')

onMounted(async () => {
    await fetchMeetings()
    // If URL has ?id=, open that meeting
    const queryId = route.query.id as string | undefined
    if (queryId) {
        const found = meetings.value.find(m => m.id === queryId)
        if (found) openDetail(found)
    }
})

// ── Meeting CRUD ────────────────────────────────────────────────────────────
function openCreate() {
    editingMeeting.value = null
    form.value = { title: '', description: '', scheduled_at: '' }
    error.value = ''
    showModal.value = true
}

function openEdit(meeting: Meeting) {
    editingMeeting.value = meeting
    form.value = {
        title: meeting.title,
        description: meeting.description ?? '',
        scheduled_at: meeting.scheduled_at ? meeting.scheduled_at.slice(0, 16) : '',
    }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingMeeting.value = null
}

async function saveMeeting() {
    if (!form.value.title.trim()) { error.value = 'Title is required.'; return }
    if (!form.value.scheduled_at) { error.value = 'Scheduled date is required.'; return }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description.trim() || null,
            scheduled_at: new Date(form.value.scheduled_at).toISOString(),
        }
        if (editingMeeting.value) {
            await updateMeeting(editingMeeting.value.id, payload)
        } else {
            await createMeeting(payload)
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save meeting.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(meeting: Meeting) {
    if (!confirm(`Delete "${meeting.title}"? This cannot be undone.`)) return
    try {
        await deleteMeeting(meeting.id)
        if (selectedMeeting.value?.id === meeting.id) selectedMeeting.value = null
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete meeting.')
    }
}

// ── Detail ──────────────────────────────────────────────────────────────────
async function openDetail(meeting: Meeting) {
    selectedMeeting.value = meeting
    detailTab.value = 'notes'
    mandatorUsers.value = await fetchMandatorUsers()
    await Promise.all([
        loadMembers(meeting.id),
        loadNotes(meeting.id),
        loadTasks(meeting.id),
    ])
}

function closeDetail() {
    selectedMeeting.value = null
}

async function loadMembers(meetingId: string) {
    members.value = await fetchMeetingMembers(meetingId)
}

async function loadNotes(meetingId: string) {
    notes.value = await fetchMeetingNotes(meetingId)
}

async function loadTasks(meetingId: string) {
    tasks.value = await fetchMeetingTasks(meetingId)
}

// ── Members ─────────────────────────────────────────────────────────────────
function openAddMember() {
    addMemberUserId.value = ''
    showAddMember.value = true
}

async function handleAddMember() {
    if (!addMemberUserId.value || !selectedMeeting.value) return
    try {
        await addMeetingMember(selectedMeeting.value.id, addMemberUserId.value)
        await loadMembers(selectedMeeting.value.id)
        showAddMember.value = false
    } catch (e: any) {
        alert(e.message ?? 'Failed to add member.')
    }
}

async function handleRemoveMember(userId: string) {
    if (!selectedMeeting.value) return
    if (!confirm('Remove this member from the meeting?')) return
    try {
        await removeMeetingMember(selectedMeeting.value.id, userId)
        await loadMembers(selectedMeeting.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to remove member.')
    }
}

// Available users = mandator users not already members
function availableUsers() {
    const memberIds = new Set(members.value.map(m => m.user_id))
    return mandatorUsers.value.filter(u => !memberIds.has(u.id))
}

// ── Notes ───────────────────────────────────────────────────────────────────
function openCreateNote() {
    editingNote.value = null
    noteForm.value = { content: '' }
    noteError.value = ''
    showNoteModal.value = true
}

function openEditNote(note: MeetingNote) {
    editingNote.value = note
    noteForm.value = { content: note.content }
    noteError.value = ''
    showNoteModal.value = true
}

async function saveNote() {
    if (!noteForm.value.content.trim()) { noteError.value = 'Content is required.'; return }
    if (!selectedMeeting.value) return
    savingNote.value = true
    noteError.value = ''
    try {
        if (editingNote.value) {
            await updateNote(editingNote.value.id, noteForm.value.content.trim())
        } else {
            await createNote(selectedMeeting.value.id, noteForm.value.content.trim())
        }
        await loadNotes(selectedMeeting.value.id)
        showNoteModal.value = false
    } catch (e: any) {
        noteError.value = e.message ?? 'Failed to save note.'
    } finally {
        savingNote.value = false
    }
}

async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return
    if (!selectedMeeting.value) return
    try {
        await deleteNote(noteId)
        await loadNotes(selectedMeeting.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete note.')
    }
}

// ── Tasks ───────────────────────────────────────────────────────────────────
function openCreateTask() {
    editingTask.value = null
    taskForm.value = { title: '', deadline: '', assigned_to: '' }
    taskError.value = ''
    showTaskModal.value = true
}

function openEditTask(task: MeetingTask) {
    editingTask.value = task
    taskForm.value = {
        title: task.title,
        deadline: task.deadline ? task.deadline.slice(0, 16) : '',
        assigned_to: task.assigned_to ?? '',
    }
    taskError.value = ''
    showTaskModal.value = true
}

async function saveTask() {
    if (!taskForm.value.title.trim()) { taskError.value = 'Title is required.'; return }
    if (!selectedMeeting.value) return
    savingTask.value = true
    taskError.value = ''
    try {
        const payload = {
            title: taskForm.value.title.trim(),
            deadline: taskForm.value.deadline ? new Date(taskForm.value.deadline).toISOString() : null,
            assigned_to: taskForm.value.assigned_to || null,
        }
        if (editingTask.value) {
            await updateTask(editingTask.value.id, payload)
        } else {
            await createTask(selectedMeeting.value.id, payload)
        }
        await loadTasks(selectedMeeting.value.id)
        showTaskModal.value = false
    } catch (e: any) {
        taskError.value = e.message ?? 'Failed to save task.'
    } finally {
        savingTask.value = false
    }
}

async function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    if (!selectedMeeting.value) return
    try {
        await deleteTask(taskId)
        await loadTasks(selectedMeeting.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete task.')
    }
}

async function handleToggleTask(task: MeetingTask) {
    if (!selectedMeeting.value) return
    try {
        await toggleTaskCompleted(task.id, !task.completed)
        await loadTasks(selectedMeeting.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to update task.')
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function isOverdue(deadline: string | null) {
    if (!deadline) return false
    return new Date(deadline) < new Date()
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <!-- ── Meeting list ──────────────────────────────────────────────── -->
        <template v-if="!selectedMeeting">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Meetings</h1>
                    <p class="page-subtitle">Schedule meetings, take notes, and track follow-ups</p>
                </div>
                <SyvoraButton @click="openCreate">+ New Meeting</SyvoraButton>
            </div>

            <div v-if="loading" class="loading-text">Loading meetings...</div>

            <SyvoraEmptyState v-else-if="meetings.length === 0" title="No meetings yet"
                description="Schedule your first meeting to get started." />

            <SyvoraCard v-else>
                <div class="meeting-list">
                    <div v-for="meeting in meetings" :key="meeting.id" class="meeting-row">
                        <div class="meeting-avatar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </div>
                        <div class="meeting-info" @click="openDetail(meeting)" style="cursor: pointer;">
                            <span class="meeting-name">{{ meeting.title }}</span>
                            <div class="meeting-details">
                                <span class="meeting-detail">{{ formatDateTime(meeting.scheduled_at) }}</span>
                                <span v-if="meeting.description" class="meeting-detail">{{ meeting.description
                                    }}</span>
                            </div>
                        </div>
                        <div class="meeting-row-end">
                            <div class="meeting-meta">
                                <span>Created by {{ meeting.creator_name ?? 'Unknown' }} · {{
                                    formatDate(meeting.created_at) }}</span>
                            </div>
                            <div class="meeting-actions">
                                <SyvoraButton variant="ghost" size="sm"
                                    @click="openDetail(meeting)">Open</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm"
                                    @click="openEdit(meeting)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger"
                                    @click="handleDelete(meeting)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
        </template>

        <!-- ── Meeting detail ────────────────────────────────────────────── -->
        <template v-else>
            <div class="page-header">
                <div>
                    <button class="back-btn" @click="closeDetail">&larr; Back to meetings</button>
                    <h1 class="page-title">{{ selectedMeeting.title }}</h1>
                    <p class="page-subtitle">{{ formatDateTime(selectedMeeting.scheduled_at) }}
                        <span v-if="selectedMeeting.description"> &mdash; {{ selectedMeeting.description }}</span>
                    </p>
                </div>
                <SyvoraButton variant="ghost" size="sm" @click="openEdit(selectedMeeting)">Edit Meeting</SyvoraButton>
            </div>

            <SyvoraTabs v-model="detailTab" :tabs="[
                { key: 'notes', label: 'Notes', count: notes.length },
                { key: 'tasks', label: 'Tasks', count: tasks.length },
                { key: 'members', label: 'Members', count: members.length },
            ]" />

            <!-- ── Notes tab ─────────────────────────────────────────────── -->
            <template v-if="detailTab === 'notes'">
                <div class="section-header">
                    <SyvoraButton size="sm" @click="openCreateNote">+ Add Note</SyvoraButton>
                </div>
                <SyvoraEmptyState v-if="notes.length === 0" title="No notes yet"
                    description="Add a note to this meeting." />
                <SyvoraCard v-else>
                    <div class="note-list">
                        <div v-for="note in notes" :key="note.id" class="note-row">
                            <div class="note-content">{{ note.content }}</div>
                            <div class="note-footer">
                                <span class="note-meta">{{ note.creator_name ?? 'Unknown' }} &middot; {{
                                    formatDateTime(note.created_at) }}</span>
                                <div class="note-actions">
                                    <SyvoraButton variant="ghost" size="sm"
                                        @click="openEditNote(note)">Edit</SyvoraButton>
                                    <SyvoraButton variant="ghost" size="sm" class="btn-danger"
                                        @click="handleDeleteNote(note.id)">Delete</SyvoraButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </SyvoraCard>
            </template>

            <!-- ── Tasks tab ─────────────────────────────────────────────── -->
            <template v-if="detailTab === 'tasks'">
                <div class="section-header">
                    <SyvoraButton size="sm" @click="openCreateTask">+ Add Task</SyvoraButton>
                </div>
                <SyvoraEmptyState v-if="tasks.length === 0" title="No tasks yet"
                    description="Add a follow-up task to this meeting." />
                <SyvoraCard v-else>
                    <div class="task-list">
                        <div v-for="task in tasks" :key="task.id" class="task-row"
                            :class="{ 'task-completed': task.completed }">
                            <button class="task-checkbox" @click="handleToggleTask(task)"
                                :class="{ checked: task.completed }">
                                <svg v-if="task.completed" width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" stroke-width="3" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </button>
                            <div class="task-info">
                                <span class="task-title">{{ task.title }}</span>
                                <div class="task-details">
                                    <span v-if="task.assignee_name" class="task-detail">{{ task.assignee_name }}</span>
                                    <span v-if="task.deadline" class="task-detail"
                                        :class="{ 'task-overdue': !task.completed && isOverdue(task.deadline) }">
                                        Due {{ formatDateTime(task.deadline) }}
                                    </span>
                                </div>
                            </div>
                            <div class="task-actions">
                                <SyvoraButton variant="ghost" size="sm"
                                    @click="openEditTask(task)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger"
                                    @click="handleDeleteTask(task.id)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </SyvoraCard>
            </template>

            <!-- ── Members tab ───────────────────────────────────────────── -->
            <template v-if="detailTab === 'members'">
                <div class="section-header">
                    <SyvoraButton size="sm" @click="openAddMember">+ Add Member</SyvoraButton>
                </div>
                <SyvoraEmptyState v-if="members.length === 0" title="No members yet"
                    description="Add members to this meeting." />
                <SyvoraCard v-else>
                    <div class="member-list">
                        <div v-for="member in members" :key="member.id" class="member-row">
                            <div class="member-avatar">
                                <span>{{ (member.display_name ?? member.username ?? '?').charAt(0).toUpperCase()
                                    }}</span>
                            </div>
                            <div class="member-info">
                                <span class="member-name">{{ member.display_name ?? member.username ?? 'Unknown'
                                    }}</span>
                                <span v-if="member.username && member.display_name" class="member-username">@{{
                                    member.username }}</span>
                            </div>
                            <SyvoraButton variant="ghost" size="sm" class="btn-danger"
                                @click="handleRemoveMember(member.user_id)">Remove</SyvoraButton>
                        </div>
                    </div>
                </SyvoraCard>
            </template>
        </template>
    </div>

    <!-- ── Create/Edit Meeting Modal ─────────────────────────────────────── -->
    <SyvoraModal v-if="showModal" :title="editingMeeting ? 'Edit Meeting' : 'New Meeting'" size="sm"
        @close="closeModal">
        <div class="modal-form">
            <SyvoraFormField label="Title" for="mt-title">
                <SyvoraInput id="mt-title" v-model="form.title" placeholder="Meeting title" />
            </SyvoraFormField>
            <SyvoraFormField label="Description" for="mt-desc">
                <SyvoraInput id="mt-desc" v-model="form.description" placeholder="Optional description or agenda" />
            </SyvoraFormField>
            <SyvoraFormField label="Scheduled Date & Time" for="mt-date">
                <input id="mt-date" type="datetime-local" v-model="form.scheduled_at" class="native-input" />
            </SyvoraFormField>
            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveMeeting">
                {{ editingMeeting ? 'Save Changes' : 'Create Meeting' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Note Modal ────────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showNoteModal" :title="editingNote ? 'Edit Note' : 'Add Note'" size="sm"
        @close="showNoteModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Content" for="nt-content">
                <textarea id="nt-content" v-model="noteForm.content" class="native-textarea" rows="5"
                    placeholder="Write your note..."></textarea>
            </SyvoraFormField>
            <p v-if="noteError" class="error-msg">{{ noteError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showNoteModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingNote" :disabled="savingNote" @click="saveNote">
                {{ editingNote ? 'Save Changes' : 'Add Note' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Task Modal ────────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showTaskModal" :title="editingTask ? 'Edit Task' : 'Add Task'" size="sm"
        @close="showTaskModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Title" for="tk-title">
                <SyvoraInput id="tk-title" v-model="taskForm.title" placeholder="Task description" />
            </SyvoraFormField>
            <SyvoraFormField label="Deadline" for="tk-deadline">
                <input id="tk-deadline" type="datetime-local" v-model="taskForm.deadline" class="native-input" />
            </SyvoraFormField>
            <SyvoraFormField label="Assigned To" for="tk-assignee">
                <select id="tk-assignee" v-model="taskForm.assigned_to" class="native-select">
                    <option value="">Unassigned</option>
                    <option v-for="u in mandatorUsers" :key="u.id" :value="u.id">
                        {{ u.display_name ?? u.username }}
                    </option>
                </select>
            </SyvoraFormField>
            <p v-if="taskError" class="error-msg">{{ taskError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showTaskModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingTask" :disabled="savingTask" @click="saveTask">
                {{ editingTask ? 'Save Changes' : 'Add Task' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Add Member Modal ──────────────────────────────────────────────── -->
    <SyvoraModal v-if="showAddMember" title="Add Member" size="sm" @close="showAddMember = false">
        <div class="modal-form">
            <SyvoraFormField label="User" for="am-user">
                <select id="am-user" v-model="addMemberUserId" class="native-select">
                    <option value="" disabled>Select a user...</option>
                    <option v-for="u in availableUsers()" :key="u.id" :value="u.id">
                        {{ u.display_name ?? u.username }}
                    </option>
                </select>
            </SyvoraFormField>
            <p v-if="availableUsers().length === 0" class="hint-text">All users in this mandator are already members.
            </p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showAddMember = false">Cancel</SyvoraButton>
            <SyvoraButton :disabled="!addMemberUserId" @click="handleAddMember">Add Member</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 960px;
    margin: 0 auto;
}

.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    gap: 1rem;
}

.page-title {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 0.25rem;
}

.page-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem 0;
}

.back-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 0.5rem;
    display: inline-block;
}

.back-btn:hover {
    text-decoration: underline;
}

.section-header {
    display: flex;
    justify-content: flex-end;
    margin: 1rem 0;
}

/* ── Meeting list ──────────────────────────────────────────────────────── */
.meeting-list {
    display: flex;
    flex-direction: column;
}

.meeting-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.meeting-row:last-child {
    border-bottom: none;
}

.meeting-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.meeting-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.meeting-name {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.meeting-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.meeting-detail {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.meeting-detail+.meeting-detail::before {
    content: '\00b7';
    margin-right: 0.5rem;
}

.meeting-row-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.meeting-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
}

.meeting-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Members ───────────────────────────────────────────────────────────── */
.member-list {
    display: flex;
    flex-direction: column;
}

.member-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.member-row:last-child {
    border-bottom: none;
}

.member-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    flex-shrink: 0;
}

.member-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.member-name {
    font-size: 0.9375rem;
    font-weight: 600;
}

.member-username {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

/* ── Notes ──────────────────────────────────────────────────────────────── */
.note-list {
    display: flex;
    flex-direction: column;
}

.note-row {
    padding: 1rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.note-row:last-child {
    border-bottom: none;
}

.note-content {
    font-size: 0.9375rem;
    line-height: 1.6;
    white-space: pre-wrap;
    margin-bottom: 0.5rem;
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

/* ── Tasks ──────────────────────────────────────────────────────────────── */
.task-list {
    display: flex;
    flex-direction: column;
}

.task-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.task-row:last-child {
    border-bottom: none;
}

.task-completed {
    opacity: 0.5;
}

.task-checkbox {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 2px solid var(--color-border-subtle);
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: border-color 0.15s, background 0.15s;
    color: #fff;
    padding: 0;
}

.task-checkbox:hover {
    border-color: var(--color-accent);
}

.task-checkbox.checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
}

.task-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.task-title {
    font-size: 0.9375rem;
    font-weight: 600;
}

.task-completed .task-title {
    text-decoration: line-through;
}

.task-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.task-detail {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.task-detail+.task-detail::before {
    content: '\00b7';
    margin-right: 0.5rem;
}

.task-overdue {
    color: var(--color-error, #f87171);
    font-weight: 600;
}

.task-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Modals / Forms ────────────────────────────────────────────────────── */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.native-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
}

.native-input:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
}

.native-select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
}

.native-select:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
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

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

.hint-text {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}

/* ── Mobile ────────────────────────────────────────────────────────────── */
.mobile .page-header {
    flex-wrap: wrap;
}

.mobile .page-title {
    font-size: 1.375rem;
}

.mobile .meeting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 1rem 0;
}

.mobile .meeting-avatar {
    display: none;
}

.mobile .meeting-row-end {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .meeting-meta {
    text-align: left;
}

.mobile .meeting-actions {
    width: 100%;
    flex-wrap: wrap;
}

.mobile .member-row {
    flex-wrap: wrap;
}

.mobile .note-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .task-row {
    flex-wrap: wrap;
}

.mobile .task-actions {
    width: 100%;
}

.mobile .section-header {
    margin: 0.75rem 0;
}

.mobile .back-btn {
    font-size: 0.75rem;
}

.mobile .native-input,
.mobile .native-select,
.mobile .native-textarea {
    font-size: 0.9375rem;
    padding: 0.625rem 0.75rem;
}
</style>
