import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export interface AssociationMember {
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

const members = ref<AssociationMember[]>([])
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

export function useAssociations() {
    async function fetchMembers() {
        loading.value = true
        const { data, error } = await supabase
            .from('association_members')
            .select('*')
            .order('name', { ascending: true })
        if (error) throw error
        members.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createMember(payload: { name: string; email?: string | null; phone?: string | null; address?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_members')
            .insert({ ...payload, created_by: user?.id })
        if (error) throw error
        await fetchMembers()
    }

    async function updateMember(id: string, payload: { name?: string; email?: string | null; phone?: string | null; address?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_members')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchMembers()
    }

    async function deleteMember(id: string) {
        const { error } = await supabase.from('association_members').delete().eq('id', id)
        if (error) throw error
        members.value = members.value.filter(m => m.id !== id)
    }

    return {
        members,
        loading,
        fetchMembers,
        createMember,
        updateMember,
        deleteMember,
    }
}
