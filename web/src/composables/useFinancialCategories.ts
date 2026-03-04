import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export interface FinancialCategory {
    id: string
    name: string
    type: 'income' | 'expense' | 'both'
    color: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

const categories = ref<FinancialCategory[]>([])
const loading = ref(false)

async function enrichWithNames<T extends { created_by: string | null; updated_by: string | null }>(
    rows: T[]
): Promise<(T & { creator_name: string | null; updater_name: string | null })[]> {
    const userIds = [...new Set(
        rows.flatMap(r => [r.created_by, r.updated_by]).filter((id): id is string => !!id)
    )]
    let profileMap: Record<string, string | null> = {}
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
    }
    return rows.map(r => ({
        ...r,
        creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
        updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
    }))
}

export function useFinancialCategories() {
    async function fetchCategories() {
        loading.value = true
        const { data, error } = await supabase
            .from('financial_categories')
            .select('*')
            .order('name', { ascending: true })
        if (error) throw error
        categories.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createCategory(payload: { name: string; type: string; color: string }): Promise<FinancialCategory> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('financial_categories')
            .insert({ ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        await fetchCategories()
        return data as FinancialCategory
    }

    async function updateCategory(id: string, payload: { name?: string; type?: string; color?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('financial_categories')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchCategories()
    }

    async function deleteCategory(id: string) {
        const { error } = await supabase.from('financial_categories').delete().eq('id', id)
        if (error) throw error
        categories.value = categories.value.filter(c => c.id !== id)
    }

    return {
        categories,
        loading,
        fetchCategories,
        createCategory,
        updateCategory,
        deleteCategory,
    }
}
