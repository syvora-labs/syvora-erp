<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { marked } from 'marked'
import { useContracts } from '../composables/useContracts'

marked.setOptions({ breaks: true, gfm: true })
import { useArtists } from '../composables/useArtists'
import { useReleases } from '../composables/useReleases'
import type { Contract, ContractSignatory, ContractSignature } from '../composables/useContracts'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
    SyvoraCard, SyvoraStepIndicator,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const {
    contracts, templates, loading, fetchContracts, fetchTemplates,
    createContract, openContract, voidContract, deleteContract, getSigningUrl,
    fetchContractSignatories, fetchContractSignatures,
} = useContracts()
const { artists, fetchArtists } = useArtists()
const { releases, fetchReleases } = useReleases()
// mandator composable used indirectly via useContracts

// Modal state
const showModal = ref(false)
const step = ref(1)
const saving = ref(false)
const error = ref('')

// Step 1: Template selection
const selectedTemplateId = ref<string | null>(null)
const customBody = ref('')

// Step 2: Details
const formTitle = ref('')
const formArtistId = ref('')
const formReleaseId = ref('')
const formEffectiveDate = ref('')
const formTerritory = ref('')
const formTerm = ref('')
const formExclusivity = ref('Exclusive')
const formRoyaltyRate = ref('')
const formAdvance = ref('')

// Step 3: Signatories
const formSignatories = ref<Array<{
    role: string
    display_name: string
    legal_name: string
    address: string
    date_of_birth: string
    email: string
    user_id: string
    signing_order: number
}>>([])

// Detail view
const expandedContractId = ref<string | null>(null)
const detailSignatories = ref<ContractSignatory[]>([])
const detailSignatures = ref<ContractSignature[]>([])

// Copy link toast
const copiedId = ref<string | null>(null)

function getDefaultSignatories() {
    return [
        { role: 'founder', display_name: 'Founder', legal_name: '', address: '', date_of_birth: '', email: '', user_id: '', signing_order: 0 },
        { role: 'ar_manager', display_name: 'A&R Manager', legal_name: '', address: '', date_of_birth: '', email: '', user_id: '', signing_order: 0 },
        { role: 'artist', display_name: 'Artist', legal_name: '', address: '', date_of_birth: '', email: '', user_id: '', signing_order: 1 },
    ]
}

function openCreate(prefillArtistId?: string, prefillReleaseId?: string, prefillReleaseTitle?: string) {
    step.value = 1
    selectedTemplateId.value = null
    customBody.value = ''
    formTitle.value = prefillReleaseTitle ? `Recording Agreement — ${prefillReleaseTitle}` : ''
    formArtistId.value = prefillArtistId ?? ''
    formReleaseId.value = prefillReleaseId ?? ''
    formEffectiveDate.value = ''
    formTerritory.value = ''
    formTerm.value = ''
    formExclusivity.value = 'Exclusive'
    formRoyaltyRate.value = ''
    formAdvance.value = ''
    formSignatories.value = getDefaultSignatories()
    error.value = ''
    showModal.value = true
}

function openCreateFromRelease(releaseId: string, artistId: string | null, releaseTitle: string, releaseArtist: string) {
    let resolvedArtistId = artistId
    if (!resolvedArtistId) {
        const match = artists.value.find(a => a.name.toLowerCase() === releaseArtist.toLowerCase())
        resolvedArtistId = match?.id ?? null
    }
    openCreate(resolvedArtistId ?? '', releaseId, releaseTitle)
}

watch(formArtistId, (id) => {
    if (!id) return
    const artist = artists.value.find(a => a.id === id)
    if (!artist) return
    const artistRow = formSignatories.value.find(s => s.role === 'artist')
    if (artistRow) {
        artistRow.legal_name = artist.name
        artistRow.address = (artist as any).address ?? ''
        artistRow.date_of_birth = (artist as any).date_of_birth ?? ''
    }
})

