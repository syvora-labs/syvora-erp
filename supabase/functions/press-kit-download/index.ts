import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            ...extraHeaders,
            'Content-Type': 'application/json',
        },
    })
}

type Folder = { id: string; parent_id: string | null; name: string }
type PressKitFile = {
    id: string
    folder_id: string | null
    name: string
    storage_path: string
    size_bytes: number
    mime_type: string | null
    chunk_count: number
}

function chunkPath(basePath: string, index: number): string {
    return `${basePath}.part-${String(index).padStart(4, '0')}`
}

function storagePathsForFile(file: Pick<PressKitFile, 'storage_path' | 'chunk_count'>): string[] {
    const n = file.chunk_count ?? 1
    if (n <= 1) return [file.storage_path]
    const out: string[] = []
    for (let i = 0; i < n; i += 1) out.push(chunkPath(file.storage_path, i))
    return out
}

// Build a "Folder/Sub/" prefix for each folder id, resolved from a flat list.
function buildFolderPaths(folders: Folder[]): Map<string, string> {
    const byId = new Map<string, Folder>()
    for (const f of folders) byId.set(f.id, f)

    const paths = new Map<string, string>()
    function resolve(id: string): string {
        if (paths.has(id)) return paths.get(id)!
        const folder = byId.get(id)
        if (!folder) return ''
        const prefix = folder.parent_id ? resolve(folder.parent_id) : ''
        const own = `${prefix}${folder.name}/`
        paths.set(id, own)
        return own
    }
    for (const f of folders) resolve(f.id)
    return paths
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405)
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )

        const url = new URL(req.url)
        const token = url.searchParams.get('token')
        const mode = url.searchParams.get('mode') ?? 'manifest'

        if (!token) {
            return json({ error: 'Missing token parameter' }, 400)
        }

        // ── Resolve share link ─────────────────────────────────────────────────
        const { data: link, error: linkError } = await supabase
            .from('artist_press_kit_share_links')
            .select('id, artist_id, label, expires_at, revoked_at')
            .eq('public_token', token)
            .maybeSingle()

        if (linkError) {
            return json({ error: 'Failed to look up share link' }, 500)
        }
        if (!link) {
            return json({ error: 'Press kit not found' }, 404)
        }
        if (link.revoked_at) {
            return json({ error: 'This share link has been revoked' }, 410)
        }
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
            return json({ error: 'This share link has expired' }, 410)
        }

        // ── Fetch artist + folders + files ────────────────────────────────────
        const [{ data: artist, error: artistError }, { data: foldersData, error: foldersError }, { data: filesData, error: filesError }] = await Promise.all([
            supabase.from('artists').select('id, name, picture_url').eq('id', link.artist_id).maybeSingle(),
            supabase.from('artist_press_kit_folders').select('id, parent_id, name').eq('artist_id', link.artist_id).order('name', { ascending: true }),
            supabase.from('artist_press_kit_files').select('id, folder_id, name, storage_path, size_bytes, mime_type, chunk_count').eq('artist_id', link.artist_id).order('name', { ascending: true }),
        ])

        if (artistError || !artist) {
            return json({ error: 'Artist not found' }, 404)
        }
        if (foldersError || filesError) {
            return json({ error: 'Failed to load press kit' }, 500)
        }

        const folders = (foldersData ?? []) as Folder[]
        const files = (filesData ?? []) as PressKitFile[]

        // ── Manifest mode ─────────────────────────────────────────────────────
        if (mode === 'manifest') {
            return json({
                artist: { name: artist.name, picture_url: artist.picture_url },
                label: link.label,
                expires_at: link.expires_at,
                folders,
                files: files.map(f => ({
                    id: f.id,
                    folder_id: f.folder_id,
                    name: f.name,
                    size_bytes: f.size_bytes,
                    mime_type: f.mime_type,
                })),
            })
        }

        // ── Download URLs mode ─────────────────────────────────────────────
        // Returns short-lived signed Storage URLs for every file (chunk-aware).
        // The browser assembles the ZIP client-side so we never stream GBs
        // through the edge function (which has tight timeout and memory caps).
        if (mode === 'download-urls') {
            const folderPaths = buildFolderPaths(folders)

            // Collect every Storage object path we need to sign.
            const allPaths: string[] = []
            for (const file of files) {
                for (const p of storagePathsForFile(file)) allPaths.push(p)
            }

            // Sign them in one batch (single POST to the Storage API).
            let signedMap: Record<string, string> = {}
            if (allPaths.length > 0) {
                const { data: signed, error: signError } = await supabase.storage
                    .from('press-kits')
                    .createSignedUrls(allPaths, 3600) // 1 hour
                if (signError) {
                    return json({ error: 'Failed to sign download URLs' }, 500)
                }
                for (const entry of (signed ?? [])) {
                    if (entry.signedUrl) signedMap[entry.path!] = entry.signedUrl
                }
            }

            // Structure: one entry per logical file, with archive path + ordered
            // list of signed URLs (1 for single-object files, N for chunked).
            const entries = files.map(file => {
                const prefix = file.folder_id ? (folderPaths.get(file.folder_id) ?? '') : ''
                const paths = storagePathsForFile(file)
                return {
                    archive_path: `${prefix}${file.name}`,
                    size_bytes: file.size_bytes,
                    urls: paths.map(p => signedMap[p] ?? null).filter(Boolean),
                }
            })

            // Also give the client the folder tree so it can add empty directory entries.
            const folderEntries = Array.from(folderPaths.values())

            // Increment download counter (fire-and-forget).
            const increment = async () => {
                const { data: current } = await supabase
                    .from('artist_press_kit_share_links')
                    .select('download_count')
                    .eq('id', link.id)
                    .maybeSingle()
                const next = (current?.download_count ?? 0) + 1
                await supabase
                    .from('artist_press_kit_share_links')
                    .update({ download_count: next, last_downloaded_at: new Date().toISOString() })
                    .eq('id', link.id)
            }
            increment().catch((e) => console.error('Failed to increment download_count:', e))

            return json({
                artist_name: artist.name,
                folder_prefixes: folderEntries,
                entries,
            })
        }

        return json({ error: 'Invalid mode parameter' }, 400)
    } catch (err) {
        console.error('Unexpected error in press-kit-download:', err)
        return json({ error: 'Internal server error' }, 500)
    }
})
