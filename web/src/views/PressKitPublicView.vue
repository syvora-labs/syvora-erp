<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SyvoraButton, SyvoraCard, useIsMobile } from '@syvora/ui'
import { Zip, ZipPassThrough } from 'fflate'

const isMobile = useIsMobile()

interface Folder { id: string; parent_id: string | null; name: string }
interface PressKitFile {
    id: string
    folder_id: string | null
    name: string
    size_bytes: number
    mime_type: string | null
}
interface Manifest {
    artist: { name: string; picture_url: string | null }
    label: string | null
    expires_at: string | null
    folders: Folder[]
    files: PressKitFile[]
}

const route = useRoute()
const token = computed(() => route.params.token as string)

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/press-kit-download`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const loading = ref(true)
const error = ref('')
const errorStatus = ref<number | null>(null)
const manifest = ref<Manifest | null>(null)
const downloading = ref(false)
const downloadProgress = ref(0)
const downloadStatus = ref('')

// Collapsed folder state
const collapsed = ref<Set<string>>(new Set())

function toggleFolder(id: string) {
    const next = new Set(collapsed.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsed.value = next
}

const rootFolders = computed(() =>
    manifest.value
        ? manifest.value.folders
            .filter(f => f.parent_id === null)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
)

const rootFiles = computed(() =>
    manifest.value
        ? manifest.value.files
            .filter(f => f.folder_id === null)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
)

function childFolders(parentId: string): Folder[] {
    if (!manifest.value) return []
    return manifest.value.folders
        .filter(f => f.parent_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
}

function folderFiles(folderId: string): PressKitFile[] {
    if (!manifest.value) return []
    return manifest.value.files
        .filter(f => f.folder_id === folderId)
        .sort((a, b) => a.name.localeCompare(b.name))
}

const totalSize = computed(() => {
    if (!manifest.value) return 0
    return manifest.value.files.reduce((acc, f) => acc + f.size_bytes, 0)
})

const totalFiles = computed(() => manifest.value?.files.length ?? 0)

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let size = bytes / 1024
    let idx = 0
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024
        idx += 1
    }
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

async function fetchManifest() {
    loading.value = true
    error.value = ''
    errorStatus.value = null
    try {
        const res = await fetch(`${EDGE_FN_URL}?token=${token.value}&mode=manifest`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        })
        if (res.status === 404) {
            errorStatus.value = 404
            error.value = 'Press kit not found'
            return
        }
        if (res.status === 410) {
            errorStatus.value = 410
            error.value = 'This share link is no longer active'
            return
        }
        if (!res.ok) {
            errorStatus.value = res.status
            error.value = 'Failed to load press kit'
            return
        }
        const data: Manifest = await res.json()
        manifest.value = data
    } catch {
        error.value = 'Failed to load press kit'
    } finally {
        loading.value = false
    }
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'press-kit'
}

async function startDownload() {
    downloading.value = true
    downloadProgress.value = 0
    downloadStatus.value = 'Preparing download…'

    try {
        // 1. Fetch signed Storage URLs from the edge function.
        downloadStatus.value = 'Generating download links…'
        const res = await fetch(`${EDGE_FN_URL}?token=${token.value}&mode=download-urls`)
        if (!res.ok) throw new Error('Failed to prepare download')
        const payload: {
            artist_name: string
            folder_prefixes: string[]
            entries: { archive_path: string; size_bytes: number; urls: string[] }[]
        } = await res.json()

        const totalBytes = payload.entries.reduce((acc, e) => acc + e.size_bytes, 0)
        let bytesDownloaded = 0

        // 2. Build the ZIP in the browser using fflate's streaming writer.
        const chunks: Uint8Array[] = []
        const zip = new Zip((err, data, _final) => {
            if (err) throw err
            if (data) chunks.push(data)
        })

        // Empty folder entries
        for (const prefix of payload.folder_prefixes) {
            const dir = new ZipPassThrough(prefix)
            zip.add(dir)
            dir.push(new Uint8Array(0), true)
        }

        // File entries — download each signed URL, pipe into a ZipPassThrough.
        for (let i = 0; i < payload.entries.length; i += 1) {
            const entry = payload.entries[i]
            downloadStatus.value = `Downloading file ${i + 1} of ${payload.entries.length}…`

            const passthrough = new ZipPassThrough(entry.archive_path)
            zip.add(passthrough)

            for (const url of entry.urls) {
                const resp = await fetch(url)
                if (!resp.ok || !resp.body) {
                    // Skip this chunk — archive entry will still be present (truncated).
                    continue
                }
                const reader = resp.body.getReader()
                for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    if (value && value.byteLength > 0) {
                        passthrough.push(value, false)
                        bytesDownloaded += value.byteLength
                        downloadProgress.value = Math.min(
                            99,
                            Math.round((bytesDownloaded / Math.max(totalBytes, 1)) * 100),
                        )
                    }
                }
            }
            passthrough.push(new Uint8Array(0), true)
        }

        zip.end()

        // 3. Assemble the output and trigger the browser download.
        downloadStatus.value = 'Packaging ZIP…'
        downloadProgress.value = 100
        const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' })
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `${slugify(payload.artist_name)}-press-kit.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (err) {
        console.error('ZIP download failed:', err)
        downloadStatus.value = 'Download failed — please try again.'
        // Keep the error visible for a moment before resetting.
        await new Promise(r => setTimeout(r, 3000))
    } finally {
        downloading.value = false
        downloadProgress.value = 0
        downloadStatus.value = ''
    }
}

