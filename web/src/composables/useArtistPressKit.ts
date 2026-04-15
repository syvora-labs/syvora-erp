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
    /**
     * For single-object files (chunk_count == 1): the full Storage path of the object.
     * For chunked files (chunk_count > 1): the logical base path; individual chunks live
     * at `${storage_path}.part-0000`, `.part-0001`, …
     */
    storage_path: string
    size_bytes: number
    mime_type: string | null
    /** Number of Storage objects backing this logical file. 1 means not chunked. */
    chunk_count: number
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

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB (bucket-level cap)

/**
 * Chunk size used for client-side splitting of large files. 40 MiB keeps us
 * comfortably below the common 50 MB Supabase project-level upload cap while
 * minimising the number of round-trips for typical press-kit videos.
 */
const CHUNK_SIZE_BYTES = 40 * 1024 * 1024

function chunkPath(basePath: string, index: number): string {
    return `${basePath}.part-${String(index).padStart(4, '0')}`
}

/**
 * Returns every Storage object path that backs a given file row.
 * - Single-object files: [storage_path]
 * - Chunked files: [storage_path.part-0000, storage_path.part-0001, …]
 */
function storagePathsForFile(file: Pick<PressKitFile, 'storage_path' | 'chunk_count'>): string[] {
    if (file.chunk_count <= 1) return [file.storage_path]
    const out: string[] = []
    for (let i = 0; i < file.chunk_count; i += 1) out.push(chunkPath(file.storage_path, i))
    return out
}

/**
 * Uploads a Blob to Supabase Storage via XHR so we can observe byte-level
 * progress through `upload.onprogress`. Mirrors the relevant bits of the JS
 * client's `upload()` but sacrifices some niceties (resumable uploads, auto
 * content-type inference) in exchange for real progress events.
 */
