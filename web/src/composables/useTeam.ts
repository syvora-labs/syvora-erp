import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

// ── Constants ────────────────────────────────────────────────────────────────

export const GENERAL_ROLES = ['Founder', 'Co-Founder', 'Creative Manager', 'Production'] as const
export const EVENT_ROLES = ['Bar', 'Runner', 'Facility', 'Event Management'] as const

// ── Types ────────────────────────────────────────────────────────────────────

export interface TeamMember {
    id: string
    mandator_id: string
    full_name: string
    image_url: string | null
    general_roles: string[]
    user_id: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface TeamEventAssignment {
    id: string
    team_member_id: string
    event_id: string
    event_role: string
    notes: string | null
    created_by: string | null
    created_at: string
    event_title?: string
    event_date?: string | null
    member_name?: string
    member_image_url?: string | null
}

// ── State ────────────────────────────────────────────────────────────────────

const teamMembers = ref<TeamMember[]>([])
const loading = ref(false)

// ── Composable ───────────────────────────────────────────────────────────────

export function useTeam() {
    const { mandator } = useMandator()

    async function enrichWithNames(
        rows: Omit<TeamMember, 'creator_name' | 'updater_name'>[],
    ): Promise<TeamMember[]> {
        const userIds = [...new Set(
            rows.flatMap((r) => [r.created_by, r.updated_by]).filter((id): id is string => !!id),
        )]
        let profileMap: Record<string, string | null> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))
        }
        return rows.map((r) => ({
            ...r,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
        }))
    }

    async function fetchTeamMembers() {
        loading.value = true
        try {
            let query = supabase
                .from('team_members')
                .select('*')
                .order('full_name')
            if (mandator.value?.id) {
                query = query.eq('mandator_id', mandator.value.id)
            }
            const { data, error } = await query
            if (error) throw error
            const enriched = await enrichWithNames(data ?? [])
            // Sort by highest-priority role (Founder=0, Co-Founder=1, etc.)
            enriched.sort((a, b) => {
                const rankA = Math.min(...a.general_roles.map((r) => GENERAL_ROLES.indexOf(r as any)).filter((i) => i >= 0), GENERAL_ROLES.length)
                const rankB = Math.min(...b.general_roles.map((r) => GENERAL_ROLES.indexOf(r as any)).filter((i) => i >= 0), GENERAL_ROLES.length)
                return rankA !== rankB ? rankA - rankB : a.full_name.localeCompare(b.full_name)
            })
            teamMembers.value = enriched
        } finally {
            loading.value = false
        }
    }

    async function createTeamMember(form: {
        full_name: string
        general_roles: string[]
        image_url?: string | null
        user_id?: string | null
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('team_members')
            .insert({
                full_name: form.full_name,
                general_roles: form.general_roles,
                image_url: form.image_url ?? null,
                user_id: form.user_id ?? null,
                mandator_id: mandator.value?.id,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
        await fetchTeamMembers()
    }

    async function updateTeamMember(id: string, form: {
        full_name?: string
        general_roles?: string[]
        image_url?: string | null
        user_id?: string | null
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('team_members')
            .update({ ...form, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchTeamMembers()
    }

    async function deleteTeamMember(id: string) {
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('id', id)
        if (error) throw error
        teamMembers.value = teamMembers.value.filter((m) => m.id !== id)
    }

    async function uploadTeamMemberImage(file: File, memberId: string): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${mandator.value?.id}/${memberId}/photo.${ext}`
        const { error } = await supabase.storage
            .from('team-photos')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('team-photos').getPublicUrl(path)
        return data.publicUrl
    }

    // ── Event assignments ────────────────────────────────────────────────────

    async function fetchEventAssignments(teamMemberId: string): Promise<TeamEventAssignment[]> {
        const { data, error } = await supabase
            .from('team_event_assignments')
            .select('*, events(title, event_date)')
            .eq('team_member_id', teamMemberId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []).map((row: any) => ({
            id: row.id,
            team_member_id: row.team_member_id,
            event_id: row.event_id,
            event_role: row.event_role,
            notes: row.notes,
            created_by: row.created_by,
            created_at: row.created_at,
            event_title: row.events?.title,
            event_date: row.events?.event_date,
        }))
    }

    async function fetchTeamForEvent(eventId: string): Promise<TeamEventAssignment[]> {
        const { data, error } = await supabase
            .from('team_event_assignments')
            .select('*, team_members(full_name, image_url)')
            .eq('event_id', eventId)
            .order('event_role')
        if (error) throw error
        return (data ?? []).map((row: any) => ({
            id: row.id,
            team_member_id: row.team_member_id,
            event_id: row.event_id,
            event_role: row.event_role,
            notes: row.notes,
            created_by: row.created_by,
            created_at: row.created_at,
            member_name: row.team_members?.full_name,
            member_image_url: row.team_members?.image_url,
        }))
    }

    async function assignToEvent(
        teamMemberId: string,
        eventId: string,
        eventRole: string,
        notes?: string,
    ) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('team_event_assignments')
            .insert({
                team_member_id: teamMemberId,
                event_id: eventId,
                event_role: eventRole,
                notes: notes ?? null,
                created_by: user?.id,
            })
        if (error) throw error
    }

    async function removeEventAssignment(assignmentId: string) {
        const { error } = await supabase
            .from('team_event_assignments')
            .delete()
            .eq('id', assignmentId)
        if (error) throw error
    }

    async function updateEventAssignment(assignmentId: string, form: {
        event_role?: string
        notes?: string | null
    }) {
        const { error } = await supabase
            .from('team_event_assignments')
            .update(form)
            .eq('id', assignmentId)
        if (error) throw error
    }

    return {
        teamMembers,
        loading,
        fetchTeamMembers,
        createTeamMember,
        updateTeamMember,
        deleteTeamMember,
        uploadTeamMemberImage,
        fetchEventAssignments,
        fetchTeamForEvent,
        assignToEvent,
        removeEventAssignment,
        updateEventAssignment,
    }
}
