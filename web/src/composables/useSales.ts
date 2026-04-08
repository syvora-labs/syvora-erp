import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface TicketPhase {
    id: string
    event_id: string
    mandator_id: string
    name: string
    description: string | null
    price_cents: number
    currency: string
    quantity: number
    sort_order: number
    sale_start: string | null
    sale_end: string | null
    is_active: boolean
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    sold_count: number
    remaining: number
}

export interface TicketOrder {
    id: string
    mandator_id: string
    event_id: string
    buyer_name: string
    buyer_email: string
    buyer_birthdate: string | null
    buyer_country: string | null
    buyer_zipcode: string | null
    buyer_city: string | null
    status: 'pending' | 'paid' | 'refunded' | 'expired'
    total_cents: number
    currency: string
    stripe_checkout_session_id: string | null
    stripe_payment_intent_id: string | null
    paid_at: string | null
    refunded_at: string | null
    email_sent_at: string | null
    created_at: string
    updated_at: string
    ticket_count: number
}

export interface Ticket {
    id: string
    order_id: string
    phase_id: string
    event_id: string
    mandator_id: string
    qr_token: string
    status: 'valid' | 'checked_in' | 'cancelled'
    checked_in_at: string | null
    checked_in_by: string | null
    created_at: string
    phase_name: string
}

export interface EventSalesSummary {
    total_revenue: number
    total_sold: number
    total_checked_in: number
    currency: string
    phases: {
        id: string
        name: string
        quantity: number
        sold_count: number
        remaining: number
        revenue: number
    }[]
}

export interface PhaseFormData {
    name: string
    description: string
    price: string
    currency: string
    quantity: string
    sort_order: string
    sale_start: string
    sale_end: string
    is_active: boolean
}

const phases = ref<TicketPhase[]>([])
const orders = ref<TicketOrder[]>([])
const tickets = ref<Ticket[]>([])
const loading = ref(false)