async function saveContract() {
    if (!formTitle.value.trim()) { error.value = 'Title is required.'; return }
    if (!formArtistId.value) { error.value = 'Artist is required.'; return }
    if (formSignatories.value.length === 0) { error.value = 'At least one signatory is required.'; return }

    saving.value = true
    error.value = ''
    try {
        const selectedTemplate = templates.value.find(t => t.id === selectedTemplateId.value)
        await createContract({
            template_id: selectedTemplateId.value,
            artist_id: formArtistId.value,
            release_id: formReleaseId.value || null,
            title: formTitle.value.trim(),
            body_snapshot: selectedTemplate?.body ?? customBody.value,
            effective_date: formEffectiveDate.value || null,
            territory: formTerritory.value || null,
            term: formTerm.value || null,
            exclusivity: formExclusivity.value || null,
            royalty_rate: formRoyaltyRate.value || null,
            advance: formAdvance.value || null,
            signatories: formSignatories.value.filter(s => s.legal_name.trim()),
        })
        showModal.value = false
    } catch (e: any) {
        error.value = e.message ?? 'Failed to create contract.'
    } finally {
        saving.value = false
    }
}

async function handleOpen(c: Contract) {
    if (!confirm('Open this contract for signing? The contract body will be locked.')) return
    try { await openContract(c.id) } catch (e: any) { alert(e.message) }
}

async function handleVoid(c: Contract) {
    if (!confirm(`Void contract "${c.title}"?`)) return
    try { await voidContract(c.id) } catch (e: any) { alert(e.message) }
}

async function handleDelete(c: Contract) {
    if (!confirm(`Permanently delete voided contract "${c.title}"? This cannot be undone.`)) return
    try { await deleteContract(c.id) } catch (e: any) { alert(e.message) }
}

async function copySigningLink(c: Contract) {
    const url = window.location.origin + getSigningUrl(c)
    await navigator.clipboard.writeText(url)
    copiedId.value = c.id
    setTimeout(() => { if (copiedId.value === c.id) copiedId.value = null }, 2000)
}

async function toggleDetail(c: Contract) {
    if (expandedContractId.value === c.id) {
        expandedContractId.value = null
        return
    }
    expandedContractId.value = c.id
    detailSignatories.value = await fetchContractSignatories(c.id)
    detailSignatures.value = await fetchContractSignatures(c.id)
}

function addSignatory() {
    formSignatories.value.push({
        role: 'custom', display_name: '', legal_name: '', address: '',
        date_of_birth: '', email: '', user_id: '', signing_order: 0,
    })
}

function removeSignatory(index: number) {
    formSignatories.value.splice(index, 1)
}

function statusVariant(status: string): string {
    const map: Record<string, string> = {
        draft: 'badge-deposit', open: 'badge-warning',
        partially_signed: 'badge-claim', fully_signed: 'badge-success',
        voided: 'badge-disabled',
    }
    return map[status] ?? 'badge-deposit'
}

function renderMarkdown(content: string): string {
    return marked.parse(content) as string
}