onMounted(fetchManifest)
</script>

<template>
    <div class="pkp" :class="{ 'is-mobile': isMobile }">
        <div v-if="loading" class="pkp-loading">Loading press kit…</div>

        <div v-else-if="error" class="pkp-error">
            <h2>{{ errorStatus === 410 ? 'Link inactive' : 'Not found' }}</h2>
            <p>{{ error }}</p>
        </div>

        <div v-else-if="manifest" class="pkp-content">
            <!-- Header -->
            <div class="pkp-header">
                <div v-if="manifest.artist.picture_url" class="pkp-avatar">
                    <img :src="manifest.artist.picture_url" :alt="manifest.artist.name" />
                </div>
                <div v-else class="pkp-avatar pkp-avatar-placeholder">
                    {{ manifest.artist.name.charAt(0).toUpperCase() }}
                </div>
                <div class="pkp-header-info">
                    <div class="pkp-subtitle">Press Kit</div>
                    <h1 class="pkp-title">{{ manifest.artist.name }}</h1>
                    <p v-if="manifest.label" class="pkp-shared-for">
                        Shared for: <strong>{{ manifest.label }}</strong>
                    </p>
                    <p class="pkp-stats">
                        {{ totalFiles }} file{{ totalFiles === 1 ? '' : 's' }} · {{ formatBytes(totalSize) }}
                    </p>
                </div>
            </div>

            <!-- Download CTA -->
            <SyvoraCard class="pkp-cta">
                <div class="pkp-cta-body">
                    <div>
                        <h2 class="pkp-cta-title">Download the full press kit</h2>
                        <p class="pkp-cta-sub">Everything below, packaged as a single .zip archive.</p>
                        <p v-if="manifest.expires_at" class="pkp-expiry-notice">
                            This link expires on {{ formatDate(manifest.expires_at) }}.
                        </p>
                    </div>
                    <div class="pkp-cta-action">
                        <SyvoraButton :loading="downloading" :disabled="downloading" @click="startDownload">
                            {{ downloading ? `${downloadProgress}%` : 'Download press kit (.zip)' }}
                        </SyvoraButton>
                        <p v-if="downloadStatus" class="pkp-download-status">{{ downloadStatus }}</p>
                    </div>
                </div>
            </SyvoraCard>

            <!-- Contents tree -->
            <h2 class="pkp-section-title">Contents</h2>

            <div v-if="rootFolders.length === 0 && rootFiles.length === 0" class="pkp-empty">
                This press kit is empty.
            </div>

            <div v-else class="pkp-tree">
                <!-- Root-level folders -->
                <div v-for="folder in rootFolders" :key="folder.id" class="pkp-tree-folder">
                    <button class="pkp-folder-header" type="button" @click="toggleFolder(folder.id)">
                        <span class="pkp-folder-caret">{{ collapsed.has(folder.id) ? '▸' : '▾' }}</span>
                        <span class="pkp-folder-icon">📁</span>
                        <span class="pkp-folder-name">{{ folder.name }}</span>
                    </button>
                    <div v-if="!collapsed.has(folder.id)" class="pkp-folder-body">
                        <div v-for="sub in childFolders(folder.id)" :key="sub.id" class="pkp-tree-subfolder">
                            <button class="pkp-folder-header is-nested" type="button" @click="toggleFolder(sub.id)">
                                <span class="pkp-folder-caret">{{ collapsed.has(sub.id) ? '▸' : '▾' }}</span>
                                <span class="pkp-folder-icon">📁</span>
                                <span class="pkp-folder-name">{{ sub.name }}</span>
                            </button>
                            <div v-if="!collapsed.has(sub.id)" class="pkp-folder-body pkp-folder-body-nested">
                                <div v-for="f in folderFiles(sub.id)" :key="f.id" class="pkp-file-row">
                                    <span class="pkp-file-icon">
                                        <span v-if="f.mime_type?.startsWith('image/')">🖼️</span>
                                        <span v-else-if="f.mime_type?.startsWith('video/')">🎬</span>
                                        <span v-else-if="f.mime_type?.startsWith('audio/')">🎵</span>
                                        <span v-else-if="f.mime_type === 'application/pdf'">📄</span>
                                        <span v-else>📎</span>
                                    </span>
                                    <span class="pkp-file-name">{{ f.name }}</span>
                                    <span class="pkp-file-size">{{ formatBytes(f.size_bytes) }}</span>
                                </div>
                            </div>
                        </div>
                        <div v-for="f in folderFiles(folder.id)" :key="f.id" class="pkp-file-row">
                            <span class="pkp-file-icon">
                                <span v-if="f.mime_type?.startsWith('image/')">🖼️</span>
                                <span v-else-if="f.mime_type?.startsWith('video/')">🎬</span>
                                <span v-else-if="f.mime_type?.startsWith('audio/')">🎵</span>
                                <span v-else-if="f.mime_type === 'application/pdf'">📄</span>
                                <span v-else>📎</span>
                            </span>
                            <span class="pkp-file-name">{{ f.name }}</span>
                            <span class="pkp-file-size">{{ formatBytes(f.size_bytes) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Root-level files -->
                <div v-for="f in rootFiles" :key="f.id" class="pkp-file-row pkp-file-row-root">
                    <span class="pkp-file-icon">
                        <span v-if="f.mime_type?.startsWith('image/')">🖼️</span>
                        <span v-else-if="f.mime_type?.startsWith('video/')">🎬</span>
                        <span v-else-if="f.mime_type?.startsWith('audio/')">🎵</span>
                        <span v-else-if="f.mime_type === 'application/pdf'">📄</span>
                        <span v-else>📎</span>
                    </span>
                    <span class="pkp-file-name">{{ f.name }}</span>
                    <span class="pkp-file-size">{{ formatBytes(f.size_bytes) }}</span>
                </div>
            </div>

            <!-- Bottom CTA (mobile-friendly second shot) -->
            <div class="pkp-bottom-cta">
                <SyvoraButton :loading="downloading" :disabled="downloading" @click="startDownload">
                    {{ downloading ? `${downloadProgress}%` : 'Download press kit (.zip)' }}
                </SyvoraButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
.pkp {
    max-width: 820px;
    margin: 0 auto;
    padding: 3rem 1.25rem 5rem;
}

.pkp-loading, .pkp-error {
    text-align: center;
    padding: 5rem 1rem;
    color: var(--color-text-muted);
}
.pkp-error h2 {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
    color: var(--color-text);
}

.pkp-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
}
.pkp-avatar {
    width: 96px; height: 96px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    border: 2px solid var(--color-border, rgba(0,0,0,0.1));
}
.pkp-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pkp-avatar-placeholder {
    display: flex; align-items: center; justify-content: center;
    font-size: 2.5rem; font-weight: 700;
    color: var(--color-accent, #0c1a27);
    background: rgba(0, 0, 0, 0.04);
}

.pkp-subtitle {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    font-weight: 600;
}

.pkp-title {
    font-size: 2rem;
    font-weight: 800;
    margin: 0.1rem 0 0.25rem;
    letter-spacing: -0.02em;
    color: var(--color-text);
}

.pkp-shared-for {
    margin: 0 0 0.25rem;
    color: var(--color-text-muted);
    font-size: 0.9rem;
}
.pkp-stats { margin: 0; color: var(--color-text-muted); font-size: 0.85rem; }

.pkp-cta { margin-bottom: 2rem; }
.pkp-cta-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
    padding: 0.5rem;
}
.pkp-cta-title { font-size: 1.2rem; font-weight: 700; margin: 0 0 0.25rem; }
.pkp-cta-sub { margin: 0; color: var(--color-text-muted); font-size: 0.9rem; }
.pkp-expiry-notice {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
}
.pkp-cta-action { display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; flex-shrink: 0; }
.pkp-download-status { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); }

