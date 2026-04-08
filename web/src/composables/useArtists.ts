import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'

export interface Artist {
    id: string
    name: string
    picture_url: string | null
    address: string | null
    date_of_birth: string | null
    qr_token: string
    is_managed: boolean
    managed_by: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    manager_name: string | null
}

export interface ArtistShow {
    id: string
    artist_id: string
    show_name: string
    show_date: string
    slot_time: string | null
    notes: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface ArtistBooking {
    id: string
    artist_id: string
    label_name: string
    contact_name: string
    contact_email: string | null
    contact_phone: string | null
    venue_location: string | null
    slot_time: string | null
    booking_date: string
    technical_rider: string | null
    gage: number | null
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
    notes: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface ArtistNote {
    id: string
    artist_id: string
    title: string
    content: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

const artists = ref<Artist[]>([])
const loading = ref(false)

async function enrichWithNames<T extends { created_by: string | null; updated_by: string | null; managed_by?: string | null }>(
    rows: T[]
): Promise<(T & { creator_name: string | null; updater_name: string | null; manager_name?: string | null })[]> {
    const userIds = [...new Set(
        rows.flatMap(r => [r.created_by, r.updated_by, ...(('managed_by' in r && r.managed_by) ? [r.managed_by] : [])]).filter((id): id is string => !!id)
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
        ...('managed_by' in r ? { manager_name: r.managed_by ? (profileMap[r.managed_by] ?? null) : null } : {}),
    }))
}

export function useArtists() {
    const managedArtists = computed(() => artists.value.filter(a => a.is_managed))
    const generalArtists = computed(() => artists.value.filter(a => !a.is_managed))

    async function fetchArtists() {
        loading.value = true
        const { data, error } = await supabase
            .from('artists')
            .select('*')
            .order('name', { ascending: true })
        if (error) throw error
        artists.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createArtist(payload: { name: string; is_managed?: boolean; managed_by?: string | null; address?: string | null; date_of_birth?: string | null }): Promise<Artist> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artists')
            .insert({ ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        await fetchArtists()
        return data as Artist
    }

    async function updateArtist(id: string, payload: { name?: string; picture_url?: string | null; is_managed?: boolean; managed_by?: string | null; address?: string | null; date_of_birth?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('artists')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchArtists()
    }

    async function deleteArtist(id: string) {
        const { error } = await supabase.from('artists').delete().eq('id', id)
        if (error) throw error
        artists.value = artists.value.filter(a => a.id !== id)
    }

    async function uploadArtistPicture(file: File, artistId: string): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `artists/${artistId}/picture.${ext}`
        const { error } = await supabase.storage
            .from('artwork')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('artwork').getPublicUrl(path)
        return data.publicUrl
    }

    async function fetchNotes(artistId: string): Promise<ArtistNote[]> {
        const { data, error } = await supabase
            .from('artist_notes')
            .select('*')
            .eq('artist_id', artistId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return enrichWithNames(data ?? [])
    }

    async function createNote(artistId: string, payload: { title: string; content: string }): Promise<ArtistNote> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_notes')
            .insert({ artist_id: artistId, ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        return { ...data, creator_name: null, updater_name: null } as ArtistNote
    }

    async function updateNote(id: string, payload: { title?: string; content?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('artist_notes')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
    }

    async function deleteNote(id: string) {
        const { error } = await supabase.from('artist_notes').delete().eq('id', id)
        if (error) throw error
    }

    async function fetchShows(artistId: string): Promise<ArtistShow[]> {
        const { data, error } = await supabase
            .from('artist_shows')
            .select('*')
            .eq('artist_id', artistId)
            .order('show_date', { ascending: false })
        if (error) throw error
        return enrichWithNames(data ?? [])
    }

    async function createShow(artistId: string, payload: { show_name: string; show_date: string; slot_time?: string | null; notes?: string | null }): Promise<ArtistShow> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_shows')
            .insert({ artist_id: artistId, ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        return { ...data, creator_name: null, updater_name: null } as ArtistShow
    }

    async function updateShow(id: string, payload: { show_name?: string; show_date?: string; slot_time?: string | null; notes?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('artist_shows')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
    }

    async function deleteShow(id: string) {
        const { error } = await supabase.from('artist_shows').delete().eq('id', id)
        if (error) throw error
    }

    async function fetchBookings(artistId: string): Promise<ArtistBooking[]> {
        const { data, error } = await supabase
            .from('artist_bookings')
            .select('*')
            .eq('artist_id', artistId)
            .order('booking_date', { ascending: false })
        if (error) throw error
        return enrichWithNames(data ?? [])
    }

    async function createBooking(artistId: string, payload: {
        label_name: string; contact_name: string; booking_date: string;
        contact_email?: string | null; contact_phone?: string | null;
        venue_location?: string | null; slot_time?: string | null;
        technical_rider?: string | null; gage?: number | null; notes?: string | null;
    }): Promise<ArtistBooking> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_bookings')
            .insert({ artist_id: artistId, ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        return { ...data, creator_name: null, updater_name: null } as ArtistBooking
    }

    async function updateBooking(id: string, payload: {
        label_name?: string; contact_name?: string; booking_date?: string;
        contact_email?: string | null; contact_phone?: string | null;
        venue_location?: string | null; slot_time?: string | null;
        technical_rider?: string | null; gage?: number | null;
        status?: string; notes?: string | null;
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('artist_bookings')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
    }

    async function deleteBooking(id: string) {
        const { error } = await supabase.from('artist_bookings').delete().eq('id', id)
        if (error) throw error
    }

    return {
        artists,
        managedArtists,
        generalArtists,
        loading,
        fetchArtists,
        createArtist,
        updateArtist,
        deleteArtist,
        uploadArtistPicture,
        fetchNotes,
        createNote,
        updateNote,
        deleteNote,
        fetchShows,
        createShow,
        updateShow,
        deleteShow,
        fetchBookings,
        createBooking,
        updateBooking,
        deleteBooking,
    }
}
