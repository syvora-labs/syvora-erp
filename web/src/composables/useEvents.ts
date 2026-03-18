import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface LabelEvent {
    id: string
    title: string
    description: string | null
    lineup: string[]
    location: string | null
    event_date: string | null
    artwork_url: string | null
    ticket_link: string | null
    is_draft: boolean
    is_archived: boolean
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

const events = ref<LabelEvent[]>([])
const loading = ref(false)

export function useEvents() {
    const { mandator } = useMandator()

    const activeEvents = computed(() => events.value.filter(e => !e.is_archived))
    const archivedEvents = computed(() => events.value.filter(e => e.is_archived).reverse())

    async function fetchEvents() {
        loading.value = true
        let query = supabase
            .from('events')
            .select('*')
            .order('event_date', { ascending: true, nullsFirst: false })
        if (mandator.value?.id) {
            query = query.eq('mandator_id', mandator.value.id)
        }
        const { data, error } = await query
        if (error) throw error

        const raw = (data ?? []) as Omit<LabelEvent, 'creator_name' | 'updater_name'>[]

        const userIds = [...new Set(
            raw.flatMap(e => [e.created_by, e.updated_by]).filter((id): id is string => !!id)
        )]

        let profileMap: Record<string, string | null> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
        }

        events.value = raw.map(e => ({
            ...e,
            creator_name: e.created_by ? (profileMap[e.created_by] ?? null) : null,
            updater_name: e.updated_by ? (profileMap[e.updated_by] ?? null) : null,
        }))
        loading.value = false
    }

    async function createEvent(payload: {
        title: string
        description?: string | null
        lineup?: string[]
        location?: string | null
        event_date?: string | null
        artwork_url?: string | null
        ticket_link?: string | null
    }): Promise<LabelEvent> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('events')
            .insert({ ...payload, created_by: user?.id, mandator_id: mandator.value?.id, lineup: payload.lineup ?? [] })
            .select()
            .single()
        if (error) throw error
        await fetchEvents()
        return data as LabelEvent
    }

    async function updateEvent(id: string, payload: {
        title?: string
        description?: string | null
        lineup?: string[]
        location?: string | null
        event_date?: string | null
        artwork_url?: string | null
        ticket_link?: string | null
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('events')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function publishEvent(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('events')
            .update({ is_draft: false, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function unpublishEvent(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('events')
            .update({ is_draft: true, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function archiveEvent(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('events')
            .update({ is_archived: true, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function unarchiveEvent(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('events')
            .update({ is_archived: false, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function deleteEvent(id: string) {
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id)
        if (error) throw error
        events.value = events.value.filter(e => e.id !== id)
    }

    async function uploadEventArtwork(file: File, eventId: string): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `events/${eventId}/artwork.${ext}`
        const { error } = await supabase.storage
            .from('artwork')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('artwork').getPublicUrl(path)
        return data.publicUrl
    }

    return {
        events,
        activeEvents,
        archivedEvents,
        loading,
        fetchEvents,
        createEvent,
        updateEvent,
        deleteEvent,
        publishEvent,
        unpublishEvent,
        archiveEvent,
        unarchiveEvent,
        uploadEventArtwork,
    }
}
