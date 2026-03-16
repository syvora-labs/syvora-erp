<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAssociations, type AssociationMember } from '../composables/useAssociations'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()

const { members, loading, fetchMembers, createMember, updateMember, deleteMember } = useAssociations()

const showModal = ref(false)
const editingMember = ref<AssociationMember | null>(null)
const saving = ref(false)
const error = ref('')

const form = ref({ name: '', email: '', phone: '', address: '' })

onMounted(fetchMembers)

function openCreate() {
    editingMember.value = null
    form.value = { name: '', email: '', phone: '', address: '' }
    error.value = ''
    showModal.value = true
}

function openEdit(member: AssociationMember) {
    editingMember.value = member
    form.value = {
        name: member.name,
        email: member.email ?? '',
        phone: member.phone ?? '',
        address: member.address ?? '',
    }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingMember.value = null
}

async function saveMember() {
    if (!form.value.name.trim()) {
        error.value = 'Name is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            name: form.value.name.trim(),
            email: form.value.email.trim() || null,
            phone: form.value.phone.trim() || null,
            address: form.value.address.trim() || null,
        }
        if (editingMember.value) {
            await updateMember(editingMember.value.id, payload)
        } else {
            await createMember(payload)
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save member.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(member: AssociationMember) {
    if (!confirm(`Delete "${member.name}"? This cannot be undone.`)) return
    try {
        await deleteMember(member.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete member.')
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
                <p class="page-subtitle">Manage club members</p>
            </div>
            <SyvoraButton @click="openCreate">+ New Member</SyvoraButton>
        </div>

        <div v-if="loading" class="loading-text">Loading members…</div>

        <SyvoraEmptyState v-else-if="members.length === 0" title="No members yet" description="Add your first club member to get started." />

        <SyvoraCard v-else>
            <div class="member-list">
                <div v-for="member in members" :key="member.id" class="member-row">
                    <div class="member-avatar">
                        <span>{{ member.name.charAt(0).toUpperCase() }}</span>
                    </div>
                    <div class="member-info">
                        <span class="member-name">{{ member.name }}</span>
                        <div class="member-details">
                            <span v-if="member.email" class="member-detail">{{ member.email }}</span>
                            <span v-if="member.phone" class="member-detail">{{ member.phone }}</span>
                            <span v-if="member.address" class="member-detail">{{ member.address }}</span>
                        </div>
                    </div>
                    <div class="member-row-end">
                        <div class="member-meta">
                            <span>Created by {{ member.creator_name ?? 'Unknown' }} · {{ formatDate(member.created_at) }}</span>
                            <span v-if="member.updater_name"> · Updated by {{ member.updater_name }} · {{ formatDate(member.updated_at) }}</span>
                        </div>
                        <div class="member-actions">
                            <SyvoraButton variant="ghost" size="sm" @click="openEdit(member)">Edit</SyvoraButton>
                            <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(member)">Delete</SyvoraButton>
                        </div>
                    </div>
                </div>
            </div>
        </SyvoraCard>
    </div>

    <SyvoraModal v-if="showModal" :title="editingMember ? 'Edit Member' : 'New Member'" size="sm" @close="closeModal">
        <div class="modal-form">
            <SyvoraFormField label="Name" for="am-name">
                <SyvoraInput id="am-name" v-model="form.name" placeholder="Full name" />
            </SyvoraFormField>

            <SyvoraFormField label="Email" for="am-email">
                <SyvoraInput id="am-email" v-model="form.email" type="email" placeholder="email@example.com" />
            </SyvoraFormField>

            <SyvoraFormField label="Phone" for="am-phone">
                <SyvoraInput id="am-phone" v-model="form.phone" type="tel" placeholder="+1 234 567 890" />
            </SyvoraFormField>

            <SyvoraFormField label="Address" for="am-address">
                <SyvoraInput id="am-address" v-model="form.address" placeholder="Street, City, Country" />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveMember">
                {{ editingMember ? 'Save Changes' : 'Create Member' }}
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    content: '·';
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

/* Modal */
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

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}

.mobile .member-row {
    flex-wrap: wrap;
}

.mobile .member-row-end {
    width: 100%;
    justify-content: space-between;
}

.mobile .member-meta {
    text-align: left;
}
</style>
