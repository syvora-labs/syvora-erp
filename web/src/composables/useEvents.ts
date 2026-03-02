import { ref } from 'vue'
import { supabase } from '../lib/supabase'

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
    created_by: string | null
    created_at: string
    updated_at: string
}

const events = ref<LabelEvent[]>([])
const loading = ref(false)

export function useEvents() {
    async function fetchEvents() {
        loading.value = true
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('event_date', { ascending: true })
        if (error) throw error
        events.value = (data ?? []) as LabelEvent[]
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
            .insert({ ...payload, created_by: user?.id, lineup: payload.lineup ?? [] })
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
        const { error } = await supabase
            .from('events')
            .update(payload)
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function publishEvent(id: string) {
        const { error } = await supabase
            .from('events')
            .update({ is_draft: false })
            .eq('id', id)
        if (error) throw error
        await fetchEvents()
    }

    async function unpublishEvent(id: string) {
        const { error } = await supabase
            .from('events')
            .update({ is_draft: true })
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
        loading,
        fetchEvents,
        createEvent,
        updateEvent,
        deleteEvent,
        publishEvent,
        unpublishEvent,
        uploadEventArtwork,
    }
}