export function useSales() {
    const { mandator } = useMandator()

    async function fetchPhases(eventId: string) {
        loading.value = true
        try {
            let query = supabase
                .from('ticket_phases')
                .select('*')
                .eq('event_id', eventId)
                .order('sort_order', { ascending: true })
            if (mandator.value?.id) {
                query = query.eq('mandator_id', mandator.value.id)
            }
            const { data, error } = await query
            if (error) throw error

            const raw = (data ?? []) as Omit<TicketPhase, 'sold_count' | 'remaining'>[]

            // Enrich with sold counts via RPC
            const enriched: TicketPhase[] = []
            for (const phase of raw) {
                const { data: countData } = await supabase.rpc('get_phase_sold_count', { p_phase_id: phase.id })
                const sold_count = countData ?? 0
                enriched.push({
                    ...phase,
                    sold_count,
                    remaining: phase.quantity - sold_count,
                })
            }
            phases.value = enriched
        } finally {
            loading.value = false
        }
    }

    async function createPhase(eventId: string, form: PhaseFormData) {
        const { data: { user } } = await supabase.auth.getUser()
        const priceCents = Math.round(parseFloat(form.price) * 100)
        const { error } = await supabase
            .from('ticket_phases')
            .insert({
                event_id: eventId,
                mandator_id: mandator.value?.id,
                name: form.name.trim(),
                description: form.description.trim() || null,
                price_cents: priceCents,
                currency: form.currency || 'chf',
                quantity: parseInt(form.quantity, 10),
                sort_order: parseInt(form.sort_order, 10) || 0,
                sale_start: form.sale_start || null,
                sale_end: form.sale_end || null,
                is_active: form.is_active,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
        await fetchPhases(eventId)
    }

    async function updatePhase(id: string, eventId: string, form: PhaseFormData) {
        const { data: { user } } = await supabase.auth.getUser()
        const priceCents = Math.round(parseFloat(form.price) * 100)
        const { error } = await supabase
            .from('ticket_phases')
            .update({
                name: form.name.trim(),
                description: form.description.trim() || null,
                price_cents: priceCents,
                currency: form.currency || 'chf',
                quantity: parseInt(form.quantity, 10),
                sort_order: parseInt(form.sort_order, 10) || 0,
                sale_start: form.sale_start || null,
                sale_end: form.sale_end || null,
                is_active: form.is_active,
                updated_by: user?.id,
            })
            .eq('id', id)
        if (error) throw error
        await fetchPhases(eventId)
    }

    async function deletePhase(id: string, eventId: string) {
        // Check for paid tickets before deleting
        const phase = phases.value.find(p => p.id === id)
        if (phase && phase.sold_count > 0) {
            throw new Error('Cannot delete a phase that has paid tickets.')
        }
        const { error } = await supabase
            .from('ticket_phases')
            .delete()
            .eq('id', id)
        if (error) throw error
        await fetchPhases(eventId)
    }

    async function fetchOrders(eventId: string) {
        loading.value = true
        try {
            let query = supabase
                .from('ticket_orders')
                .select('*')
                .eq('event_id', eventId)
                .order('created_at', { ascending: false })
            if (mandator.value?.id) {
                query = query.eq('mandator_id', mandator.value.id)
            }
            const { data, error } = await query
            if (error) throw error

            const raw = (data ?? []) as Omit<TicketOrder, 'ticket_count'>[]

            // Get ticket counts per order
            const orderIds = raw.map(o => o.id)
            let ticketCountMap: Record<string, number> = {}
            if (orderIds.length) {
                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('order_id')
                    .in('order_id', orderIds)
                if (ticketData) {
                    for (const t of ticketData) {
                        ticketCountMap[t.order_id] = (ticketCountMap[t.order_id] ?? 0) + 1
                    }
                }
            }

            orders.value = raw.map(o => ({
                ...o,
                ticket_count: ticketCountMap[o.id] ?? 0,
            })) as TicketOrder[]
        } finally {
            loading.value = false
        }
    }

    async function fetchTickets(orderId: string) {
        loading.value = true
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*, ticket_phases(name)')
                .eq('order_id', orderId)
            if (error) throw error

            tickets.value = (data ?? []).map((t: any) => ({
                id: t.id,
                order_id: t.order_id,
                phase_id: t.phase_id,
                event_id: t.event_id,
                mandator_id: t.mandator_id,
                qr_token: t.qr_token,
                status: t.status,
                checked_in_at: t.checked_in_at,
                checked_in_by: t.checked_in_by,
                created_at: t.created_at,
                phase_name: t.ticket_phases?.name ?? '—',
            }))
        } finally {
            loading.value = false
        }
    }

    async function checkInByQrToken(qrToken: string, eventId: string): Promise<{
        success: boolean
        message: string
        ticket?: Ticket
        buyerName?: string
    }> {
        // Find the ticket by qr_token for this event
        const { data: ticketData, error: ticketError } = await supabase
            .from('tickets')
            .select('*, ticket_phases(name), ticket_orders(buyer_name, status)')
            .eq('qr_token', qrToken)
            .eq('event_id', eventId)
            .single()

        if (ticketError || !ticketData) {
            return { success: false, message: 'Ticket not found for this event.' }
        }

        const orderStatus = (ticketData as any).ticket_orders?.status
        if (orderStatus !== 'paid') {
            return { success: false, message: `Order is not paid (status: ${orderStatus}).` }
        }

        if (ticketData.status === 'checked_in') {
            const checkedAt = ticketData.checked_in_at
                ? new Date(ticketData.checked_in_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
                : 'earlier'
            return {
                success: false,
                message: `Already checked in at ${checkedAt}.`,
                buyerName: (ticketData as any).ticket_orders?.buyer_name,
            }
        }

        if (ticketData.status === 'cancelled') {
            return { success: false, message: 'This ticket has been cancelled.' }
        }

        // Mark as checked in
        const { data: { user } } = await supabase.auth.getUser()
        const { error: updateError } = await supabase
            .from('tickets')
            .update({
                status: 'checked_in',
                checked_in_at: new Date().toISOString(),
                checked_in_by: user?.id,
            })
            .eq('id', ticketData.id)

        if (updateError) {
            return { success: false, message: 'Failed to check in ticket.' }
        }

        return {
            success: true,
            message: 'Checked in successfully!',
            buyerName: (ticketData as any).ticket_orders?.buyer_name,
            ticket: {
                id: ticketData.id,
                order_id: ticketData.order_id,
                phase_id: ticketData.phase_id,
                event_id: ticketData.event_id,
                mandator_id: ticketData.mandator_id,
                qr_token: ticketData.qr_token,
                status: 'checked_in',
                checked_in_at: new Date().toISOString(),
                checked_in_by: user?.id ?? null,
                created_at: ticketData.created_at,
                phase_name: (ticketData as any).ticket_phases?.name ?? '—',
            },
        }
    }

    async function fetchEventSalesSummary(eventId: string): Promise<EventSalesSummary> {
        // Fetch phases for the event
        let query = supabase
            .from('ticket_phases')
            .select('*')
            .eq('event_id', eventId)
            .order('sort_order', { ascending: true })
        if (mandator.value?.id) {
            query = query.eq('mandator_id', mandator.value.id)
        }
        const { data: phaseData } = await query

        const rawPhases = phaseData ?? []
        let totalRevenue = 0
        let totalSold = 0
        let totalCheckedIn = 0
        let currency = 'chf'
        const phaseSummaries: EventSalesSummary['phases'] = []

        for (const phase of rawPhases) {
            const { data: countData } = await supabase.rpc('get_phase_sold_count', { p_phase_id: phase.id })
            const soldCount = countData ?? 0
            const revenue = soldCount * phase.price_cents
            totalRevenue += revenue
            totalSold += soldCount
            currency = phase.currency

            phaseSummaries.push({
                id: phase.id,
                name: phase.name,
                quantity: phase.quantity,
                sold_count: soldCount,
                remaining: phase.quantity - soldCount,
                revenue,
            })
        }

        // Get checked-in count
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'checked_in')
        totalCheckedIn = count ?? 0

        return {
            total_revenue: totalRevenue,
            total_sold: totalSold,
            total_checked_in: totalCheckedIn,
            currency,
            phases: phaseSummaries,
        }
    }

    return {
        phases,
        orders,
        tickets,
        loading,
        fetchPhases,
        createPhase,
        updatePhase,
        deletePhase,
        fetchOrders,
        fetchTickets,
        checkInByQrToken,
        fetchEventSalesSummary,
    }
}
