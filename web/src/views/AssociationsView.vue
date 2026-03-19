<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAssociations, type AssociationMember, type AssociationRole } from '../composables/useAssociations'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const isMobile = useIsMobile()
const router = useRouter()

const {
    members, roles, loading, loadingRoles,
    fetchMembers, createMember, updateMember, deleteMember,
    fetchRoles, createRole, updateRole, deleteRole,
} = useAssociations()

const activeTab = ref('members')

const tabs = computed<TabItem[]>(() => [
    { key: 'members', label: 'Members', count: members.value.length },
    { key: 'roles', label: 'Roles', count: roles.value.length },
])

// ── Member modal ─────────────────────────────────────────────────────────────
const showMemberModal = ref(false)
const editingMember = ref<AssociationMember | null>(null)
const savingMember = ref(false)
const memberError = ref('')
const memberForm = ref({ name: '', email: '', phone: '', address: '', role_id: '' })

// ── Role modal ───────────────────────────────────────────────────────────────
const showRoleModal = ref(false)
const editingRole = ref<AssociationRole | null>(null)
const savingRole = ref(false)
const roleError = ref('')
const roleForm = ref({ name: '', color: '#73c3fe', has_crown: false })

onMounted(async () => {
    await Promise.all([fetchMembers(), fetchRoles()])
})

// ── Member handlers ──────────────────────────────────────────────────────────
function openCreateMember() {
    editingMember.value = null
    memberForm.value = { name: '', email: '', phone: '', address: '', role_id: '' }
    memberError.value = ''
    showMemberModal.value = true
}

function openEditMember(member: AssociationMember) {
    editingMember.value = member
    memberForm.value = {
        name: member.name,
        email: member.email ?? '',
        phone: member.phone ?? '',
        address: member.address ?? '',
        role_id: member.role_id ?? '',
    }
    memberError.value = ''
    showMemberModal.value = true
}

function closeMemberModal() {
    showMemberModal.value = false
    editingMember.value = null
}

async function saveMember() {
    if (!memberForm.value.name.trim()) {
        memberError.value = 'Name is required.'
        return
    }
    savingMember.value = true
    memberError.value = ''
    try {
        const payload = {
            name: memberForm.value.name.trim(),
            email: memberForm.value.email.trim() || null,
            phone: memberForm.value.phone.trim() || null,
            address: memberForm.value.address.trim() || null,
            role_id: memberForm.value.role_id || null,
        }
        if (editingMember.value) {
            await updateMember(editingMember.value.id, payload)
        } else {
            await createMember(payload)
        }
        closeMemberModal()
    } catch (e: any) {
        memberError.value = e.message ?? 'Failed to save member.'
    } finally {
        savingMember.value = false
    }
}