function formatDate(d: string | null): string {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

onMounted(async () => {
    await Promise.all([fetchContracts(), fetchTemplates(), fetchArtists(), fetchReleases()])
    const q = route.query
    if (q.releaseId) {
        openCreateFromRelease(
            q.releaseId as string,
            (q.artistId as string) ?? null,
            (q.releaseTitle as string) ?? '',
            (q.releaseArtist as string) ?? ''
        )
        router.replace({ query: {} })
    }
})
</script>

<template>
    <div class="page">
        <!-- Header -->
        <div class="page-header">
            <div>
                <h1 class="page-title">Contracts</h1>
                <p class="page-subtitle">Manage artist-label contracts and collect signatures</p>
            </div>
            <div class="page-header-actions">
                <RouterLink to="/contracts/templates" class="templates-link">
                    <SyvoraButton variant="ghost">Templates</SyvoraButton>
                </RouterLink>
                <SyvoraButton @click="openCreate()">+ New Contract</SyvoraButton>
            </div>
        </div>

        <!-- Loading / Empty -->
        <div v-if="loading" class="loading-text">Loading contracts…</div>
        <SyvoraEmptyState v-else-if="contracts.length === 0">No contracts yet.</SyvoraEmptyState>

        <!-- Contract list -->
        <div v-else class="contract-list">
            <SyvoraCard v-for="c in contracts" :key="c.id" class="contract-card">
                <div class="contract-header">
                    <div class="contract-info">
                        <h3 class="contract-title">{{ c.title }}</h3>
                        <div class="contract-meta">
                            <span class="badge" :class="statusVariant(c.status)">{{ c.status.replace(/_/g, ' ') }}</span>
                            <span v-if="c.artist_name" class="contract-artist">{{ c.artist_name }}</span>
                            <span v-if="c.release_title" class="contract-release">· {{ c.release_title }}</span>
                            <span class="contract-progress">{{ c.signature_count }} / {{ c.signatory_count }} signed</span>
                            <span class="contract-date">{{ formatDate(c.created_at) }}</span>
                        </div>
                    </div>
                    <div class="contract-actions">
                        <SyvoraButton v-if="c.status === 'draft'" variant="ghost" size="sm" @click="handleOpen(c)">Open</SyvoraButton>
                        <SyvoraButton v-if="c.status !== 'draft' && c.status !== 'voided'" variant="ghost" size="sm" @click="copySigningLink(c)">
                            {{ copiedId === c.id ? 'Copied!' : 'Copy Link' }}
                        </SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" @click="toggleDetail(c)">
                            {{ expandedContractId === c.id ? 'Hide' : 'View' }}
                        </SyvoraButton>
                        <SyvoraButton v-if="c.status !== 'fully_signed' && c.status !== 'voided'" variant="ghost" size="sm" class="btn-danger" @click="handleVoid(c)">Void</SyvoraButton>
                        <SyvoraButton v-if="c.status === 'voided'" variant="ghost" size="sm" class="btn-danger" @click="handleDelete(c)">Delete</SyvoraButton>
                    </div>
                </div>

                <!-- Expanded detail -->
                <div v-if="expandedContractId === c.id" class="contract-detail">
                    <div class="detail-body">
                        <h4>Contract Body</h4>
                        <div class="body-text markdown-body" v-html="renderMarkdown(c.body_snapshot)"></div>
                    </div>
                    <div class="detail-signatories">
                        <h4>Signatories</h4>
                        <div v-for="s in detailSignatories" :key="s.id" class="signatory-row">
                            <span class="signatory-role">{{ s.display_name }}</span>
                            <span class="signatory-name">{{ s.legal_name }}</span>
                            <span v-if="detailSignatures.find(sig => sig.signatory_id === s.id)" class="signatory-signed">
                                Signed {{ formatDate(detailSignatures.find(sig => sig.signatory_id === s.id)!.signed_at) }}
                            </span>
                            <span v-else class="signatory-pending">Pending</span>
                        </div>
                    </div>
                    <div v-if="c.concluded_at" class="detail-concluded">
                        Contract concluded on {{ formatDate(c.concluded_at) }}
                    </div>
                </div>
            </SyvoraCard>
        </div>
    </div>

    <!-- Multi-step creation modal -->
    <SyvoraModal v-if="showModal" title="New Contract" size="lg" class="modal-wide" @close="showModal = false">
        <SyvoraStepIndicator :steps="['Template', 'Details', 'Signatories']" :active-step="step - 1" />

        <!-- Step 1: Template -->
        <div v-if="step === 1" class="modal-form">
            <SyvoraFormField label="Template">
                <select class="native-select" v-model="selectedTemplateId">
                    <option :value="null">Start from scratch</option>
                    <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
            </SyvoraFormField>
            <SyvoraFormField v-if="!selectedTemplateId" label="Custom Contract Body">
                <SyvoraTextarea v-model="customBody" :rows="12" placeholder="Enter contract text with {{placeholders}}..." />
            </SyvoraFormField>
            <div v-else class="template-preview">
                <p class="preview-label">Template preview:</p>
                <div class="preview-text markdown-body" v-html="renderMarkdown((templates.find(t => t.id === selectedTemplateId)?.body?.substring(0, 500) ?? '') + '...')"></div>
            </div>
        </div>

        <!-- Step 2: Details -->
        <div v-if="step === 2" class="modal-form">
            <SyvoraFormField label="Title *" for="c-title">
                <SyvoraInput id="c-title" v-model="formTitle" placeholder="e.g. Recording Agreement — Album Name" />
            </SyvoraFormField>
            <div class="form-row">
                <SyvoraFormField label="Artist *" for="c-artist" class="flex-1">
                    <select id="c-artist" class="native-select" v-model="formArtistId">
                        <option value="">Select artist…</option>
                        <option v-for="a in artists" :key="a.id" :value="a.id">{{ a.name }}</option>
                    </select>
                </SyvoraFormField>
                <SyvoraFormField label="Release" for="c-release" class="flex-1">
                    <select id="c-release" class="native-select" v-model="formReleaseId">
                        <option value="">None</option>
                        <option v-for="r in releases" :key="r.id" :value="r.id">{{ r.title }} ({{ r.artist }})</option>
                    </select>
                </SyvoraFormField>
            </div>
            <p class="required-hint">* Required fields. All other fields are optional and will be used to fill template placeholders.</p>
            <div class="form-row">
                <SyvoraFormField label="Effective Date" for="c-date" class="flex-1">
                    <SyvoraInput id="c-date" v-model="formEffectiveDate" type="date" />
                </SyvoraFormField>
                <SyvoraFormField label="Territory" for="c-territory" class="flex-1">
                    <SyvoraInput id="c-territory" v-model="formTerritory" placeholder="e.g. Worldwide" />
                </SyvoraFormField>
            </div>
            <div class="form-row">
                <SyvoraFormField label="Term" for="c-term" class="flex-1">
                    <SyvoraInput id="c-term" v-model="formTerm" placeholder="e.g. 3 years" />
                </SyvoraFormField>
                <SyvoraFormField label="Exclusivity" for="c-excl" class="flex-1">
                    <select id="c-excl" class="native-select" v-model="formExclusivity">
                        <option value="Exclusive">Exclusive</option>
                        <option value="Non-exclusive">Non-exclusive</option>
                    </select>
                </SyvoraFormField>
            </div>
            <div class="form-row">
                <SyvoraFormField label="Royalty Rate" for="c-royalty" class="flex-1">
                    <SyvoraInput id="c-royalty" v-model="formRoyaltyRate" placeholder="e.g. 18%" />
                </SyvoraFormField>
                <SyvoraFormField label="Advance" for="c-advance" class="flex-1">
                    <SyvoraInput id="c-advance" v-model="formAdvance" placeholder="e.g. CHF 2 000" />
                </SyvoraFormField>
            </div>
        </div>

        <!-- Step 3: Signatories -->
        <div v-if="step === 3" class="modal-form">
            <div v-for="(s, i) in formSignatories" :key="i" class="signatory-form-row">
                <div class="signatory-form-header">
                    <span class="signatory-form-label">{{ s.display_name || `Signatory ${i + 1}` }}</span>
                    <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="removeSignatory(i)">Remove</SyvoraButton>
                </div>
                <div class="form-row">
                    <SyvoraFormField label="Role Label *" class="flex-1">
                        <SyvoraInput v-model="s.display_name" placeholder="e.g. Founder" />
                    </SyvoraFormField>
                    <SyvoraFormField label="Signing Order" class="signing-order-field">
                        <input class="native-select" v-model.number="s.signing_order" type="number" min="0" style="width:100%;padding:0.75rem 1rem" />
                    </SyvoraFormField>
                </div>
                <div class="form-row">
                    <SyvoraFormField label="Legal Name *" class="flex-1">
                        <SyvoraInput v-model="s.legal_name" placeholder="Full legal name" />
                    </SyvoraFormField>
                    <SyvoraFormField label="Email" class="flex-1">
                        <SyvoraInput v-model="s.email" type="email" placeholder="Optional" />
                    </SyvoraFormField>
                </div>
                <SyvoraFormField label="Address *">
                    <SyvoraTextarea v-model="s.address" :rows="2" placeholder="Postal address" />
                </SyvoraFormField>
                <SyvoraFormField label="Date of Birth">
                    <SyvoraInput v-model="s.date_of_birth" type="date" />
                </SyvoraFormField>
            </div>
            <SyvoraButton variant="ghost" @click="addSignatory">+ Add Signatory</SyvoraButton>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showModal = false">Cancel</SyvoraButton>
            <SyvoraButton v-if="step > 1" variant="ghost" @click="step--">Back</SyvoraButton>
            <SyvoraButton v-if="step < 3" @click="step++">Next</SyvoraButton>
            <SyvoraButton v-if="step === 3" :loading="saving" @click="saveContract">Create Contract</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; }
