import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface FinancialTransaction {
    id: string
    type: 'income' | 'expense'
    amount: number
    description: string
    category_id: string | null
    event_id: string | null
    release_id: string | null
    transaction_date: string
    is_pending: boolean
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    category_name: string | null
    category_color: string | null
    event_title: string | null
    release_title: string | null
}

const transactions = ref<FinancialTransaction[]>([])
const loading = ref(false)

export function useFinancialTransactions() {
    const { mandator } = useMandator()

    async function fetchTransactions() {
        loading.value = true
        let query = supabase
            .from('financial_transactions')
            .select('*, financial_categories(name, color), events(title), releases(title)')
            .order('transaction_date', { ascending: false })
        if (mandator.value?.id) {
            query = query.eq('mandator_id', mandator.value.id)
        }
        const { data, error } = await query
        if (error) throw error

        const raw = data ?? []

        // Enrich with profile names
        const userIds = [...new Set(
            raw.flatMap((r: any) => [r.created_by, r.updated_by]).filter((id: any): id is string => !!id)
        )]
        let profileMap: Record<string, string | null> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
        }

        transactions.value = raw.map((r: any) => ({
            id: r.id,
            type: r.type,
            amount: Number(r.amount),
            description: r.description,
            category_id: r.category_id,
            event_id: r.event_id,
            release_id: r.release_id,
            transaction_date: r.transaction_date,
            is_pending: r.is_pending ?? false,
            created_by: r.created_by,
            updated_by: r.updated_by,
            created_at: r.created_at,
            updated_at: r.updated_at,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
            category_name: r.financial_categories?.name ?? null,
            category_color: r.financial_categories?.color ?? null,
            event_title: r.events?.title ?? null,
            release_title: r.releases?.title ?? null,
        }))
        loading.value = false
    }

    async function createTransaction(payload: {
        type: string
        amount: number
        description: string
        category_id?: string | null
        event_id?: string | null
        release_id?: string | null
        transaction_date: string
        is_pending?: boolean
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('financial_transactions')
            .insert({
                ...payload,
                category_id: payload.category_id || null,
                event_id: payload.event_id || null,
                release_id: payload.release_id || null,
                created_by: user?.id,
                mandator_id: mandator.value?.id,
            })
            .select()
            .single()
        if (error) throw error
        await fetchTransactions()
        return data
    }

    async function updateTransaction(id: string, payload: {
        type?: string
        amount?: number
        description?: string
        category_id?: string | null
        event_id?: string | null
        release_id?: string | null
        transaction_date?: string
        is_pending?: boolean
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('financial_transactions')
            .update({
                ...payload,
                category_id: payload.category_id !== undefined ? (payload.category_id || null) : undefined,
                event_id: payload.event_id !== undefined ? (payload.event_id || null) : undefined,
                release_id: payload.release_id !== undefined ? (payload.release_id || null) : undefined,
                updated_by: user?.id,
            })
            .eq('id', id)
        if (error) throw error
        await fetchTransactions()
    }

    async function deleteTransaction(id: string) {
        const { error } = await supabase.from('financial_transactions').delete().eq('id', id)
        if (error) throw error
        transactions.value = transactions.value.filter(t => t.id !== id)
    }

    return {
        transactions,
        loading,
        fetchTransactions,
        createTransaction,
        updateTransaction,
        deleteTransaction,
    }
}