async function handleDeleteMember(member: AssociationMember) {
    if (!confirm(`Delete "${member.name}"? This cannot be undone.`)) return
    try {
        await deleteMember(member.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete member.')
    }
}

function openMemberDetail(member: AssociationMember) {
    router.push(`/associations/${member.id}`)
}

// ── Role handlers ────────────────────────────────────────────────────────────
function openCreateRole() {
    editingRole.value = null
    roleForm.value = { name: '', color: '#73c3fe', has_crown: false }
    roleError.value = ''
    showRoleModal.value = true
}

function openEditRole(role: AssociationRole) {
    editingRole.value = role
    roleForm.value = { name: role.name, color: role.color, has_crown: role.has_crown }
    roleError.value = ''
    showRoleModal.value = true
}

function closeRoleModal() {
    showRoleModal.value = false
    editingRole.value = null
}

async function saveRole() {
    if (!roleForm.value.name.trim()) {
        roleError.value = 'Name is required.'
        return
    }
    savingRole.value = true
    roleError.value = ''
    try {
        const payload = {
            name: roleForm.value.name.trim(),
            color: roleForm.value.color,
            has_crown: roleForm.value.has_crown,
        }
        if (editingRole.value) {
            await updateRole(editingRole.value.id, payload)
        } else {
            await createRole(payload)
        }
        closeRoleModal()
    } catch (e: any) {
        roleError.value = e.message ?? 'Failed to save role.'
    } finally {
        savingRole.value = false
    }
}

async function handleDeleteRole(role: AssociationRole) {
    if (!confirm(`Delete role "${role.name}"? Members with this role will become unassigned.`)) return
    try {
        await deleteRole(role.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete role.')
    }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <div class="page-header">
            <div>
                <h1 class="page-title">Associations</h1>
                <p class="page-subtitle">Manage club members and roles</p>
            </div>
            <SyvoraButton v-if="activeTab === 'members'" @click="openCreateMember">+ New Member</SyvoraButton>
            <SyvoraButton v-if="activeTab === 'roles'" @click="openCreateRole">+ New Role</SyvoraButton>
        </div>

        <SyvoraTabs v-model="activeTab" :tabs="tabs" />

        <!-- ── Members tab ────────────────────────────────────────────────── -->
        <div v-if="activeTab === 'members'" class="tab-content">
            <div v-if="loading" class="loading-text">Loading members...</div>

            <SyvoraEmptyState v-else-if="members.length === 0" title="No members yet"
                description="Add your first club member to get started." />

            <SyvoraCard v-else>
                <div class="member-list">
                    <div v-for="member in members" :key="member.id" class="member-row" @click="openMemberDetail(member)">
                        <div class="member-avatar-wrap">
                            <div
                                class="member-avatar"
                                :style="member.role_color ? {
                                    background: member.role_color + '1f',
                                    color: member.role_color,
                                } : {}"
                            >
                                <span>{{ member.name.charAt(0).toUpperCase() }}</span>
                            </div>
                            <svg v-if="member.role_has_crown" class="member-crown" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
                            </svg>
                        </div>
                        <div class="member-info">
                            <div class="member-name-row">
                                <span class="member-name">{{ member.name }}</span>
                                <span v-if="member.role_name && member.role_color" class="member-role-badge" :style="{ background: member.role_color + '1f', color: member.role_color }">
                                    {{ member.role_name }}
                                </span>
                            </div>
                            <div class="member-details">
                                <span v-if="member.email" class="member-detail">{{ member.email }}</span>
                                <span v-if="member.phone" class="member-detail">{{ member.phone }}</span>
                                <span v-if="member.address" class="member-detail">{{ member.address }}</span>
                            </div>
                        </div>
                        <div class="member-row-end" @click.stop>
                            <div class="member-meta">
                                <span>Created by {{ member.creator_name ?? 'Unknown' }} · {{ formatDate(member.created_at) }}</span>
                                <span v-if="member.updater_name"> · Updated by {{ member.updater_name }} · {{ formatDate(member.updated_at) }}</span>
                            </div>
                            <div class="member-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEditMember(member)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteMember(member)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
        </div>

        <!-- ── Roles tab ──────────────────────────────────────────────────── -->
        <div v-if="activeTab === 'roles'" class="tab-content">
            <div v-if="loadingRoles" class="loading-text">Loading roles...</div>

            <SyvoraEmptyState v-else-if="roles.length === 0" title="No roles yet"
                description="Create roles to organize your members." />

            <SyvoraCard v-else>
                <div class="role-list">
                    <div v-for="role in roles" :key="role.id" class="role-row">
                        <div class="role-color-dot" :style="{ background: role.color }"></div>
                        <div class="role-info">
                            <span class="role-name">
                                {{ role.name }}
                                <svg v-if="role.has_crown" class="role-crown-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>
                            </span>
                            <span class="role-member-count">{{ members.filter(m => m.role_id === role.id).length }} members</span>
                        </div>
                        <div class="role-row-end">
                            <div class="role-meta">
                                <span>Created by {{ role.creator_name ?? 'Unknown' }} · {{ formatDate(role.created_at) }}</span>
                            </div>
                            <div class="role-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEditRole(role)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteRole(role)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
        </div>
    </div>

    <!-- ── Member Modal ───────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showMemberModal" :title="editingMember ? 'Edit Member' : 'New Member'" size="sm" @close="closeMemberModal">
        <div class="modal-form">
            <SyvoraFormField label="Name" for="am-name">
                <SyvoraInput id="am-name" v-model="memberForm.name" placeholder="Full name" />
            </SyvoraFormField>

            <SyvoraFormField label="Email" for="am-email">
                <SyvoraInput id="am-email" v-model="memberForm.email" type="email" placeholder="email@example.com" />
            </SyvoraFormField>

            <SyvoraFormField label="Phone" for="am-phone">
                <SyvoraInput id="am-phone" v-model="memberForm.phone" type="tel" placeholder="+1 234 567 890" />
            </SyvoraFormField>

            <SyvoraFormField label="Address" for="am-address">
                <SyvoraInput id="am-address" v-model="memberForm.address" placeholder="Street, City, Country" />
            </SyvoraFormField>

            <SyvoraFormField label="Role" for="am-role">
                <select id="am-role" v-model="memberForm.role_id" class="native-select">
                    <option value="">No role</option>
                    <option v-for="role in roles" :key="role.id" :value="role.id">
                        {{ role.name }}
                    </option>
                </select>
            </SyvoraFormField>

            <p v-if="memberError" class="error-msg">{{ memberError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeMemberModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingMember" :disabled="savingMember" @click="saveMember">
                {{ editingMember ? 'Save Changes' : 'Create Member' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Role Modal ─────────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showRoleModal" :title="editingRole ? 'Edit Role' : 'New Role'" size="sm" @close="closeRoleModal">
        <div class="modal-form">
            <SyvoraFormField label="Name" for="ar-name">
                <SyvoraInput id="ar-name" v-model="roleForm.name" placeholder="e.g. President, Treasurer, …" />
            </SyvoraFormField>

            <SyvoraFormField label="Color" for="ar-color">
                <div class="color-picker-row">
                    <input id="ar-color" type="color" v-model="roleForm.color" class="color-picker-input" />
                    <span class="color-preview" :style="{ background: roleForm.color }">{{ roleForm.color }}</span>
                </div>
            </SyvoraFormField>

            <div class="crown-toggle-row">
                <label class="crown-toggle" @click="roleForm.has_crown = !roleForm.has_crown">
                    <span class="crown-toggle-track" :class="{ active: roleForm.has_crown }">
                        <span class="crown-toggle-thumb"></span>
                    </span>
                    <svg class="crown-toggle-icon" :class="{ active: roleForm.has_crown }" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>
                    <span class="crown-toggle-label">Crown on avatar</span>
                </label>
            </div>

            <p v-if="roleError" class="error-msg">{{ roleError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeRoleModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingRole" :disabled="savingRole" @click="saveRole">
                {{ editingRole ? 'Save Changes' : 'Create Role' }}
            </SyvoraButton>
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

.tab-content {
    margin-top: 1.5rem;
}

/* ── Members ──────────────────────────────────────────────────────────── */
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
    cursor: pointer;
    transition: background 0.15s;
}

.member-row:hover {
    background: rgba(115, 195, 254, 0.04);
}

.member-row:last-child {
    border-bottom: none;
}

.member-avatar-wrap {
    position: relative;
    flex-shrink: 0;
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

.member-crown {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 18px;
    color: #f5a623;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15));
}

.member-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.member-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.member-name {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.member-role-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 999px;
    white-space: nowrap;
}

.member-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.member-detail {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.member-detail + .member-detail::before {
    content: '\00b7';
    margin-right: 0.5rem;
}

.member-row-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.member-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
}

.member-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Roles ────────────────────────────────────────────────────────────── */
.role-list {
    display: flex;
    flex-direction: column;
}

.role-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.role-row:last-child {
    border-bottom: none;
}

.role-color-dot {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    flex-shrink: 0;
}

.role-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.role-name {
    font-size: 0.9375rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.role-crown-icon {
    width: 14px;
    height: 14px;
    color: #f5a623;
}

.role-member-count {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.role-row-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.role-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
}

.role-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Modal ────────────────────────────────────────────────────────────── */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
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

.color-picker-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.color-picker-input {
    width: 3rem;
    height: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    cursor: pointer;
    padding: 0.125rem;
    background: none;
}

.color-preview {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #fff;
}

/* ── Crown toggle ─────────────────────────────────────────────────────── */
.crown-toggle-row {
    padding-top: 0.25rem;
}

.crown-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    cursor: pointer;
    user-select: none;
}

.crown-toggle-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: rgba(0, 0, 0, 0.12);
    border-radius: 999px;
    transition: background 0.2s;
    flex-shrink: 0;
}

.crown-toggle-track.active {
    background: var(--color-accent, #73c3fe);
}

.crown-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.crown-toggle-track.active .crown-toggle-thumb {
    transform: translateX(16px);
}

.crown-toggle-icon {
    width: 16px;
    height: 16px;
    color: var(--color-text-muted);
    opacity: 0.4;
    transition: color 0.2s, opacity 0.2s;
}

.crown-toggle-icon.active {
    color: #f5a623;
    opacity: 1;
}

.crown-toggle-label {
    font-size: 0.875rem;
    color: var(--color-text-muted);
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}

.mobile .page-header {
    flex-wrap: wrap;
}

.mobile .page-title {
    font-size: 1.375rem;
}

.mobile .member-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem 0;
}

.mobile .member-info {
    width: 100%;
}

.mobile .member-name {
    white-space: normal;
    word-break: break-word;
}

.mobile .member-row-end {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .member-meta {
    text-align: left;
    white-space: normal;
    word-break: break-word;
}

.mobile .member-actions {
    width: 100%;
    flex-wrap: wrap;
}

.mobile .role-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem 0;
}

.mobile .role-info {
    width: 100%;
}

.mobile .role-row-end {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .role-meta {
    text-align: left;
    white-space: normal;
    word-break: break-word;
}

.mobile .role-actions {
    width: 100%;
    flex-wrap: wrap;
}

.mobile .native-select {
    font-size: 0.9375rem;
    padding: 0.625rem 0.75rem;
}
</style>
