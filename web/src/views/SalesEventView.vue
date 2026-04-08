<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvents, type LabelEvent } from '../composables/useEvents'
import {
    useSales,
    type TicketPhase, type TicketOrder,
    type EventSalesSummary, type PhaseFormData,
} from '../composables/useSales'
import {
    SyvoraButton, SyvoraCard, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, SyvoraTabs,
    useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const { fetchEventById } = useEvents()
const {
    phases, orders, tickets, loading,
    fetchPhases, createPhase, updatePhase, deletePhase,
    fetchOrders, fetchTickets,
    fetchEventSalesSummary,
} = useSales()

const event = ref<LabelEvent | null>(null)
const summary = ref<EventSalesSummary | null>(null)
const activeTab = ref<'phases' | 'orders' | 'summary'>('phases')

// Phase modal
const showPhaseModal = ref(false)
const editingPhase = ref<TicketPhase | null>(null)
const savingPhase = ref(false)
const phaseError = ref('')
const phaseForm = ref<PhaseFormData>(getDefaultPhaseForm())

// Order expansion
const expandedOrderId = ref<string | null>(null)

function getDefaultPhaseForm(from?: TicketPhase): PhaseFormData {
    if (from) {
        return {
            name: from.name,
            description: from.description ?? '',
            price: (from.price_cents / 100).toFixed(2),
            currency: from.currency,
            quantity: String(from.quantity),
            sort_order: String(from.sort_order),
            sale_start: from.sale_start ? from.sale_start.slice(0, 16) : '',
            sale_end: from.sale_end ? from.sale_end.slice(0, 16) : '',
            is_active: from.is_active,
        }
    }
    return {
        name: '', description: '', price: '', currency: 'chf',
        quantity: '', sort_order: '0', sale_start: '', sale_end: '', is_active: true,
    }
}

onMounted(async () => {
    event.value = await fetchEventById(eventId)
    await Promise.all([
        fetchPhases(eventId),
        fetchOrders(eventId),
    ])
    summary.value = await fetchEventSalesSummary(eventId)
})

function openCreatePhase() {
    editingPhase.value = null
    phaseForm.value = getDefaultPhaseForm()
    phaseError.value = ''
    showPhaseModal.value = true
}

function openEditPhase(phase: TicketPhase) {
    editingPhase.value = phase
    phaseForm.value = getDefaultPhaseForm(phase)
    phaseError.value = ''
    showPhaseModal.value = true
}

async function savePhase() {
    if (!phaseForm.value.name.trim()) { phaseError.value = 'Name is required.'; return }
    if (!phaseForm.value.price || isNaN(parseFloat(phaseForm.value.price))) { phaseError.value = 'Valid price is required.'; return }
    if (!phaseForm.value.quantity || isNaN(parseInt(phaseForm.value.quantity, 10))) { phaseError.value = 'Valid quantity is required.'; return }

    savingPhase.value = true
    phaseError.value = ''
    try {
        if (editingPhase.value) {
            await updatePhase(editingPhase.value.id, eventId, phaseForm.value)
        } else {
            await createPhase(eventId, phaseForm.value)
        }
        showPhaseModal.value = false
        summary.value = await fetchEventSalesSummary(eventId)
    } catch (e: any) {
        phaseError.value = e.message ?? 'Failed to save phase.'
    } finally {
        savingPhase.value = false
    }
}

async function handleDeletePhase(phase: TicketPhase) {
    if (phase.sold_count > 0) {
        alert('Cannot delete a phase that has paid tickets.')
        return
    }
    if (!confirm(`Delete phase "${phase.name}"?`)) return
    try {
        await deletePhase(phase.id, eventId)
        summary.value = await fetchEventSalesSummary(eventId)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete phase.')
    }
}

async function toggleExpand(order: TicketOrder) {
    if (expandedOrderId.value === order.id) {
        expandedOrderId.value = null
        return
    }
    expandedOrderId.value = order.id
    await fetchTickets(order.id)
}

function formatCurrency(cents: number, currency: string) {
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    })
}

function formatSaleWindow(start: string | null, end: string | null) {
    const s = start ? new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Now'
    const e = end ? new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Until sold out'
    return `${s} — ${e}`
}

function statusBadgeClass(status: string) {
    switch (status) {
        case 'paid': return 'badge-success'
        case 'pending': return 'badge-warning'
        case 'refunded': return 'badge-refunded'
        case 'expired': return 'badge-archived'
        default: return 'badge-draft'
    }
}

function ticketStatusClass(status: string) {
    switch (status) {
        case 'valid': return 'badge-success'
        case 'checked_in': return 'badge-checked-in'
        case 'cancelled': return 'badge-archived'
        default: return 'badge-draft'
    }
}

