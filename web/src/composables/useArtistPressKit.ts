import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export interface PressKitFolder {
    id: string
    artist_id: string
    parent_id: string | null
    name: string
    sort_order: number
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
}

export interface PressKitFile {
    id: string
    artist_id: string
    folder_id: string | null
    name: string
    storage_path: string
    size_bytes: number
    mime_type: string | null
    sort_order: number
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
}

export interface PressKitShareLink {
    id: string
    artist_id: string
    public_token: string
    label: string | null
    expires_at: string | null
    revoked_at: string | null
    download_count: number
    last_downloaded_at: string | null
    created_by: string | null
    created_at: string
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

const folders = ref<PressKitFolder[]>([])
const files = ref<PressKitFile[]>([])
const shareLinks = ref<PressKitShareLink[]>([])
const loading = ref(false)

function appendCopySuffix(name: string, existing: Set<string>): string {
    if (!existing.has(name.toLowerCase())) return name
    const dotIdx = name.lastIndexOf('.')
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name
    const ext = dotIdx > 0 ? name.slice(dotIdx) : ''
    let i = 2
    while (true) {
        const candidate = `${base} (${i})${ext}`
        if (!existing.has(candidate.toLowerCase())) return candidate
        i += 1
    }
}

export function useArtistPressKit() {
    async function fetchPressKit(artistId: string) {
        loading.value = true
        try {
            const [foldersRes, filesRes, linksRes] = await Promise.all([
                supabase
                    .from('artist_press_kit_folders')
                    .select('*')
                    .eq('artist_id', artistId)
                    .order('name', { ascending: true }),
                supabase
                    .from('artist_press_kit_files')
                    .select('*')
                    .eq('artist_id', artistId)
                    .order('name', { ascending: true }),
                supabase
                    .from('artist_press_kit_share_links')
                    .select('*')
                    .eq('artist_id', artistId)
                    .order('created_at', { ascending: false }),
            ])
            if (foldersRes.error) throw foldersRes.error
            if (filesRes.error) throw filesRes.error
            if (linksRes.error) throw linksRes.error
            folders.value = foldersRes.data ?? []
            files.value = filesRes.data ?? []
            shareLinks.value = linksRes.data ?? []
        } finally {
            loading.value = false
        }
    }

    async function createFolder(
        artistId: string,
        payload: { name: string; parent_id: string | null },
    ): Promise<PressKitFolder> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_folders')
            .insert({
                artist_id: artistId,
                parent_id: payload.parent_id,
                name: payload.name.trim(),
                created_by: user?.id,
            })
            .select()
            .single()
        if (error) throw error
        folders.value = [...folders.value, data as PressKitFolder]
        return data as PressKitFolder
    }

    async function renameFolder(id: string, name: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_folders')
            .update({ name: name.trim(), updated_by: user?.id })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        folders.value = folders.value.map(f => (f.id === id ? (data as PressKitFolder) : f))
    }

