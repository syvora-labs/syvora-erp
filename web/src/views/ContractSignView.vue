<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SignatureCanvas from '../components/SignatureCanvas.vue'
import { SyvoraButton, SyvoraCard } from '@syvora/ui'

const route = useRoute()
const token = computed(() => route.params.token as string)

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract`

// State
const loading = ref(true)
const error = ref('')
const contract = ref<any>(null)
const mandatorInfo = ref<any>(null)
const signatories = ref<any[]>([])
const signatures = ref<any[]>([])
const selectedSignatoryId = ref<string | null>(null)
const capturedSvg = ref('')
const signing = ref(false)
const signError = ref('')
const canvasRef = ref<InstanceType<typeof SignatureCanvas> | null>(null)

// Computed helpers
const signedIds = computed(() => new Set(signatures.value.map(s => s.signatory_id)))

const isFullySigned = computed(() => contract.value?.status === 'fully_signed')

// Current signing tier: the lowest signing_order with unsigned signatories
const currentTier = computed(() => {
    const unsigned = signatories.value.filter(s => !signedIds.value.has(s.id))
    if (unsigned.length === 0) return null
    return Math.min(...unsigned.map(s => s.signing_order))
})

// Signatories eligible to sign right now
const pendingSignatories = computed(() => {
    if (currentTier.value === null) return []
    return signatories.value.filter(
        s => s.signing_order === currentTier.value && !signedIds.value.has(s.id)
    )
})

const statusClass = computed(() => {
    const map: Record<string, string> = {
        open: 'badge-warning',
        partially_signed: 'badge-claim',
        fully_signed: 'badge-success',
    }
    return map[contract.value?.status] ?? 'badge-deposit'
})

async function fetchContract() {
    loading.value = true
    error.value = ''
    try {
        const res = await fetch(`${EDGE_FN_URL}?token=${token.value}`)
        if (!res.ok) { error.value = 'Contract not found'; return }
        const data = await res.json()
        if (data.error) { error.value = data.error; return }
        contract.value = data.contract
        mandatorInfo.value = data.mandator
        signatories.value = data.signatories
        signatures.value = data.signatures
    } catch {
        error.value = 'Failed to load contract'
    } finally {
        loading.value = false
    }
}

async function submitSignature() {
    if (!selectedSignatoryId.value || !capturedSvg.value) {
        signError.value = 'Please select your name and provide your signature'
        return
    }
    signing.value = true
    signError.value = ''
    try {
        const res = await fetch(EDGE_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token.value,
                signatory_id: selectedSignatoryId.value,
                signature_svg: capturedSvg.value,
            }),
        })
        const data = await res.json()
        if (!res.ok) { signError.value = data.error ?? 'Failed to sign'; return }
        // Refresh contract state
        await fetchContract()
        selectedSignatoryId.value = null
        capturedSvg.value = ''
        canvasRef.value?.clear()
    } catch {
        signError.value = 'Network error — please try again'
    } finally {
        signing.value = false
    }
}

function clearCanvas() {
    canvasRef.value?.clear()
    capturedSvg.value = ''
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(fetchContract)
</script>

<template>
    <div class="sign-page">
        <!-- Loading -->
        <div v-if="loading" class="sign-loading">
            <p>Loading contract…</p>
        </div>

        <!-- Error / Not Found -->
        <div v-else-if="error" class="sign-error">
            <h2>Contract Not Found</h2>
            <p>{{ error }}</p>
        </div>

        <!-- Contract Content -->
        <div v-else class="sign-content">
            <!-- Header with logo -->
            <div class="sign-header">
                <img v-if="mandatorInfo?.logo_url" :src="mandatorInfo.logo_url" class="sign-logo" alt="Logo" />
                <div>
                    <h1 class="sign-title">{{ contract.title }}</h1>
                    <div class="sign-meta">
                        <span v-if="mandatorInfo?.name" class="sign-label-name">{{ mandatorInfo.name }}</span>
                        <span class="badge" :class="statusClass">{{ contract.status.replace(/_/g, ' ') }}</span>
                    </div>
                </div>
            </div>

            <!-- Fully signed notice -->
            <div v-if="isFullySigned" class="sign-concluded">
                <h2>Contract Fully Signed</h2>
                <p>This contract was concluded on {{ formatDate(contract.concluded_at) }}.</p>
            </div>

            <!-- Contract body -->
            <SyvoraCard class="sign-body-card">
                <pre class="sign-body">{{ contract.body_snapshot }}</pre>
            </SyvoraCard>

            <!-- Signatories -->
            <h2 class="section-title">Signatories</h2>
            <div class="signatories-list">
                <div v-for="s in signatories" :key="s.id" class="sign-signatory" :class="{ 'is-signed': signedIds.has(s.id) }">
                    <div class="sign-signatory-info">
                        <span class="sign-signatory-role">{{ s.display_name }}</span>
                        <span class="sign-signatory-name">{{ s.legal_name }}</span>
                    </div>

                    <!-- Already signed -->
                    <div v-if="signedIds.has(s.id)" class="sign-signatory-status signed">
                        <span class="signed-indicator">Signed</span>
                        <span class="signed-date">{{ formatDate(signatures.find(sig => sig.signatory_id === s.id)?.signed_at) }}</span>
                        <div class="signature-preview" v-html="signatures.find(sig => sig.signatory_id === s.id)?.signature_svg"></div>
                    </div>

                    <!-- Waiting for earlier signatories -->
                    <div v-else-if="currentTier !== null && s.signing_order > currentTier" class="sign-signatory-status waiting">
                        Waiting for previous signatories
                    </div>

                    <!-- Ready to sign (in current tier) -->
                    <div v-else-if="currentTier !== null && s.signing_order === currentTier && !isFullySigned" class="sign-signatory-status ready">
                        <SyvoraButton
                            :variant="selectedSignatoryId === s.id ? 'default' : 'ghost'"
                            size="sm"
                            @click="selectedSignatoryId = s.id"
                        >
                            {{ selectedSignatoryId === s.id ? 'Selected' : 'Select to sign' }}
                        </SyvoraButton>
                    </div>
                </div>
            </div>

            <!-- Signing area (only when someone is selected) -->
            <div v-if="selectedSignatoryId && !isFullySigned" class="signing-area">
                <h3>Sign as: {{ signatories.find(s => s.id === selectedSignatoryId)?.legal_name }}</h3>

                <SignatureCanvas
                    ref="canvasRef"
                    :width="500"
                    :height="200"
                    @update:svg="capturedSvg = $event"
                />

                <div class="signing-actions">
                    <SyvoraButton variant="ghost" @click="clearCanvas">Clear</SyvoraButton>
                    <SyvoraButton :loading="signing" :disabled="!capturedSvg" @click="submitSignature">Sign</SyvoraButton>
                </div>

                <p v-if="signError" class="error-msg">{{ signError }}</p>

                <p class="legal-notice">
                    By clicking "Sign", I confirm that I have read and understood the above contract
                    in its entirety. I agree that my digital handwritten signature constitutes a
                    legally binding signature under Swiss law (Obligationenrecht, OR Art. 14).
                </p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.sign-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
.sign-loading, .sign-error { text-align: center; padding: 4rem 0; color: var(--color-text-muted); }
.sign-error h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.sign-header { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; }
.sign-logo { width: 80px; height: 80px; object-fit: contain; border-radius: var(--radius-sm); }
.sign-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 0.25rem; }
.sign-meta { display: flex; align-items: center; gap: 0.75rem; }
.sign-label-name { font-size: 0.9375rem; color: var(--color-text-muted); }
.sign-concluded { background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: var(--radius-sm); padding: 1.5rem; margin-bottom: 1.5rem; text-align: center; }
.sign-concluded h2 { color: #4ade80; margin: 0 0 0.5rem; }
.sign-body-card { margin-bottom: 2rem; }
.sign-body { white-space: pre-wrap; font-size: 0.875rem; line-height: 1.7; margin: 0; font-family: inherit; }
.section-title { font-size: 1.125rem; font-weight: 700; margin: 0 0 1rem; }
.signatories-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem; }
.sign-signatory { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: rgba(255,255,255,0.6); }
.sign-signatory.is-signed { border-color: rgba(74, 222, 128, 0.4); background: rgba(74, 222, 128, 0.05); }
.sign-signatory-info { display: flex; flex-direction: column; gap: 0.125rem; }
.sign-signatory-role { font-size: 0.8125rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.sign-signatory-name { font-weight: 600; }
.sign-signatory-status { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.signed-indicator { color: #4ade80; font-weight: 600; font-size: 0.875rem; }
.signed-date { font-size: 0.75rem; color: var(--color-text-muted); }
.signature-preview { max-width: 120px; max-height: 60px; }
.signature-preview svg { width: 100%; height: auto; }
.waiting { color: var(--color-text-muted); font-size: 0.8125rem; font-style: italic; }
.signing-area { padding: 1.5rem; border: 2px solid var(--color-accent); border-radius: var(--radius-sm); background: rgba(255,255,255,0.8); }
.signing-area h3 { margin: 0 0 1rem; font-size: 1rem; }
.signing-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
.legal-notice { font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.5; margin-top: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.03); border-radius: var(--radius-sm); }
.error-msg { color: var(--color-error); font-size: 0.875rem; margin-top: 0.5rem; }
</style>