.pkp-section-title { font-size: 1rem; font-weight: 700; margin: 0 0 0.75rem; color: var(--color-text); }

.pkp-empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: 2rem;
}

.pkp-tree {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 2rem;
}

.pkp-folder-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.03);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.95rem;
    font-family: inherit;
    font-weight: 600;
    color: var(--color-text);
    text-align: left;
    transition: background 0.15s;
}
.pkp-folder-header:hover { background: rgba(0, 0, 0, 0.06); }
.pkp-folder-header.is-nested { background: transparent; font-weight: 500; }
.pkp-folder-caret {
    display: inline-block;
    width: 1rem;
    color: var(--color-text-muted);
    font-size: 0.7rem;
}
.pkp-folder-body { padding: 0.2rem 0 0.2rem 1.75rem; display: flex; flex-direction: column; gap: 0.2rem; }
.pkp-folder-body-nested { padding-left: 1.5rem; }

.pkp-file-row {
    display: grid;
    grid-template-columns: 1.25rem 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.9rem;
    color: var(--color-text);
    border-radius: 0.375rem;
}
.pkp-file-row:hover { background: rgba(0, 0, 0, 0.03); }
.pkp-file-row-root { padding-left: 0.75rem; }
.pkp-file-icon { font-size: 0.95rem; }
.pkp-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pkp-file-size { font-size: 0.8rem; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

.pkp-bottom-cta { display: flex; justify-content: center; margin-top: 2rem; }

.pkp.is-mobile { padding: 1.5rem 1rem 3rem; }
.pkp.is-mobile .pkp-header { flex-direction: column; gap: 1rem; align-items: flex-start; }
.pkp.is-mobile .pkp-avatar { width: 64px; height: 64px; }
.pkp.is-mobile .pkp-title { font-size: 1.5rem; }
.pkp.is-mobile .pkp-cta-body { flex-direction: column; align-items: stretch; }
</style>