    async function moveFolder(id: string, newParentId: string | null) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_folders')
            .update({ parent_id: newParentId, updated_by: user?.id })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        folders.value = folders.value.map(f => (f.id === id ? (data as PressKitFolder) : f))
    }

    /**
     * Collects all storage paths under a folder subtree by walking the in-memory tree.
     * (The server also offers `press_kit_collect_storage_paths(uuid)` for the same purpose;
     * using the in-memory tree avoids an extra round-trip when state is already loaded.)
     */
    function collectSubtreeStoragePaths(folderId: string): { folderIds: string[]; storagePaths: string[] } {
        const folderIds: string[] = []
        const stack = [folderId]
        while (stack.length) {
            const id = stack.pop()!
            folderIds.push(id)
            for (const f of folders.value) {
                if (f.parent_id === id) stack.push(f.id)
            }
        }
        const folderIdSet = new Set(folderIds)
        const storagePaths = files.value
            .filter(f => f.folder_id != null && folderIdSet.has(f.folder_id))
            .map(f => f.storage_path)
        return { folderIds, storagePaths }
    }

    async function deleteFolder(id: string) {
        const { storagePaths } = collectSubtreeStoragePaths(id)

        if (storagePaths.length > 0) {
            const { error: storageError } = await supabase.storage.from('press-kits').remove(storagePaths)
            if (storageError) throw storageError
        }

        const { error } = await supabase.from('artist_press_kit_folders').delete().eq('id', id)
        if (error) throw error

        // DB cascade handled by ON DELETE CASCADE; mirror it in local state.
        const { folderIds } = collectSubtreeStoragePaths(id)
        const folderIdSet = new Set(folderIds)
        folders.value = folders.value.filter(f => !folderIdSet.has(f.id))
        files.value = files.value.filter(f => f.folder_id == null || !folderIdSet.has(f.folder_id))
    }

    async function uploadFile(
        artistId: string,
        file: File,
        opts: { folder_id: string | null; onProgress?: (pct: number) => void },
    ): Promise<PressKitFile> {
        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`File exceeds the 5 GB size limit.`)
        }

        const { data: { user } } = await supabase.auth.getUser()

        // Resolve display name with duplicate-suffix rule.
        const siblingNames = new Set(
            files.value
                .filter(f => (f.folder_id ?? null) === opts.folder_id && f.artist_id === artistId)
                .map(f => f.name.toLowerCase()),
        )
        const displayName = appendCopySuffix(file.name, siblingNames)

        // Allocate a row so we know the file id for the storage path.
        const { data: row, error: insertError } = await supabase
            .from('artist_press_kit_files')
            .insert({
                artist_id: artistId,
                folder_id: opts.folder_id,
                name: displayName,
                storage_path: 'pending',
                size_bytes: file.size,
                mime_type: file.type || null,
                created_by: user?.id,
            })
            .select()
            .single()
        if (insertError) throw insertError

        const allocated = row as PressKitFile
        const storagePath = `${artistId}/${allocated.id}/${file.name}`

        try {
            opts.onProgress?.(0)
            const { error: uploadError } = await supabase.storage
                .from('press-kits')
                .upload(storagePath, file, {
                    upsert: false,
                    contentType: file.type || 'application/octet-stream',
                })
            if (uploadError) throw uploadError
            opts.onProgress?.(100)
        } catch (err) {
            // Roll back the row on upload failure.
            await supabase.from('artist_press_kit_files').delete().eq('id', allocated.id)
            throw err
        }

        const { data: updated, error: updateError } = await supabase
            .from('artist_press_kit_files')
            .update({ storage_path: storagePath })
            .eq('id', allocated.id)
            .select()
            .single()
        if (updateError) throw updateError

        const finalRow = updated as PressKitFile
        files.value = [...files.value, finalRow]
        return finalRow
    }

    async function renameFile(id: string, name: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_files')
            .update({ name: name.trim(), updated_by: user?.id })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        files.value = files.value.map(f => (f.id === id ? (data as PressKitFile) : f))
    }

    async function moveFile(id: string, newFolderId: string | null) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_files')
            .update({ folder_id: newFolderId, updated_by: user?.id })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        files.value = files.value.map(f => (f.id === id ? (data as PressKitFile) : f))
    }

    async function deleteFile(id: string) {
        const file = files.value.find(f => f.id === id)
        if (file && file.storage_path && file.storage_path !== 'pending') {
            // Ignore storage-side failures (e.g. orphaned rows) — row deletion is authoritative.
            await supabase.storage.from('press-kits').remove([file.storage_path]).catch(() => undefined)
        }
        const { error } = await supabase.from('artist_press_kit_files').delete().eq('id', id)
        if (error) throw error
        files.value = files.value.filter(f => f.id !== id)
    }

    async function getDownloadUrl(fileId: string, expiresInSeconds = 300): Promise<string> {
        const file = files.value.find(f => f.id === fileId)
        if (!file) throw new Error('File not found')
        const { data, error } = await supabase.storage
            .from('press-kits')
            .createSignedUrl(file.storage_path, expiresInSeconds, { download: file.name })
        if (error) throw error
        return data.signedUrl
    }

    async function getPreviewUrl(fileId: string, expiresInSeconds = 300): Promise<string> {
        const file = files.value.find(f => f.id === fileId)
        if (!file) throw new Error('File not found')
        const { data, error } = await supabase.storage
            .from('press-kits')
            .createSignedUrl(file.storage_path, expiresInSeconds)
        if (error) throw error
        return data.signedUrl
    }

    async function createShareLink(
        artistId: string,
        payload: { label?: string | null; expires_at?: string | null },
    ): Promise<PressKitShareLink> {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('artist_press_kit_share_links')
            .insert({
                artist_id: artistId,
                label: payload.label || null,
                expires_at: payload.expires_at || null,
                created_by: user?.id,
            })
            .select()
            .single()
        if (error) throw error
        const link = data as PressKitShareLink
        shareLinks.value = [link, ...shareLinks.value]
        return link
    }

    async function updateShareLink(
        id: string,
        payload: { label?: string | null; expires_at?: string | null },
    ) {
        const patch: Record<string, unknown> = {}
        if (payload.label !== undefined) patch.label = payload.label || null
        if (payload.expires_at !== undefined) patch.expires_at = payload.expires_at || null

        const { data, error } = await supabase
            .from('artist_press_kit_share_links')
            .update(patch)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        shareLinks.value = shareLinks.value.map(l => (l.id === id ? (data as PressKitShareLink) : l))
    }

    async function revokeShareLink(id: string) {
        const { data, error } = await supabase
            .from('artist_press_kit_share_links')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        shareLinks.value = shareLinks.value.map(l => (l.id === id ? (data as PressKitShareLink) : l))
    }

    async function deleteShareLink(id: string) {
        const { error } = await supabase.from('artist_press_kit_share_links').delete().eq('id', id)
        if (error) throw error
        shareLinks.value = shareLinks.value.filter(l => l.id !== id)
    }

    function getPublicShareUrl(link: PressKitShareLink): string {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        return `${origin}/press-kit/${link.public_token}`
    }

    return {
        folders,
        files,
        shareLinks,
        loading,
        fetchPressKit,
        createFolder,
        renameFolder,
        moveFolder,
        deleteFolder,
        uploadFile,
        renameFile,
        moveFile,
        deleteFile,
        getDownloadUrl,
        getPreviewUrl,
        createShareLink,
        updateShareLink,
        revokeShareLink,
        deleteShareLink,
        getPublicShareUrl,
        MAX_FILE_SIZE_BYTES,
    }
}