function uploadBlobWithProgress(
    bucket: string,
    path: string,
    blob: Blob,
    accessToken: string,
    opts: { contentType?: string; upsert?: boolean; onProgress?: (loadedBytes: number) => void },
): Promise<void> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`

    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url, true)
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
        xhr.setRequestHeader('apikey', anonKey)
        xhr.setRequestHeader('Content-Type', opts.contentType ?? 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', opts.upsert ? 'true' : 'false')

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) opts.onProgress?.(e.loaded)
        })
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
                return
            }
            let message = `Upload failed with status ${xhr.status}`
            try {
                const parsed = JSON.parse(xhr.responseText)
                if (parsed?.message) message = parsed.message
                else if (parsed?.error) message = parsed.error
            } catch { /* non-JSON error body, ignore */ }
            reject(new Error(message))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

        xhr.send(blob)
    })
}

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
            .flatMap(f => storagePathsForFile(f))
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

        // Storage-first upload: pre-generate the row id (and therefore the full storage path)
        // client-side, push bytes to Storage, then insert the metadata row with the final
        // storage_path already set. This avoids any placeholder value on the UNIQUE column
        // and keeps the invariant: row exists ⇒ all backing Storage objects exist.
        const fileId = (crypto as Crypto & { randomUUID: () => string }).randomUUID()
        const storagePath = `${artistId}/${fileId}/${file.name}`
        const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES))

        const uploadedPaths: string[] = []

        try {
            opts.onProgress?.(0)

            // Grab the access token once up front; XHR uploads use it directly. The token
            // is valid for an hour by default, so for any practical press-kit upload this
            // is safe even across all chunks.
            const { data: sessionData } = await supabase.auth.getSession()
            const accessToken = sessionData.session?.access_token
            if (!accessToken) {
                throw new Error('You must be signed in to upload files.')
            }

            // `bytesCompleted` is the sum of bytes fully flushed by prior chunks; adding
            // the in-flight chunk's live `loaded` bytes gives us a smooth overall figure.
            let bytesCompleted = 0
            const reportProgress = (chunkLoaded: number) => {
                const pct = Math.min(100, Math.round(((bytesCompleted + chunkLoaded) / Math.max(file.size, 1)) * 100))
                opts.onProgress?.(pct)
            }

            if (chunkCount === 1) {
                // Small file: one object at the canonical storage_path.
                await uploadBlobWithProgress('press-kits', storagePath, file, accessToken, {
                    contentType: file.type || 'application/octet-stream',
                    upsert: false,
                    onProgress: (loaded) => reportProgress(loaded),
                })
                uploadedPaths.push(storagePath)
                bytesCompleted = file.size
                opts.onProgress?.(100)
            } else {
                // Large file: split into `chunkCount` objects at `<storage_path>.part-NNNN`.
                // The logical `storage_path` itself is never written as an object for chunked
                // files — it's a base prefix only. Chunks upload sequentially so memory stays
                // bounded and aggregate byte-progress is trivially monotonic.
                for (let i = 0; i < chunkCount; i += 1) {
                    const start = i * CHUNK_SIZE_BYTES
                    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size)
                    const slice = file.slice(start, end)
                    const partPath = chunkPath(storagePath, i)

                    await uploadBlobWithProgress('press-kits', partPath, slice, accessToken, {
                        // Chunks are opaque bytes; the browser reassembles using the
                        // original mime on download.
                        contentType: 'application/octet-stream',
                        upsert: false,
                        onProgress: (loaded) => reportProgress(loaded),
                    })
                    uploadedPaths.push(partPath)
                    bytesCompleted = end
                    reportProgress(0)
                }
                opts.onProgress?.(100)
            }

            const { data: row, error: insertError } = await supabase
                .from('artist_press_kit_files')
                .insert({
                    id: fileId,
                    artist_id: artistId,
                    folder_id: opts.folder_id,
                    name: displayName,
                    storage_path: storagePath,
                    size_bytes: file.size,
                    mime_type: file.type || null,
                    chunk_count: chunkCount,
                    created_by: user?.id,
                })
                .select()
                .single()

            if (insertError) throw insertError

            const finalRow = row as PressKitFile
            files.value = [...files.value, finalRow]
            return finalRow
        } catch (err) {
            // Clean up any Storage objects we managed to upload before the failure so we
            // don't leak bytes. DB row was never inserted (or insert failed), so no row
            // cleanup is required.
            if (uploadedPaths.length > 0) {
                await supabase.storage
                    .from('press-kits')
                    .remove(uploadedPaths)
                    .catch(() => undefined)
            }
            throw err
        }
    }

    /**
     * Reassembles a (possibly chunked) file into a single Blob suitable for download
     * or preview. For single-object files this is equivalent to a direct download;
     * for chunked files it streams each part sequentially and concatenates.
     *
     * Note: the full file sits in browser memory. OK for ≤ a few GB in practice.
     */
    async function downloadFileBlob(fileId: string, onProgress?: (pct: number) => void): Promise<Blob> {
        const file = files.value.find(f => f.id === fileId)
        if (!file) throw new Error('File not found')

        const paths = storagePathsForFile(file)
        const parts: Blob[] = []
        for (let i = 0; i < paths.length; i += 1) {
            const { data, error } = await supabase.storage.from('press-kits').download(paths[i])
            if (error || !data) throw error ?? new Error('Failed to download chunk')
            parts.push(data)
            onProgress?.(Math.round(((i + 1) / paths.length) * 100))
        }

        return new Blob(parts, { type: file.mime_type || 'application/octet-stream' })
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
        if (file) {
            const paths = storagePathsForFile(file)
            // Ignore storage-side failures (e.g. orphaned rows) — row deletion is authoritative.
            await supabase.storage.from('press-kits').remove(paths).catch(() => undefined)
        }
        const { error } = await supabase.from('artist_press_kit_files').delete().eq('id', id)
        if (error) throw error
        files.value = files.value.filter(f => f.id !== id)
    }

    /**
     * Returns a short-lived signed URL for direct access to the file's single
     * Storage object. Returns `null` for chunked files (chunk_count > 1) — the
     * caller must fall back to `downloadFileBlob` and produce a Blob URL.
     */
    async function getDownloadUrl(fileId: string, expiresInSeconds = 300): Promise<string | null> {
        const file = files.value.find(f => f.id === fileId)
        if (!file) throw new Error('File not found')
        if (file.chunk_count > 1) return null
        const { data, error } = await supabase.storage
            .from('press-kits')
            .createSignedUrl(file.storage_path, expiresInSeconds, { download: file.name })
        if (error) throw error
        return data.signedUrl
    }

    async function getPreviewUrl(fileId: string, expiresInSeconds = 300): Promise<string | null> {
        const file = files.value.find(f => f.id === fileId)
        if (!file) throw new Error('File not found')
        if (file.chunk_count > 1) return null
        const { data, error } = await supabase.storage
            .from('press-kits')
            .createSignedUrl(file.storage_path, expiresInSeconds)
        if (error) throw error
        return data.signedUrl
    }

    function isChunked(fileId: string): boolean {
        const file = files.value.find(f => f.id === fileId)
        return !!file && file.chunk_count > 1
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
        downloadFileBlob,
        isChunked,
        createShareLink,
        updateShareLink,
        revokeShareLink,
        deleteShareLink,
        getPublicShareUrl,
        MAX_FILE_SIZE_BYTES,
        CHUNK_SIZE_BYTES,
    }
}
