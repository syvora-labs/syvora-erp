import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface Meeting {
    id: string
    title: string
    description: string | null
    scheduled_at: string
    mandator_id: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface MeetingMember {
    id: string
    meeting_id: string
    user_id: string
    created_at: string
    display_name: string | null
    username: string | null
}

export interface MeetingNote {
    id: string
    meeting_id: string
    content: string
    created_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
}

export interface MeetingTask {
    id: string
    meeting_id: string
    title: string
    deadline: string | null
    assigned_to: string | null
    completed: boolean
    created_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    assignee_name: string | null
}

export interface MandatorUser {
    id: string
    username: string
    display_name: string | null
}

const meetings = ref<Meeting[]>([])
const loading = ref(false)

async function enrichWithNames<T extends { created_by: string | null; updated_by?: string | null }>(
    rows: T[]
): Promise<(T & { creator_name: string | null; updater_name?: string | null })[]> {
    const userIds = [...new Set(
        rows.flatMap(r => [r.created_by, (r as any).updated_by]).filter((id): id is string => !!id)
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
        updater_name: (r as any).updated_by ? (profileMap[(r as any).updated_by] ?? null) : null,
    }))
}

export function useMeetings() {
    const { mandator } = useMandator()

    async function fetchMeetings() {
        loading.value = true
        const { data, error } = await supabase
            .from('meetings')
            .select('*')
            .order('scheduled_at', { ascending: false })
        if (error) throw error
        meetings.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createMeeting(payload: { title: string; description?: string | null; scheduled_at: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('meetings')
            .insert({
                ...payload,
                mandator_id: mandator.value?.id,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
        await fetchMeetings()
    }

    async function updateMeeting(id: string, payload: { title?: string; description?: string | null; scheduled_at?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('meetings')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchMeetings()
    }

    async function deleteMeeting(id: string) {
        const { error } = await supabase.from('meetings').delete().eq('id', id)
        if (error) throw error
        meetings.value = meetings.value.filter(m => m.id !== id)
    }

    // ── Members ─────────────────────────────────────────────────────────────
    async function fetchMeetingMembers(meetingId: string): Promise<MeetingMember[]> {
        const { data, error } = await supabase
            .from('meeting_members')
            .select('*')
            .eq('meeting_id', meetingId)
            .order('created_at')
        if (error) throw error
        const rows = data ?? []
        const userIds = rows.map(r => r.user_id).filter(Boolean)
        let profileMap: Record<string, { display_name: string | null; username: string }> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name, username')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
        }
        return rows.map(r => ({
            ...r,
            display_name: profileMap[r.user_id]?.display_name ?? null,
            username: profileMap[r.user_id]?.username ?? null,
        }))
    }

    async function addMeetingMember(meetingId: string, userId: string) {
        const { error } = await supabase
            .from('meeting_members')
            .insert({ meeting_id: meetingId, user_id: userId })
        if (error) throw error
    }

    async function removeMeetingMember(meetingId: string, userId: string) {
        const { error } = await supabase
            .from('meeting_members')
            .delete()
            .eq('meeting_id', meetingId)
            .eq('user_id', userId)
        if (error) throw error
    }

    // ── Notes ───────────────────────────────────────────────────────────────
    async function fetchMeetingNotes(meetingId: string): Promise<MeetingNote[]> {
        const { data, error } = await supabase
            .from('meeting_notes')
            .select('*')
            .eq('meeting_id', meetingId)
            .order('created_at')
        if (error) throw error
        const enriched = await enrichWithNames(data ?? [])
        return enriched as MeetingNote[]
    }

    async function createNote(meetingId: string, content: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('meeting_notes')
            .insert({ meeting_id: meetingId, content, created_by: user?.id })
        if (error) throw error
    }

    async function updateNote(noteId: string, content: string) {
        const { error } = await supabase
            .from('meeting_notes')
            .update({ content })
            .eq('id', noteId)
        if (error) throw error
    }

    async function deleteNote(noteId: string) {
        const { error } = await supabase
            .from('meeting_notes')
            .delete()
            .eq('id', noteId)
        if (error) throw error
    }

    // ── Tasks ───────────────────────────────────────────────────────────────
    async function fetchMeetingTasks(meetingId: string): Promise<MeetingTask[]> {
        const { data, error } = await supabase
            .from('meeting_tasks')
            .select('*')
            .eq('meeting_id', meetingId)
            .order('created_at')
        if (error) throw error
        const rows = data ?? []
        // Enrich with creator + assignee names
        const userIds = [...new Set(
            rows.flatMap(r => [r.created_by, r.assigned_to]).filter((id): id is string => !!id)
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
            assignee_name: r.assigned_to ? (profileMap[r.assigned_to] ?? null) : null,
        }))
    }

    async function createTask(meetingId: string, payload: { title: string; deadline?: string | null; assigned_to?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('meeting_tasks')
            .insert({ meeting_id: meetingId, ...payload, created_by: user?.id })
        if (error) throw error
    }

    async function updateTask(taskId: string, payload: { title?: string; deadline?: string | null; assigned_to?: string | null }) {
        const { error } = await supabase
            .from('meeting_tasks')
            .update(payload)
            .eq('id', taskId)
        if (error) throw error
    }

    async function deleteTask(taskId: string) {
        const { error } = await supabase
            .from('meeting_tasks')
            .delete()
            .eq('id', taskId)
        if (error) throw error
    }

    async function toggleTaskCompleted(taskId: string, completed: boolean) {
        const { error } = await supabase
            .from('meeting_tasks')
            .update({ completed })
            .eq('id', taskId)
        if (error) throw error
    }

    // ── Mandator users (for member/task assignment pickers) ─────────────────
    async function fetchMandatorUsers(): Promise<MandatorUser[]> {
        if (!mandator.value) return []
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, display_name')
            .eq('mandator_id', mandator.value.id)
            .order('display_name')
        if (error) throw error
        return (data ?? []) as MandatorUser[]
    }

    return {
        meetings,
        loading,
        fetchMeetings,
        createMeeting,
        updateMeeting,
        deleteMeeting,
        fetchMeetingMembers,
        addMeetingMember,
        removeMeetingMember,
        fetchMeetingNotes,
        createNote,
        updateNote,
        deleteNote,
        fetchMeetingTasks,
        createTask,
        updateTask,
        deleteTask,
        toggleTaskCompleted,
        fetchMandatorUsers,
    }
}
