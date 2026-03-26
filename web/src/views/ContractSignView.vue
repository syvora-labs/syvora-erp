<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import jsPDF from 'jspdf'
import SignatureCanvas from '../components/SignatureCanvas.vue'
import { SyvoraButton, SyvoraCard } from '@syvora/ui'

marked.setOptions({ breaks: true, gfm: true })

const route = useRoute()
const token = computed(() => route.params.token as string)

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
        const res = await fetch(`${EDGE_FN_URL}?token=${token.value}`, {
            headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
        })
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
            headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
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

function renderMarkdown(content: string): string {
    return marked.parse(content) as string
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function exportPdf() {
    if (!contract.value) return

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const PW = 210, PH = 297
    const ML = 22, MR = 22, MT = 28, MB = 22
    const CW = PW - ML - MR
    let y = MT

    // ── Helpers ───────────────────────────────────────────────────────────────

    function checkPage(needed: number) {
        if (y + needed > PH - MB - 14) { doc.addPage(); y = MT }
    }

    function hline(yy: number, r = 180, g = 180, b = 180, lw = 0.15) {
        doc.setDrawColor(r, g, b); doc.setLineWidth(lw)
        doc.line(ML, yy, PW - MR, yy)
        doc.setLineWidth(0.15)
    }

    // Parse inline **bold** segments
    type Seg = { text: string; bold: boolean }
    function parseSegs(raw: string): Seg[] {
        const out: Seg[] = []
        for (const p of raw.split(/(\*\*[^*\n]+\*\*)/)) {
            if (!p) continue
            if (p.startsWith('**') && p.endsWith('**')) {
                out.push({ text: p.slice(2, -2), bold: true })
            } else {
                const c = p.replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
                if (c) out.push({ text: c, bold: false })
            }
        }
        return out
    }

    // Render one paragraph with inline bold, returns height used
    function renderPara(raw: string, x: number, startY: number, maxW: number, fs = 9.5, lh = 5.2): number {
        if (!raw.trim()) return 0
        type W = { text: string; bold: boolean }
        const words: W[] = []
        for (const seg of parseSegs(raw)) {
            for (const t of seg.text.split(/\s+/)) { if (t) words.push({ text: t, bold: seg.bold }) }
        }
        if (!words.length) return 0
        doc.setFontSize(fs)
        // Build lines
        const lines: W[][] = []
        let cur: W[] = [], curW = 0
        for (const w of words) {
            doc.setFont('times', w.bold ? 'bold' : 'normal')
            const ww = doc.getTextWidth(w.text + ' ')
            if (curW + ww > maxW + 0.5 && cur.length) { lines.push(cur); cur = [w]; curW = ww }
            else { cur.push(w); curW += ww }
        }
        if (cur.length) lines.push(cur)
        // Render lines with page-break checks
        let py = startY
        for (const line of lines) {
            if (py > startY) checkPage(lh + 1)
            let px = x
            for (const w of line) {
                doc.setFont('times', w.bold ? 'bold' : 'normal')
                doc.text(w.text, px, py)
                px += doc.getTextWidth(w.text + ' ')
            }
            py += lh
        }
        return lines.length * lh
    }

    // ── Load logo ─────────────────────────────────────────────────────────────
    let logoDataUrl: string | null = null
    if (mandatorInfo.value?.logo_url) {
        try {
            const resp = await fetch(mandatorInfo.value.logo_url)
            const blob = await resp.blob()
            logoDataUrl = await new Promise<string>((res, rej) => {
                const reader = new FileReader()
                reader.onload = () => res(reader.result as string)
                reader.onerror = rej
                reader.readAsDataURL(blob)
            })
        } catch { /* proceed without logo */ }
    }

    // ── Header (first page) ───────────────────────────────────────────────────
    const LOGO_W = 22, LOGO_H = 22
    if (logoDataUrl) {
        doc.addImage(logoDataUrl, PW - MR - LOGO_W, MT, LOGO_W, LOGO_H)
    }

    const titleMaxW = CW - (logoDataUrl ? LOGO_W + 6 : 0)
    doc.setFontSize(17)
    doc.setFont('times', 'bold')
    doc.setTextColor(15, 15, 15)
    const titleLines = doc.splitTextToSize(contract.value.title, titleMaxW) as string[]
    doc.text(titleLines, ML, y)
    y += titleLines.length * 7.5

    if (mandatorInfo.value?.name) {
        doc.setFontSize(9)
        doc.setFont('times', 'normal')
        doc.setTextColor(110, 110, 110)
        doc.text(mandatorInfo.value.name, ML, y)
        y += 5
    }

    if (contract.value.concluded_at) {
        doc.setFontSize(8.5)
        doc.setFont('times', 'normal')
        doc.setTextColor(34, 130, 34)
        doc.text(`Concluded: ${formatDate(contract.value.concluded_at)}`, ML, y)
        y += 5
    }

    if (logoDataUrl) y = Math.max(y, MT + LOGO_H + 5)

    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.55)
    doc.line(ML, y, PW - MR, y)
    doc.setLineWidth(0.15)
    y += 9

    // ── Body ──────────────────────────────────────────────────────────────────
    doc.setTextColor(20, 20, 20)

    for (const rawLine of contract.value.body_snapshot.split('\n')) {
        const line = rawLine.trimEnd()

        if (/^-{3,}$/.test(line.trim())) {
            checkPage(8); y += 2; hline(y, 200, 200, 200); y += 6; continue
        }

        if (line.startsWith('# ')) {
            checkPage(14); y += 4
            doc.setFontSize(13); doc.setFont('times', 'bold'); doc.setTextColor(15, 15, 15)
            const w = doc.splitTextToSize(line.slice(2), CW) as string[]
            doc.text(w, ML, y); y += w.length * 7 + 2; continue
        }

        if (line.startsWith('## ')) {
            checkPage(12); y += 4
            doc.setFontSize(11); doc.setFont('times', 'bold'); doc.setTextColor(25, 25, 25)
            const w = doc.splitTextToSize(line.slice(3), CW) as string[]
            doc.text(w, ML, y); y += w.length * 6 + 2; continue
        }

        if (line.startsWith('### ')) {
            checkPage(10); y += 2
            doc.setFontSize(10); doc.setFont('times', 'bold'); doc.setTextColor(30, 30, 30)
            const w = doc.splitTextToSize(line.slice(4), CW) as string[]
            doc.text(w, ML, y); y += w.length * 5.5 + 1; continue
        }

        if (line.trim() === '') { y += 2.5; continue }

        const listMatch = line.match(/^(\s*)([-*]|\d+\.) (.+)$/)
        if (listMatch) {
            const indent = Math.floor(listMatch[1].length / 2) * 4
            const bx = ML + 4 + indent
            const tx = bx + 5
            const aw = CW - 4 - indent - 5
            const segs = parseSegs(listMatch[3])
            const plain = segs.map(s => s.text).join(' ')
            checkPage((doc.splitTextToSize(plain, aw) as string[]).length * 5.2 + 2)
            doc.setFontSize(9.5); doc.setFont('times', 'normal'); doc.setTextColor(20, 20, 20)
            const bullet = /^\d/.test(listMatch[2]) ? listMatch[2] : '•'
            doc.text(bullet, bx, y)
            const h = renderPara(listMatch[3], tx, y, aw)
            y += Math.max(h, 5.2) + 1; continue
        }

        // Regular paragraph
        doc.setFontSize(9.5); doc.setFont('times', 'normal'); doc.setTextColor(20, 20, 20)
        const segs = parseSegs(line)
        const plain = segs.map(s => s.text).join(' ')
        checkPage((doc.splitTextToSize(plain, CW) as string[]).length * 5.2 + 2)
        y += renderPara(line, ML, y, CW) + 0.8
    }

    // ── Signatures ────────────────────────────────────────────────────────────
    y += 8; checkPage(55)
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.4)
    doc.line(ML, y, PW - MR, y)
    doc.setLineWidth(0.15); y += 9

    doc.setFontSize(11); doc.setFont('times', 'bold'); doc.setTextColor(15, 15, 15)
    doc.text('SIGNATURES', ML, y); y += 10

    for (let idx = 0; idx < signatories.value.length; idx++) {
        const s = signatories.value[idx]
        const sig = signatures.value.find(x => x.signatory_id === s.id)
        checkPage(55)

        // Role label
        doc.setFontSize(7.5); doc.setFont('times', 'bold'); doc.setTextColor(120, 120, 120)
        doc.text(s.display_name.toUpperCase(), ML, y); y += 5

        // Legal name
        doc.setFontSize(10.5); doc.setFont('times', 'bold'); doc.setTextColor(15, 15, 15)
        doc.text(s.legal_name, ML, y); y += 5.5

        // Address
        if (s.address) {
            doc.setFontSize(8.5); doc.setFont('times', 'normal'); doc.setTextColor(80, 80, 80)
            const addrLines = doc.splitTextToSize(s.address, CW * 0.55) as string[]
            doc.text(addrLines, ML, y); y += addrLines.length * 4.5
        }

        y += 2

        if (sig) {
            // Signed date
            doc.setFontSize(8.5); doc.setFont('times', 'normal'); doc.setTextColor(34, 120, 34)
            doc.text(`Signed: ${formatDate(sig.signed_at)}`, ML, y); y += 6

            // Signature image
            try {
                const canvas = document.createElement('canvas')
                canvas.width = 600; canvas.height = 200
                const ctx = canvas.getContext('2d')!
                const img = new Image()
                const blob = new Blob([sig.signature_svg], { type: 'image/svg+xml' })
                const url = URL.createObjectURL(blob)
                await new Promise<void>((resolve) => {
                    img.onload = () => { ctx.drawImage(img, 0, 0, 600, 200); URL.revokeObjectURL(url); resolve() }
                    img.onerror = () => { URL.revokeObjectURL(url); resolve() }
                    img.src = url
                })
                const imgData = canvas.toDataURL('image/png')
                doc.addImage(imgData, 'PNG', ML, y, 72, 24)
                // Underline
                doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3)
                doc.line(ML, y + 24, ML + 72, y + 24)
                doc.setLineWidth(0.15); y += 30
            } catch { y += 8 }
        } else {
            doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(170, 170, 170)
            doc.text('(pending signature)', ML, y); y += 6
            doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.25)
            doc.line(ML, y + 12, ML + 72, y + 12)
            doc.setLineWidth(0.15); y += 20
        }

        y += 4
        if (idx < signatories.value.length - 1) { hline(y, 225, 225, 225); y += 6 }
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const totalPg = doc.getNumberOfPages()
    for (let pg = 1; pg <= totalPg; pg++) {
        doc.setPage(pg)
        hline(PH - MB - 3, 210, 210, 210)
        doc.setFontSize(7.5); doc.setFont('times', 'normal'); doc.setTextColor(155, 155, 155)
        doc.text(contract.value.title, ML, PH - MB + 2)
        if (mandatorInfo.value?.name) {
            doc.text(mandatorInfo.value.name, PW / 2, PH - MB + 2, { align: 'center' })
        }
        doc.text(`${pg} / ${totalPg}`, PW - MR, PH - MB + 2, { align: 'right' })
    }

    doc.save(`${contract.value.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
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
                <SyvoraButton @click="exportPdf" style="margin-top: 0.75rem;">Export PDF</SyvoraButton>
            </div>

            <!-- Contract body -->
            <SyvoraCard class="sign-body-card">
                <div class="sign-body markdown-body" v-html="renderMarkdown(contract.body_snapshot)"></div>
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
                            :variant="selectedSignatoryId === s.id ? 'primary' : 'ghost'"
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
.sign-body { font-size: 0.875rem; line-height: 1.7; margin: 0; }
.sign-body :deep(h1) { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }
.sign-body :deep(h2) { font-size: 1.125rem; margin: 1.25rem 0 0.5rem; }
.sign-body :deep(h3) { font-size: 1rem; margin: 1rem 0 0.5rem; }
.sign-body :deep(p) { margin: 0 0 0.75rem; }
.sign-body :deep(ul), .sign-body :deep(ol) { margin: 0 0 0.75rem; padding-left: 1.5rem; }
.sign-body :deep(hr) { border: none; border-top: 1px solid var(--color-border-subtle); margin: 1rem 0; }
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
