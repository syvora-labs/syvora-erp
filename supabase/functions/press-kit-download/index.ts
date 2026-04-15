import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Zip, ZipPassThrough } from 'https://esm.sh/fflate@0.8.2?target=deno'

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
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'press-kit'
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
            supabase.from('artist_press_kit_files').select('id, folder_id, name, storage_path, size_bytes, mime_type').eq('artist_id', link.artist_id).order('name', { ascending: true }),
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

        // ── ZIP mode ──────────────────────────────────────────────────────────
        if (mode === 'zip') {
            const folderPaths = buildFolderPaths(folders)
            const filename = `${slugify(artist.name)}-press-kit.zip`

            // Streaming ZIP: pipe Storage object streams directly into fflate's Zip writer.
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    const zip = new Zip((err, data, final) => {
                        if (err) {
                            controller.error(err)
                            return
                        }
                        if (data) controller.enqueue(data)
                        if (final) controller.close()
                    })

                    ;(async () => {
                        try {
                            // Empty directory entries so empty folders still appear in the zip.
                            for (const [, prefix] of folderPaths) {
                                const dirEntry = new ZipPassThrough(prefix)
                                zip.add(dirEntry)
                                dirEntry.push(new Uint8Array(0), true)
                            }

                            // Files
                            for (const file of files) {
                                const prefix = file.folder_id ? (folderPaths.get(file.folder_id) ?? '') : ''
                                const archivePath = `${prefix}${file.name}`
                                const passthrough = new ZipPassThrough(archivePath)
                                zip.add(passthrough)

                                const { data: blob, error: dlError } = await supabase.storage
                                    .from('press-kits')
                                    .download(file.storage_path)

                                if (dlError || !blob) {
                                    // Push an empty payload and finalise this entry so the zip stays valid.
                                    passthrough.push(new Uint8Array(0), true)
                                    continue
                                }

                                const reader = blob.stream().getReader()
                                // eslint-disable-next-line no-constant-condition
                                while (true) {
                                    const { done, value } = await reader.read()
                                    if (done) break
                                    if (value && value.byteLength > 0) {
                                        passthrough.push(value, false)
                                    }
                                }
                                passthrough.push(new Uint8Array(0), true)
                            }

                            zip.end()
                        } catch (err) {
                            controller.error(err)
                        }
                    })()
                },
            })

            // Update download counters (fire-and-forget; do not block the response stream).
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

            return new Response(stream, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/zip',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Cache-Control': 'no-store',
                },
            })
        }

        return json({ error: 'Invalid mode parameter' }, 400)
    } catch (err) {
        console.error('Unexpected error in press-kit-download:', err)
        return json({ error: 'Internal server error' }, 500)
    }
})
