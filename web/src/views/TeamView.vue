<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useTeam, GENERAL_ROLES, EVENT_ROLES, type TeamMember, type TeamEventAssignment } from '../composables/useTeam'
import { useEvents } from '../composables/useEvents'
import { supabase } from '../lib/supabase'
import { useMandator } from '../composables/useMandator'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraAvatar, SyvoraBadge,
    SyvoraCard,
    useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()

const {
    teamMembers, loading,
    fetchTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember,
    uploadTeamMemberImage, fetchEventAssignments, assignToEvent, removeEventAssignment,
} = useTeam()

const { events, fetchEvents } = useEvents()
const { mandator } = useMandator()

// ── Member modal ─────────────────────────────────────────────────────────────
const showModal = ref(false)
const editingMember = ref<TeamMember | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({
    full_name: '',
    general_roles: [] as string[],
    user_id: '',
})
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)

// ── Detail panel ─────────────────────────────────────────────────────────────
const selectedMember = ref<TeamMember | null>(null)
const assignments = ref<TeamEventAssignment[]>([])
const loadingAssignments = ref(false)

// ── Assign to event ──────────────────────────────────────────────────────────
const showAssignModal = ref(false)
const assignForm = ref({ event_id: '', event_role: '', notes: '' })
const assignError = ref('')

// ── Mandator users (for linking) ─────────────────────────────────────────────
const mandatorUsers = ref<{ id: string; display_name: string | null; username: string }[]>([])

onMounted(async () => {
    await fetchTeamMembers()
    await fetchEvents()

    const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .eq('mandator_id', mandator.value?.id ?? '')
    mandatorUsers.value = data ?? []
})

// ── Member CRUD ──────────────────────────────────────────────────────────────

function openCreate() {
    editingMember.value = null
    form.value = { full_name: '', general_roles: [], user_id: '' }
    imageFile.value = null
    imagePreview.value = null
    error.value = ''
    showModal.value = true
}

function openEdit(member: TeamMember) {
    editingMember.value = member
    form.value = {
        full_name: member.full_name,
        general_roles: [...member.general_roles],
        user_id: member.user_id ?? '',
    }
    imageFile.value = null
    imagePreview.value = member.image_url
    error.value = ''
    showModal.value = true
}

function onImagePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    imageFile.value = file
    imagePreview.value = URL.createObjectURL(file)
}

function toggleRole(role: string) {
    const idx = form.value.general_roles.indexOf(role)
    if (idx >= 0) form.value.general_roles.splice(idx, 1)
    else form.value.general_roles.push(role)
}

async function saveMember() {
    if (!form.value.full_name.trim()) {
        error.value = 'Full name is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        if (editingMember.value) {
            let imageUrl = editingMember.value.image_url
            if (imageFile.value) {
                imageUrl = await uploadTeamMemberImage(imageFile.value, editingMember.value.id)
            }
            await updateTeamMember(editingMember.value.id, {
                full_name: form.value.full_name.trim(),
                general_roles: form.value.general_roles,
                image_url: imageUrl,
                user_id: form.value.user_id || null,
            })
        } else {
            // Create first, then upload image
            await createTeamMember({
                full_name: form.value.full_name.trim(),
                general_roles: form.value.general_roles,
                user_id: form.value.user_id || null,
            })
            if (imageFile.value) {
                const created = teamMembers.value.find((m) => m.full_name === form.value.full_name.trim())
                if (created) {
                    const url = await uploadTeamMemberImage(imageFile.value, created.id)
                    await updateTeamMember(created.id, { image_url: url })
                }
            }
        }
        showModal.value = false
    } catch (e: any) {
        error.value = e.message
    } finally {
        saving.value = false
    }
}

async function handleDelete(member: TeamMember) {
    if (!confirm(`Delete "${member.full_name}" from the team?`)) return
    try {
        await deleteTeamMember(member.id)
        if (selectedMember.value?.id === member.id) {
            selectedMember.value = null
        }
    } catch (e: any) {
        alert(e.message)
    }
}

// ── Detail panel ─────────────────────────────────────────────────────────────