.page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 2rem; gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }

.page-header-actions { display: flex; gap: 0.75rem; align-items: center; }
.templates-link { text-decoration: none; }

.modal-wide :deep(.syvora-modal--lg) { max-width: 840px; }

.required-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
    padding: 0.25rem 0 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

/* ── Contract list ────────────────────────────────────────────────────────── */
.contract-list { display: flex; flex-direction: column; gap: 1rem; }

.contract-card { /* SyvoraCard handles base styles */ }

.contract-header {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;
}

.contract-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }

.contract-title { font-size: 1rem; font-weight: 600; margin: 0; }

.contract-meta {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    font-size: 0.8125rem; color: var(--color-text-muted);
}

.contract-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }

/* ── Contract detail ──────────────────────────────────────────────────────── */
.contract-detail {
    padding-top: 1rem;
    border-top: 1px solid var(--color-border-subtle);
    margin-top: 1rem;
}

.detail-body h4,
.detail-signatories h4 { font-size: 0.875rem; font-weight: 600; margin: 0 0 0.5rem; }

.detail-signatories { margin-top: 1rem; }

.body-text {
    font-size: 0.8125rem; max-height: 400px; overflow-y: auto;
    background: rgba(0, 0, 0, 0.03); padding: 1rem; border-radius: var(--radius-sm);
    margin: 0; line-height: 1.6;
}
.body-text :deep(h1) { font-size: 1.125rem; margin: 1rem 0 0.5rem; }
.body-text :deep(h2) { font-size: 1rem; margin: 0.75rem 0 0.375rem; }
.body-text :deep(h3) { font-size: 0.9375rem; margin: 0.625rem 0 0.375rem; }
.body-text :deep(p) { margin: 0 0 0.5rem; }
.body-text :deep(ul), .body-text :deep(ol) { margin: 0 0 0.5rem; padding-left: 1.25rem; }
.body-text :deep(hr) { border: none; border-top: 1px solid var(--color-border-subtle); margin: 0.75rem 0; }

