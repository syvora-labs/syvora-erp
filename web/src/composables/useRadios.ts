import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'

export interface RadioFile {
    id: string
    radio_id: string
    label: string
    file_url: string
    file_name: string
    file_size: number | null
    created_at: string
}

export interface Radio {
    id: string
    title: string
    description: string | null
    artists: string[]
    release_date: string | null
    soundcloud_link: string | null
    is_draft: boolean
    is_archived: boolean
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    files: RadioFile[]
}

const radios = ref<Radio[]>([])
const loading = ref(false)

export function useRadios() {
    const activeRadios = computed(() => radios.value.filter(r => !r.is_archived))
    const archivedRadios = computed(() => radios.value.filter(r => r.is_archived).reverse())

    async function fetchRadioById(id: string): Promise<Radio | null> {
        const { data, error } = await supabase
            .from('radios')
            .select('*')
            .eq('id', id)
            .maybeSingle()
        if (error) throw error
        if (!data) return null

        const raw = data as Omit<Radio, 'creator_name' | 'updater_name' | 'files'>

        const userIds = [raw.created_by, raw.updated_by].filter((id): id is string => !!id)
        let profileMap: Record<string, string | null> = {}
        if (userIds.length) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', userIds)
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
        }

        const { data: files } = await supabase
            .from('radio_files')
            .select('*')
            .eq('radio_id', id)
            .order('created_at', { ascending: true })

        return {
            ...raw,
            creator_name: raw.created_by ? (profileMap[raw.created_by] ?? null) : null,
            updater_name: raw.updated_by ? (profileMap[raw.updated_by] ?? null) : null,
            files: (files ?? []) as RadioFile[],
        }
    }

    async function fetchRadios() {
        loading.value = true
        const { data, error } = await supabase
            .from('radios')
            .select('*')
            .order('release_date', { ascending: false, nullsFirst: false })
        if (error) throw error

        const raw = (data ?? []) as Omit<Radio, 'creator_name' | 'updater_name' | 'files'>[]

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

        const radioIds = raw.map(r => r.id)
        let filesMap: Record<string, RadioFile[]> = {}
        if (radioIds.length) {
            const { data: files } = await supabase
                .from('radio_files')
                .select('*')
                .in('radio_id', radioIds)
                .order('created_at', { ascending: true })
            for (const f of (files ?? []) as RadioFile[]) {
                if (!filesMap[f.radio_id]) filesMap[f.radio_id] = []
                filesMap[f.radio_id]!.push(f)
            }
        }

        radios.value = raw.map(r => ({
            ...r,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
            files: filesMap[r.id] ?? [],
        }))
        loading.value = false
    }

    async function createRadio(payload: {
        title: string
        description?: string | null
        artists?: string[]
        release_date?: string | null
        soundcloud_link?: string | null
    }): Promise<Radio> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('radios')
            .insert({ ...payload, created_by: user?.id, artists: payload.artists ?? [] })
            .select()
            .single()
        if (error) throw error
        await fetchRadios()
        return data as Radio
    }

    async function updateRadio(id: string, payload: {
        title?: string
        description?: string | null
        artists?: string[]
        release_date?: string | null
        soundcloud_link?: string | null
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('radios')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRadios()
    }

    async function publishRadio(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('radios')
            .update({ is_draft: false, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRadios()
    }

    async function unpublishRadio(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('radios')
            .update({ is_draft: true, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRadios()
    }

    async function archiveRadio(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('radios')
            .update({ is_archived: true, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRadios()
    }

    async function unarchiveRadio(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('radios')
            .update({ is_archived: false, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRadios()
    }

    async function deleteRadio(id: string) {
        // Fetch files directly from the DB so storage cleanup works
        // even when the radios list hasn't been loaded (e.g., from the detail view).
        const { data: files } = await supabase
            .from('radio_files')
            .select('file_name')
            .eq('radio_id', id)
        if (files?.length) {
            const paths = files.map(f => `radios/${id}/${f.file_name}`)
            await supabase.storage.from('artwork').remove(paths)
        }
        const { error } = await supabase
            .from('radios')
            .delete()
            .eq('id', id)
        if (error) throw error
        radios.value = radios.value.filter(r => r.id !== id)
    }

    async function uploadRadioFile(file: File, radioId: string, label: string): Promise<RadioFile> {
        const timestamp = Date.now()
        const safeName = `${timestamp}_${file.name}`
        const path = `radios/${radioId}/${safeName}`
        const { error: uploadError } = await supabase.storage
            .from('artwork')
            .upload(path, file, { upsert: false })
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from('artwork').getPublicUrl(path)

        const { data, error } = await supabase
            .from('radio_files')
            .insert({
                radio_id: radioId,
                label,
                file_url: urlData.publicUrl,
                file_name: safeName,
                file_size: file.size,
            })
            .select()
            .single()
        if (error) throw error
        return data as RadioFile
    }

    async function deleteRadioFile(fileRecord: RadioFile) {
        const path = `radios/${fileRecord.radio_id}/${fileRecord.file_name}`
        await supabase.storage.from('artwork').remove([path])
        const { error } = await supabase
            .from('radio_files')
            .delete()
            .eq('id', fileRecord.id)
        if (error) throw error
        await fetchRadios()
    }

    return {
        radios,
        activeRadios,
        archivedRadios,
        loading,
        fetchRadios,
        fetchRadioById,
        createRadio,
        updateRadio,
        deleteRadio,
        publishRadio,
        unpublishRadio,
        archiveRadio,
        unarchiveRadio,
        uploadRadioFile,
        deleteRadioFile,
    }
}