async function selectMember(member: TeamMember) {
    selectedMember.value = member
    loadingAssignments.value = true
    try {
        assignments.value = await fetchEventAssignments(member.id)
    } finally {
        loadingAssignments.value = false
    }
}

function closeDetail() {
    selectedMember.value = null
    assignments.value = []
}

// ── Event assignment ─────────────────────────────────────────────────────────

function openAssign() {
    assignForm.value = { event_id: '', event_role: '', notes: '' }
    assignError.value = ''
    showAssignModal.value = true
}

async function handleAssign() {
    if (!assignForm.value.event_id || !assignForm.value.event_role) {
        assignError.value = 'Event and role are required.'
        return
    }
    try {
        await assignToEvent(
            selectedMember.value!.id,
            assignForm.value.event_id,
            assignForm.value.event_role,
            assignForm.value.notes || undefined,
        )
        showAssignModal.value = false
        assignments.value = await fetchEventAssignments(selectedMember.value!.id)
    } catch (e: any) {
        assignError.value = e.message
    }
}

async function handleRemoveAssignment(id: string) {
    await removeEventAssignment(id)
    assignments.value = assignments.value.filter((a) => a.id !== id)
}

function formatDate(d: string | null | undefined) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── QR Code ─────────────────────────────────────────────────────────────────
const qrCanvasRef = ref<HTMLCanvasElement>()

watch(selectedMember, async () => {
    await nextTick()
    if (selectedMember.value && qrCanvasRef.value) {
        await QRCode.toCanvas(qrCanvasRef.value, selectedMember.value.qr_token, {
            width: 180,
            margin: 2,
            color: { dark: '#0c1a27', light: '#ffffff' },
        })
    }
})