.signatory-row {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.5rem 0; border-bottom: 1px solid var(--color-border-subtle);
}

.signatory-role { font-size: 0.8125rem; font-weight: 600; min-width: 100px; }
.signatory-name { font-size: 0.8125rem; flex: 1; }
.signatory-signed { font-size: 0.8125rem; color: var(--color-success, #4ade80); }
.signatory-pending { font-size: 0.8125rem; color: var(--color-text-muted); }

.detail-concluded {
    font-weight: 600; color: var(--color-success, #4ade80); margin-top: 0.75rem;
    font-size: 0.875rem;
}

/* ── Modal form ───────────────────────────────────────────────────────────── */
.modal-form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.25rem; }

.form-row { display: flex; gap: 1rem; }
.flex-1 { flex: 1; }

.native-select {
    width: 100%; padding: 0.5rem 0.75rem;
    background: var(--color-surface-raised, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    color: inherit; font-size: 0.9375rem; appearance: auto;
}

/* ── Template preview ─────────────────────────────────────────────────────── */
.template-preview { display: flex; flex-direction: column; gap: 0.375rem; }
.preview-label { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }
.preview-text {
    background: rgba(0, 0, 0, 0.03); padding: 0.75rem; border-radius: var(--radius-sm);
    font-size: 0.8125rem; white-space: pre-wrap; margin: 0; max-height: 200px; overflow-y: auto;
}

/* ── Signatory form rows ──────────────────────────────────────────────────── */
.signatory-form-row {
    padding: 1rem; border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm); margin-bottom: 0.75rem;
    display: flex; flex-direction: column; gap: 0.75rem;
}

.signatory-form-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;
}

.signatory-form-label { font-size: 0.9375rem; font-weight: 600; }

.signing-order-field { max-width: 100px; }

/* ── Misc ─────────────────────────────────────────────────────────────────── */
.error-msg { color: var(--color-error, #f87171); font-size: 0.875rem; margin: 0.5rem 0 0; }

.btn-danger { color: var(--color-error, #f87171) !important; }
</style>
