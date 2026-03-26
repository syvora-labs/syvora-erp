<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useContracts, type ContractTemplate } from '../composables/useContracts'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, SyvoraCard,
} from '@syvora/ui'

const { templates, loading, fetchTemplates, createTemplate, updateTemplate, deleteTemplate } = useContracts()

const showModal = ref(false)
const editingTemplate = ref<ContractTemplate | null>(null)
const saving = ref(false)
const error = ref('')
const form = ref({ name: '', body: '', jurisdiction_canton: 'Zurich' })

onMounted(fetchTemplates)

function openCreate() {
    editingTemplate.value = null
    form.value = { name: '', body: '', jurisdiction_canton: 'Zurich' }
    error.value = ''
    showModal.value = true
}

function openEdit(t: ContractTemplate) {
    editingTemplate.value = t
    form.value = {
        name: t.name,
        body: t.body,
        jurisdiction_canton: t.jurisdiction_canton,
    }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingTemplate.value = null
}

async function saveTemplate() {
    if (!form.value.name.trim()) {
        error.value = 'Name is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            name: form.value.name.trim(),
            body: form.value.body,
            jurisdiction_canton: form.value.jurisdiction_canton.trim() || 'Zurich',
        }
        if (editingTemplate.value) {
            await updateTemplate(editingTemplate.value.id, payload)
        } else {
            await createTemplate(payload)
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save template.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(t: ContractTemplate) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
    try {
        await deleteTemplate(t.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete template.')
    }
}

function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Contract Templates</h1>
                <p class="page-subtitle">Create and manage reusable contract templates</p>
            </div>
            <div class="page-header-actions">
                <RouterLink to="/contracts">
                    <SyvoraButton variant="ghost">← Back to Contracts</SyvoraButton>
                </RouterLink>
                <SyvoraButton @click="openCreate">+ New Template</SyvoraButton>
            </div>
        </div>

        <div v-if="loading" class="loading-state">Loading templates…</div>

        <SyvoraEmptyState
            v-else-if="templates.length === 0"
            title="No templates yet"
            description="Create a contract template to reuse when generating artist agreements."
        />

        <SyvoraCard v-else>
            <div class="template-list">
                <div
                    v-for="t in templates"
                    :key="t.id"
                    class="template-row"
                >
                    <div class="template-info">
                        <span class="template-name">{{ t.name }}</span>
                        <div class="template-meta">
                            <span class="badge badge-deposit">{{ t.jurisdiction_canton }}</span>
                            <span class="template-date">Created {{ formatDate(t.created_at) }}</span>
                            <span v-if="t.creator_name" class="template-author">by {{ t.creator_name }}</span>
                        </div>
                    </div>
                    <div class="template-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="openEdit(t)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(t)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </SyvoraCard>

        <SyvoraModal
            v-if="showModal"
            :title="editingTemplate ? 'Edit Template' : 'New Template'"
            size="lg"
            @close="closeModal"
        >
            <div class="modal-form">
                <SyvoraFormField label="Name">
                    <SyvoraInput
                        v-model="form.name"
                        placeholder="e.g. Standard Exclusive Recording Deal"
                    />
                </SyvoraFormField>

                <SyvoraFormField label="Jurisdiction Canton">
                    <SyvoraInput
                        v-model="form.jurisdiction_canton"
                        placeholder="e.g. Zurich"
                    />
                </SyvoraFormField>

                <SyvoraFormField label="Governing Law">
                    <SyvoraInput
                        :model-value="'Swiss law (Obligationenrecht, SR 220)'"
                        disabled
                    />
                </SyvoraFormField>

                <SyvoraFormField label="Contract Body">
                    <SyvoraTextarea
                        v-model="form.body"
                        :rows="16"
                        placeholder="Contract text with {{placeholders}}..."
                        class="monospace-textarea"
                    />
                </SyvoraFormField>

                <p class="placeholder-help">
                    Available placeholders: &#123;&#123;label_name&#125;&#125;, &#123;&#123;label_address&#125;&#125;, &#123;&#123;label_uid&#125;&#125;, &#123;&#123;artist_name&#125;&#125;, &#123;&#123;artist_address&#125;&#125;, &#123;&#123;artist_dob&#125;&#125;, &#123;&#123;contract_date&#125;&#125;, &#123;&#123;effective_date&#125;&#125;, &#123;&#123;territory&#125;&#125;, &#123;&#123;term&#125;&#125;, &#123;&#123;exclusivity&#125;&#125;, &#123;&#123;royalty_rate&#125;&#125;, &#123;&#123;advance&#125;&#125;, &#123;&#123;release_title&#125;&#125;, &#123;&#123;release_type&#125;&#125;, &#123;&#123;jurisdiction_canton&#125;&#125;, &#123;&#123;governing_law&#125;&#125;
                </p>

                <p v-if="error" class="error-msg">{{ error }}</p>
            </div>

            <template #footer>
                <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
                <SyvoraButton :loading="saving" @click="saveTemplate">
                    {{ editingTemplate ? 'Save' : 'Create' }}
                </SyvoraButton>
            </template>
        </SyvoraModal>
    </div>
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
}

.page-title {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 0.25rem;
}

.page-subtitle {
    color: var(--color-text-muted);
    margin: 0;
}

.page-header-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
}

.page-header-actions a {
    text-decoration: none;
}

.loading-state {
    color: var(--color-text-muted);
    padding: 2rem 0;
}

.template-list {
    display: flex;
    flex-direction: column;
}

.template-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.template-row:last-child {
    border-bottom: none;
}

.template-info {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.template-name {
    font-weight: 600;
}

.template-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    align-items: center;
}

.template-actions {
    display: flex;
    gap: 0.375rem;
}

.btn-danger :deep(.btn) {
    color: var(--color-error);
}

.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.monospace-textarea :deep(textarea) {
    font-family: monospace;
    font-size: 0.8125rem;
}

.placeholder-help {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
}

.error-msg {
    color: var(--color-error);
    font-size: 0.875rem;
    margin: 0;
}
</style>
