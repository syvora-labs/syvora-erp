import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export type ReleaseType = 'album' | 'ep' | 'single' | 'compilation'

export interface Track {
    id: string
    release_id: string
    title: string
    track_number: number | null
    file_url: string | null
    created_at: string
}

export interface Release {
    id: string
    title: string
    type: ReleaseType
    artist: string
    description: string | null
    artwork_url: string | null
    release_date: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    tracks?: Track[]
}

const releases = ref<Release[]>([])
const loading = ref(false)

export function useReleases() {
    async function fetchReleases() {
        loading.value = true
        const { data, error } = await supabase
            .from('releases')
            .select('*, tracks(*)')
            .order('release_date', { ascending: false })
        if (error) throw error

        const raw = (data ?? []) as Omit<Release, 'creator_name' | 'updater_name'>[]

        const userIds = [...new Set(
            raw.flatMap(r => [r.created_by, r.updated_by]).filter((id): id is string => !!id)
        )]

        let profileMap: Record<string, string | null> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
        }

        releases.value = raw.map(r => ({
            ...r,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
        }))
        loading.value = false
    }

    async function createRelease(payload: {
        title: string
        type: ReleaseType
        artist: string
        description?: string | null
        artwork_url?: string | null
        release_date?: string | null
    }): Promise<Release> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('releases')
            .insert({ ...payload, created_by: user?.id })
            .select()
            .single()
        if (error) throw error
        await fetchReleases()
        return data as Release
    }

    async function updateRelease(id: string, payload: {
        title?: string
        type?: ReleaseType
        artist?: string
        description?: string | null
        artwork_url?: string | null
        release_date?: string | null
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('releases')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchReleases()
    }

    async function deleteRelease(id: string) {
        const { error } = await supabase
            .from('releases')
            .delete()
            .eq('id', id)
        if (error) throw error
        releases.value = releases.value.filter(r => r.id !== id)
    }

    async function uploadArtwork(file: File, releaseId: string): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `releases/${releaseId}/artwork.${ext}`
        const { error } = await supabase.storage
            .from('artwork')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('artwork').getPublicUrl(path)
        return data.publicUrl
    }

    async function addTrack(releaseId: string, payload: {
        title: string
        track_number?: number | null
        file_url?: string | null
    }): Promise<Track> {
        const { data, error } = await supabase
            .from('tracks')
            .insert({ ...payload, release_id: releaseId })
            .select()
            .single()
        if (error) throw error
        await fetchReleases()
        return data as Track
    }

    async function updateTrack(id: string, payload: {
        title?: string
        track_number?: number | null
        file_url?: string | null
    }) {
        const { error } = await supabase
            .from('tracks')
            .update(payload)
            .eq('id', id)
        if (error) throw error
        await fetchReleases()
    }

    async function reorderTrack(trackId: string, direction: 'up' | 'down', allTracks: Track[]) {
        const sorted = allTracks.slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
        const idx = sorted.findIndex(t => t.id === trackId)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= sorted.length) return
        const a = sorted[idx]!
        const b = sorted[swapIdx]!
        // Swap track_numbers
        await supabase.from('tracks').update({ track_number: b.track_number }).eq('id', a.id)
        await supabase.from('tracks').update({ track_number: a.track_number }).eq('id', b.id)
        await fetchReleases()
    }

    async function deleteTrack(id: string) {
        const { error } = await supabase
            .from('tracks')
            .delete()
            .eq('id', id)
        if (error) throw error
        await fetchReleases()
    }

    async function uploadTrack(file: File, releaseId: string, trackId: string): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'mp3'
        const path = `releases/${releaseId}/${trackId}.${ext}`
        const { error } = await supabase.storage
            .from('tracks')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('tracks').getPublicUrl(path)
        return data.publicUrl
    }

    return {
        releases,
        loading,
        fetchReleases,
        createRelease,
        updateRelease,
        deleteRelease,
        uploadArtwork,
        addTrack,
        updateTrack,
        deleteTrack,
        uploadTrack,
        reorderTrack,
    }
}