const checkInRate = computed(() => {
    if (!summary.value || summary.value.total_sold === 0) return '0%'
    return `${Math.round((summary.value.total_checked_in / summary.value.total_sold) * 100)}%`
})
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <div class="page-header">
            <div>
                <button class="back-btn" @click="router.push('/sales')">← Sales</button>
                <h1 class="page-title">{{ event?.title ?? 'Loading…' }}</h1>
                <p class="page-subtitle">Ticket configuration and order management</p>
            </div>
        </div>

        <SyvoraTabs
            v-model="activeTab"
            :tabs="[
                { key: 'phases', label: 'Ticket Phases', count: phases.length },
                { key: 'orders', label: 'Orders', count: orders.length },
                { key: 'summary', label: 'Summary' },
            ]"
        />

        <div v-if="loading" class="loading-text">Loading…</div>

        <!-- ── Ticket Phases ────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'phases'">
            <div class="section-header">
                <SyvoraButton @click="openCreatePhase">+ Add Phase</SyvoraButton>
            </div>

            <SyvoraEmptyState v-if="phases.length === 0">
                No ticket phases configured. Add your first phase to start selling tickets.
            </SyvoraEmptyState>

            <div v-else class="phases-list">
                <SyvoraCard v-for="phase in phases" :key="phase.id" class="phase-card">
                    <div class="phase-row">
                        <div class="phase-main">
                            <div class="phase-header">
                                <h3 class="phase-name">{{ phase.name }}</h3>
                                <span class="badge" :class="phase.is_active ? 'badge-success' : 'badge-draft'">
                                    {{ phase.is_active ? 'Active' : 'Inactive' }}
                                </span>
                            </div>
                            <p v-if="phase.description" class="phase-desc">{{ phase.description }}</p>
                            <div class="phase-meta">
                                <span>{{ formatCurrency(phase.price_cents, phase.currency) }}</span>
                                <span class="meta-sep">·</span>
                                <span>{{ phase.sold_count }} / {{ phase.quantity }} sold</span>
                                <span class="meta-sep">·</span>
                                <span>{{ phase.remaining }} remaining</span>
                                <span class="meta-sep">·</span>
                                <span>{{ formatSaleWindow(phase.sale_start, phase.sale_end) }}</span>
                            </div>
                        </div>
                        <div class="phase-actions">
                            <SyvoraButton variant="ghost" size="sm" @click="openEditPhase(phase)">Edit</SyvoraButton>
                            <SyvoraButton
                                variant="ghost" size="sm" class="btn-danger"
                                :disabled="phase.sold_count > 0"
                                :title="phase.sold_count > 0 ? 'Cannot delete: has paid tickets' : ''"
                                @click="handleDeletePhase(phase)"
                            >Delete</SyvoraButton>
                        </div>
                    </div>
                </SyvoraCard>
            </div>
        </template>

        <!-- ── Orders ───────────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'orders'">
            <SyvoraEmptyState v-if="orders.length === 0">
                No orders yet. Orders will appear here when tickets are purchased.
            </SyvoraEmptyState>

            <SyvoraCard v-else>
                <div class="orders-table">
                    <div class="orders-header">
                        <span class="col-buyer">Buyer</span>
                        <span class="col-status">Status</span>
                        <span class="col-amount">Amount</span>
                        <span class="col-tickets">Tickets</span>
                        <span class="col-date">Date</span>
                        <span class="col-email">Email</span>
                    </div>
                    <div v-for="order in orders" :key="order.id">
                        <div class="order-row" @click="toggleExpand(order)">
                            <div class="col-buyer">
                                <span class="buyer-name">{{ order.buyer_name }}</span>
                                <span class="buyer-email">{{ order.buyer_email }}</span>
                            </div>
                            <span class="col-status">
                                <span class="badge" :class="statusBadgeClass(order.status)">{{ order.status }}</span>
                            </span>
                            <span class="col-amount">{{ formatCurrency(order.total_cents, order.currency) }}</span>
                            <span class="col-tickets">{{ order.ticket_count }}</span>
                            <span class="col-date">{{ formatDate(order.created_at) }}</span>
                            <span class="col-email">
                                <span v-if="order.email_sent_at" class="badge badge-success">Sent</span>
                                <span v-else class="badge badge-draft">—</span>
                            </span>
                        </div>
                        <div v-if="expandedOrderId === order.id" class="order-tickets">
                            <div v-for="ticket in tickets" :key="ticket.id" class="ticket-row">
                                <span class="ticket-phase">{{ ticket.phase_name }}</span>
                                <span class="ticket-qr" :title="ticket.qr_token">{{ ticket.qr_token.slice(0, 8) }}…</span>
                                <span class="badge" :class="ticketStatusClass(ticket.status)">{{ ticket.status.replace('_', ' ') }}</span>
                                <span v-if="ticket.checked_in_at" class="ticket-checkin">{{ formatDate(ticket.checked_in_at) }}</span>
                            </div>
                            <div v-if="tickets.length === 0" class="ticket-row ticket-row--empty">No tickets in this order.</div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
        </template>

        <!-- ── Summary ──────────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'summary'">
            <div v-if="!summary" class="loading-text">Loading summary…</div>
            <template v-else>
                <div class="summary-grid">
                    <SyvoraCard class="summary-stat">
                        <span class="summary-value">{{ formatCurrency(summary.total_revenue, summary.currency) }}</span>
                        <span class="summary-label">Total Revenue</span>
                    </SyvoraCard>
                    <SyvoraCard class="summary-stat">
                        <span class="summary-value">{{ summary.total_sold }}</span>
                        <span class="summary-label">Tickets Sold</span>
                    </SyvoraCard>
                    <SyvoraCard class="summary-stat">
                        <span class="summary-value">{{ summary.total_checked_in }}</span>
                        <span class="summary-label">Checked In</span>
                    </SyvoraCard>
                    <SyvoraCard class="summary-stat">
                        <span class="summary-value">{{ checkInRate }}</span>
                        <span class="summary-label">Check-in Rate</span>
                    </SyvoraCard>
                </div>

                <h3 class="section-title">Per-phase Breakdown</h3>
                <SyvoraEmptyState v-if="summary.phases.length === 0">
                    No phases configured.
                </SyvoraEmptyState>
                <SyvoraCard v-else>
                    <div class="phase-breakdown">
                        <div v-for="p in summary.phases" :key="p.id" class="breakdown-row">
                            <span class="breakdown-name">{{ p.name }}</span>
                            <span class="breakdown-sold">{{ p.sold_count }} / {{ p.quantity }}</span>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill" :style="{ width: `${p.quantity > 0 ? (p.sold_count / p.quantity * 100) : 0}%` }"></div>
                            </div>
                            <span class="breakdown-revenue">{{ formatCurrency(p.revenue, summary.currency) }}</span>
                        </div>
                    </div>
                </SyvoraCard>
            </template>
        </template>
    </div>

    <!-- Phase Modal -->
    <SyvoraModal v-if="showPhaseModal" :title="editingPhase ? 'Edit Phase' : 'Add Phase'" size="sm" @close="showPhaseModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Phase Name" for="ph-name">
                <SyvoraInput id="ph-name" v-model="phaseForm.name" placeholder="e.g. Early Bird, Regular, Door" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="ph-desc">
                <SyvoraTextarea id="ph-desc" v-model="phaseForm.description" placeholder="Optional description shown to buyers" :rows="2" />
            </SyvoraFormField>

            <div class="form-row">
                <SyvoraFormField label="Price" for="ph-price" class="flex-1">
                    <SyvoraInput id="ph-price" v-model="phaseForm.price" type="number" placeholder="25.00" />
                </SyvoraFormField>
                <SyvoraFormField label="Currency" for="ph-currency" class="flex-sm">
                    <SyvoraInput id="ph-currency" v-model="phaseForm.currency" placeholder="chf" />
                </SyvoraFormField>
            </div>

            <div class="form-row">
                <SyvoraFormField label="Quantity" for="ph-qty" class="flex-1">
                    <SyvoraInput id="ph-qty" v-model="phaseForm.quantity" type="number" placeholder="100" />
                </SyvoraFormField>
                <SyvoraFormField label="Sort Order" for="ph-sort" class="flex-sm">
                    <SyvoraInput id="ph-sort" v-model="phaseForm.sort_order" type="number" placeholder="0" />
                </SyvoraFormField>
            </div>

            <div class="form-row">
                <SyvoraFormField label="Sale Start" for="ph-start" class="flex-1">
                    <SyvoraInput id="ph-start" v-model="phaseForm.sale_start" type="datetime-local" />
                </SyvoraFormField>
                <SyvoraFormField label="Sale End" for="ph-end" class="flex-1">
                    <SyvoraInput id="ph-end" v-model="phaseForm.sale_end" type="datetime-local" />
                </SyvoraFormField>
            </div>

            <label class="toggle-row">
                <input type="checkbox" v-model="phaseForm.is_active" />
                <span>Active</span>
            </label>

            <p v-if="phaseError" class="error-msg">{{ phaseError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showPhaseModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingPhase" :disabled="savingPhase" @click="savePhase">
                {{ editingPhase ? 'Save Changes' : 'Add Phase' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; }
.page-header { margin-bottom: 1.5rem; }
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }

.back-btn {
    background: none; border: none; color: var(--color-text-muted); cursor: pointer;
    font-size: 0.8125rem; padding: 0; margin-bottom: 0.5rem; display: block;
}
.back-btn:hover { color: var(--color-text); }

.section-header { display: flex; justify-content: flex-end; margin-bottom: 1rem; }
.section-title { font-size: 1rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }

/* Phases */
.phases-list { display: flex; flex-direction: column; gap: 0.75rem; }
.phase-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.phase-main { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.phase-header { display: flex; align-items: center; gap: 0.5rem; }
.phase-name { font-size: 1rem; font-weight: 700; margin: 0; }
.phase-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }
.phase-meta { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: var(--color-text-muted); flex-wrap: wrap; }
.meta-sep { opacity: 0.4; }
.phase-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }

/* Orders */
.orders-table { font-size: 0.875rem; }
.orders-header {
    display: grid; grid-template-columns: 2fr 1fr 1fr 0.5fr 1.5fr 0.5fr;
    gap: 0.5rem; padding: 0.625rem 0; font-weight: 600; font-size: 0.75rem;
    text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-subtle);
}
.order-row {
    display: grid; grid-template-columns: 2fr 1fr 1fr 0.5fr 1.5fr 0.5fr;
    gap: 0.5rem; padding: 0.75rem 0; align-items: center;
    border-bottom: 1px solid var(--color-border-subtle); cursor: pointer;
}
.order-row:hover { background: rgba(0, 0, 0, 0.02); }
.col-buyer { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.buyer-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.buyer-email { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.order-tickets {
    padding: 0.5rem 0 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background: rgba(0, 0, 0, 0.015);
}
.ticket-row {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.375rem 0; font-size: 0.8125rem;
}
.ticket-row--empty { color: var(--color-text-muted); font-style: italic; }
.ticket-phase { font-weight: 600; min-width: 100px; }
.ticket-qr { font-family: monospace; font-size: 0.75rem; color: var(--color-text-muted); }
.ticket-checkin { font-size: 0.75rem; color: var(--color-text-muted); }

/* Summary */
.summary-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem; margin-bottom: 1rem;
}
.summary-stat { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; text-align: center; }
.summary-value { font-size: 1.5rem; font-weight: 800; }
.summary-label { font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.phase-breakdown { display: flex; flex-direction: column; }
.breakdown-row {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}
.breakdown-row:last-child { border-bottom: none; }
.breakdown-name { font-weight: 600; min-width: 120px; }
.breakdown-sold { font-size: 0.875rem; min-width: 80px; text-align: right; }
.breakdown-bar {
    flex: 1; height: 8px; background: rgba(0, 0, 0, 0.06); border-radius: 4px; overflow: hidden;
}
.breakdown-fill { height: 100%; background: var(--color-accent); border-radius: 4px; transition: width 0.3s; }
.breakdown-revenue { font-size: 0.875rem; font-weight: 600; min-width: 100px; text-align: right; }

/* Modal */
.modal-form { display: flex; flex-direction: column; gap: 1rem; }
.form-row { display: flex; gap: 0.75rem; align-items: flex-end; }
.flex-1 { flex: 1; min-width: 0; }
.flex-sm { flex: 0 0 100px; }
.toggle-row {
    display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; cursor: pointer;
}
.toggle-row input[type="checkbox"] {
    width: 1.125rem; height: 1.125rem; accent-color: var(--color-accent); cursor: pointer;
}

/* Badges */
.badge-success { background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.22); }
.badge-warning { background: rgba(234, 179, 8, 0.1); color: #a16207; border: 1px solid rgba(234, 179, 8, 0.22); }
.badge-draft { background: rgba(100, 100, 100, 0.12); color: rgba(12, 26, 39, 0.55); border: 1px solid rgba(100, 100, 100, 0.2); }
.badge-archived { background: rgba(120, 80, 0, 0.09); color: rgba(120, 80, 0, 0.75); border: 1px solid rgba(120, 80, 0, 0.18); }
.badge-refunded { background: rgba(239, 68, 68, 0.1); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.22); }
.badge-checked-in { background: rgba(115, 195, 254, 0.1); color: var(--color-accent); border: 1px solid rgba(115, 195, 254, 0.22); }

:deep(.btn-danger) { color: var(--color-error); }

.mobile .phase-row { flex-direction: column; align-items: flex-start; }
.mobile .phase-actions { width: 100%; }
.mobile .orders-header { display: none; }
.mobile .order-row {
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
}
.mobile .summary-grid { grid-template-columns: 1fr 1fr; }
.mobile .breakdown-row { flex-wrap: wrap; }
</style>
