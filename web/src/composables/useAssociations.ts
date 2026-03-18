import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface AssociationRole {
    id: string
    name: string
    color: string
    mandator_id: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface AssociationMember {
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    role_id: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    role_name: string | null
    role_color: string | null
}

export interface AssociationMemberNote {
    id: string
    member_id: string
    title: string
    content: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

const members = ref<AssociationMember[]>([])
const roles = ref<AssociationRole[]>([])
const loading = ref(false)
const loadingRoles = ref(false)

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
    const { mandator } = useMandator()

    // ── Roles ────────────────────────────────────────────────────────────────

    async function fetchRoles() {
        loadingRoles.value = true
        let query = supabase
            .from('association_roles')
            .select('*')
            .order('name', { ascending: true })
        if (mandator.value?.id) {
            query = query.eq('mandator_id', mandator.value.id)
        }
        const { data, error } = await query
        if (error) throw error
        roles.value = await enrichWithNames(data ?? [])
        loadingRoles.value = false
    }

    async function createRole(payload: { name: string; color: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_roles')
            .insert({ ...payload, created_by: user?.id, mandator_id: mandator.value?.id })
        if (error) throw error
        await fetchRoles()
    }

    async function updateRole(id: string, payload: { name?: string; color?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_roles')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRoles()
        // Refresh members to reflect role changes
        await fetchMembers()
    }

    async function deleteRole(id: string) {
        const { error } = await supabase.from('association_roles').delete().eq('id', id)
        if (error) throw error
        roles.value = roles.value.filter(r => r.id !== id)
        // Refresh members in case any had this role
        await fetchMembers()
    }

    // ── Members ──────────────────────────────────────────────────────────────

    async function fetchMembers() {
        loading.value = true
        const { data, error } = await supabase
            .from('association_members')
            .select('*, association_roles(name, color)')
            .order('name', { ascending: true })
        if (error) throw error
        const enriched = await enrichWithNames(data ?? [])
        members.value = enriched.map(m => ({
            ...m,
            role_name: (m as any).association_roles?.name ?? null,
            role_color: (m as any).association_roles?.color ?? null,
        }))
        loading.value = false
    }

    async function createMember(payload: { name: string; email?: string | null; phone?: string | null; address?: string | null; role_id?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_members')
            .insert({ ...payload, created_by: user?.id })
        if (error) throw error
        await fetchMembers()
    }

    async function updateMember(id: string, payload: { name?: string; email?: string | null; phone?: string | null; address?: string | null; role_id?: string | null }) {
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

    // ── Member Notes ─────────────────────────────────────────────────────────

    async function fetchMemberNotes(memberId: string): Promise<AssociationMemberNote[]> {
        const { data, error } = await supabase
            .from('association_member_notes')
            .select('*')
            .eq('member_id', memberId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return await enrichWithNames(data ?? [])
    }

    async function createMemberNote(memberId: string, payload: { title: string; content: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_member_notes')
            .insert({ ...payload, member_id: memberId, created_by: user?.id })
        if (error) throw error
    }

    async function updateMemberNote(id: string, payload: { title?: string; content?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('association_member_notes')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
    }

    async function deleteMemberNote(id: string) {
        const { error } = await supabase.from('association_member_notes').delete().eq('id', id)
        if (error) throw error
    }

    return {
        members,
        roles,
        loading,
        loadingRoles,
        fetchMembers,
        createMember,
        updateMember,
        deleteMember,
        fetchRoles,
        createRole,
        updateRole,
        deleteRole,
        fetchMemberNotes,
        createMemberNote,
        updateMemberNote,
        deleteMemberNote,
    }
}