async function exportQrPdf(member: TeamMember) {
    const qrDataUrl = await QRCode.toDataURL(member.qr_token, {
        width: 400,
        margin: 2,
        color: { dark: '#0c1a27', light: '#ffffff' },
    })
    const doc = new jsPDF({ unit: 'mm', format: 'a6' })
    const w = doc.internal.pageSize.getWidth()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(member.full_name, w / 2, 18, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Team — All-Access Pass', w / 2, 26, { align: 'center' })
    const qrSize = 60
    doc.addImage(qrDataUrl, 'PNG', (w - qrSize) / 2, 34, qrSize, qrSize)
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(member.qr_token, w / 2, 100, { align: 'center' })
    doc.save(`pass-${member.full_name.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <div class="page-header">
            <div>
                <h1 class="page-title">Team</h1>
                <p class="page-subtitle">Manage your label's team members and event crew</p>
            </div>
            <SyvoraButton @click="openCreate">+ Add Team Member</SyvoraButton>
        </div>

        <div v-if="loading" class="loading-text">Loading team...</div>

        <div v-else class="team-layout">
            <!-- Roster -->
            <div class="roster">
                <SyvoraEmptyState v-if="teamMembers.length === 0">
                    No team members yet. Add your first member to get started.
                </SyvoraEmptyState>

                <div v-else class="member-grid">
                    <SyvoraCard
                        v-for="member in teamMembers"
                        :key="member.id"
                        class="member-card"
                        :class="{ 'member-card--selected': selectedMember?.id === member.id }"
                        @click="selectMember(member)"
                    >
                        <div class="member-card-content">
                            <SyvoraAvatar
                                :src="member.image_url ?? undefined"
                                :name="member.full_name"
                                size="md"
                            />
                            <div class="member-card-info">
                                <span class="member-name">{{ member.full_name }}</span>
                                <div class="member-roles">
                                    <SyvoraBadge
                                        v-for="role in member.general_roles"
                                        :key="role"
                                        variant="deposit"
                                    >{{ role }}</SyvoraBadge>
                                </div>
                            </div>
                            <div class="member-card-actions" @click.stop>
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(member)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(member)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </SyvoraCard>
                </div>
            </div>

            <!-- Detail panel -->
            <div v-if="selectedMember" class="detail-panel">
                <SyvoraCard>
                    <div class="detail-header">
                        <SyvoraAvatar
                            :src="selectedMember.image_url ?? undefined"
                            :name="selectedMember.full_name"
                            size="lg"
                        />
                        <div>
                            <h2 class="detail-name">{{ selectedMember.full_name }}</h2>
                            <div class="member-roles">
                                <SyvoraBadge
                                    v-for="role in selectedMember.general_roles"
                                    :key="role"
                                    variant="deposit"
                                >{{ role }}</SyvoraBadge>
                            </div>
                        </div>
                        <SyvoraButton variant="ghost" size="sm" class="close-btn" @click="closeDetail">&times;</SyvoraButton>
                    </div>

                    <div class="detail-section">
                        <div class="detail-section-header">
                            <h3 class="detail-section-title">Check-In Pass</h3>
                        </div>
                        <div class="qr-section">
                            <canvas ref="qrCanvasRef" class="qr-canvas"></canvas>
                            <SyvoraButton variant="ghost" size="sm" @click="exportQrPdf(selectedMember!)">Export PDF</SyvoraButton>
                        </div>
                    </div>

                    <div class="detail-section">
                        <div class="detail-section-header">
                            <h3 class="detail-section-title">Event Assignments</h3>
                            <SyvoraButton variant="ghost" size="sm" @click="openAssign">+ Assign</SyvoraButton>
                        </div>

                        <div v-if="loadingAssignments" class="loading-text">Loading...</div>
                        <SyvoraEmptyState v-else-if="assignments.length === 0">
                            Not assigned to any events yet.
                        </SyvoraEmptyState>
                        <div v-else class="assignment-list">
                            <div v-for="a in assignments" :key="a.id" class="assignment-row">
                                <div class="assignment-info">
                                    <span class="assignment-event">{{ a.event_title ?? 'Unknown event' }}</span>
                                    <span class="assignment-date">{{ formatDate(a.event_date) }}</span>
                                </div>
                                <SyvoraBadge variant="success">{{ a.event_role }}</SyvoraBadge>
                                <span v-if="a.notes" class="assignment-notes">{{ a.notes }}</span>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleRemoveAssignment(a.id)">Remove</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </SyvoraCard>
            </div>
        </div>
    </div>

    <!-- Create / Edit Member Modal -->
    <SyvoraModal v-if="showModal" :title="editingMember ? 'Edit Team Member' : 'Add Team Member'" size="sm" @close="showModal = false">
        <div class="create-form">
            <SyvoraFormField label="Full Name" for="tm-name">
                <SyvoraInput id="tm-name" v-model="form.full_name" placeholder="First Last" autocomplete="off" />
            </SyvoraFormField>

            <div class="field-group">
                <span class="field-label">General Roles</span>
                <div class="role-toggles">
                    <label v-for="role in GENERAL_ROLES" :key="role" class="role-toggle">
                        <input type="checkbox" :checked="form.general_roles.includes(role)" @change="toggleRole(role)" />
                        <span>{{ role }}</span>
                    </label>
                </div>
            </div>

            <SyvoraFormField label="Profile Image" for="tm-image">
                <div class="image-upload">
                    <SyvoraAvatar v-if="imagePreview" :src="imagePreview" :name="form.full_name || 'T'" size="md" />
                    <input type="file" accept="image/*" @change="onImagePick" id="tm-image" />
                </div>
            </SyvoraFormField>

            <SyvoraFormField label="Link to User (optional)" for="tm-user">
                <select id="tm-user" v-model="form.user_id" class="native-select">
                    <option value="">None</option>
                    <option v-for="u in mandatorUsers" :key="u.id" :value="u.id">
                        {{ u.display_name || u.username }}
                    </option>
                </select>
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveMember">
                {{ editingMember ? 'Save Changes' : 'Add Member' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Assign to Event Modal -->
    <SyvoraModal v-if="showAssignModal" title="Assign to Event" size="sm" @close="showAssignModal = false">
        <div class="create-form">
            <SyvoraFormField label="Event" for="ae-event">
                <select id="ae-event" v-model="assignForm.event_id" class="native-select">
                    <option value="" disabled>Select an event...</option>
                    <option v-for="e in events" :key="e.id" :value="e.id">
                        {{ e.title }}{{ e.event_date ? ` (${formatDate(e.event_date)})` : '' }}
                    </option>
                </select>
            </SyvoraFormField>

            <SyvoraFormField label="Event Role" for="ae-role">
                <select id="ae-role" v-model="assignForm.event_role" class="native-select">
                    <option value="" disabled>Select a role...</option>
                    <option v-for="role in EVENT_ROLES" :key="role" :value="role">{{ role }}</option>
                </select>
            </SyvoraFormField>

            <SyvoraFormField label="Notes (optional)" for="ae-notes">
                <SyvoraInput id="ae-notes" v-model="assignForm.notes" placeholder="e.g. Shift 20:00-02:00" />
            </SyvoraFormField>

            <p v-if="assignError" class="error-msg">{{ assignError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showAssignModal = false">Cancel</SyvoraButton>
            <SyvoraButton @click="handleAssign">Assign</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 1200px;
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

.team-layout {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
}

.roster {
    flex: 1;
    min-width: 0;
}

.member-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.member-card {
    cursor: pointer;
    transition: box-shadow 0.2s, border-color 0.2s;
}

.member-card--selected {
    border-color: var(--color-accent);
}

.member-card-content {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.member-card-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.member-name {
    font-size: 0.9375rem;
    font-weight: 600;
}

.member-roles {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
}

.member-card-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
}

/* ── Detail panel ────────────────────────────────────────────────────────── */

.detail-panel {
    width: 480px;
    flex-shrink: 0;
    position: sticky;
    top: 5rem;
}

.detail-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
}

.detail-header :deep(.syvora-avatar) {
    flex-shrink: 0;
    min-width: 6.5rem;
    min-height: 6.5rem;
    max-width: 6.5rem;
    max-height: 6.5rem;
}

.detail-header > div {
    flex: 1;
    min-width: 0;
}

.detail-name {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
}

.close-btn {
    align-self: flex-start;
    font-size: 1.25rem;
    line-height: 1;
}

.detail-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border-subtle);
}

.detail-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
}

.detail-section-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
}

.assignment-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.assignment-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-wrap: wrap;
}

.assignment-row:last-child {
    border-bottom: none;
}

.assignment-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
}

.assignment-event {
    font-size: 0.875rem;
    font-weight: 600;
}

.assignment-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.assignment-notes {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
    width: 100%;
}

/* ── Form ────────────────────────────────────────────────────────────────── */

.create-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.field-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
}

.role-toggles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.role-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    cursor: pointer;
}

.role-toggle input[type="checkbox"] {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: var(--color-accent);
    cursor: pointer;
}

.image-upload {
    display: flex;
    align-items: center;
    gap: 1rem;
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

.qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.qr-canvas {
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-subtle);
}

:deep(.btn-danger) {
    color: var(--color-error);
}

/* ── Mobile ──────────────────────────────────────────────────────────────── */

.mobile .page-header {
    flex-wrap: wrap;
}

.mobile .page-title {
    font-size: 1.375rem;
}

.mobile .team-layout {
    flex-direction: column;
}

.mobile .detail-panel {
    width: 100%;
    position: static;
}

.mobile .member-card-content {
    flex-wrap: wrap;
}

.mobile .member-card-actions {
    width: 100%;
    justify-content: flex-end;
}

.mobile .detail-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.mobile .detail-header :deep(.syvora-avatar) {
    min-width: 4rem;
    min-height: 4rem;
    max-width: 4rem;
    max-height: 4rem;
}

.mobile .detail-header .member-roles {
    justify-content: center;
}

.mobile .close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
}

.mobile .detail-panel :deep(.card) {
    position: relative;
}

.mobile .detail-section-header {
    flex-wrap: wrap;
    gap: 0.5rem;
}

.mobile .assignment-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
}

.mobile .assignment-row :deep(.btn) {
    align-self: flex-end;
}
</style>
