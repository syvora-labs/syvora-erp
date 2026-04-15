<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
    SyvoraButton,
    SyvoraModal,
    SyvoraFormField,
    SyvoraInput,
    SyvoraEmptyState,
    SyvoraBadge,
} from '@syvora/ui'
import {
    useArtistPressKit,
    type PressKitFolder,
    type PressKitFile,
    type PressKitShareLink,
} from '../composables/useArtistPressKit'

const props = defineProps<{ artistId: string }>()

const {
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
    createShareLink,
    updateShareLink,
    revokeShareLink,
    deleteShareLink,
    getPublicShareUrl,
    MAX_FILE_SIZE_BYTES,
} = useArtistPressKit()

const currentFolderId = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

onMounted(async () => {
    try {
        await fetchPressKit(props.artistId)
    } catch (err) {
        console.error('Failed to fetch press kit', err)
    }
})

// ── Tree helpers ───────────────────────────────────────────────────────────
const folderById = computed(() => {
    const m = new Map<string, PressKitFolder>()
    for (const f of folders.value) m.set(f.id, f)
    return m
})

const breadcrumb = computed<PressKitFolder[]>(() => {
    const trail: PressKitFolder[] = []
    let id: string | null = currentFolderId.value
    while (id) {
        const folder = folderById.value.get(id)
        if (!folder) break
        trail.unshift(folder)
        id = folder.parent_id
    }
    return trail
})

const currentFolders = computed(() =>
    folders.value
        .filter(f => f.parent_id === currentFolderId.value)
        .sort((a, b) => a.name.localeCompare(b.name)),
)

const currentFiles = computed(() =>
    files.value
        .filter(f => (f.folder_id ?? null) === currentFolderId.value)
        .sort((a, b) => a.name.localeCompare(b.name)),
)

function folderChildCount(folderId: string): number {
    const childFolders = folders.value.filter(f => f.parent_id === folderId).length
    const childFiles = files.value.filter(f => f.folder_id === folderId).length
    return childFolders + childFiles
}

function isDescendant(folderId: string, possibleAncestorId: string): boolean {
    let current: string | null = folderId
    while (current) {
        if (current === possibleAncestorId) return true
        const f: PressKitFolder | undefined = folderById.value.get(current)
        current = f ? f.parent_id : null
    }
    return false
}

function navigateTo(folderId: string | null) {
    currentFolderId.value = folderId
}

// ── Format helpers ─────────────────────────────────────────────────────────
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
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function isImage(file: PressKitFile): boolean {
    return !!file.mime_type?.startsWith('image/')
}

function isVideo(file: PressKitFile): boolean {
    return !!file.mime_type?.startsWith('video/')
}

// ── Upload progress ────────────────────────────────────────────────────────
interface UploadRow {
    id: number
    name: string
    progress: number
    status: 'uploading' | 'done' | 'error'
    error?: string
}
const uploads = ref<UploadRow[]>([])
let uploadCounter = 0

async function startUploads(fileList: File[] | FileList) {
    const filesArr = Array.from(fileList)
    for (const f of filesArr) {
        // `reactive()` is essential here: without it, `row` would be a plain
        // object reference and mutations like `row.progress = pct` would
        // bypass the ref's proxy and never trigger a re-render.
        const row = reactive<UploadRow>({
            id: ++uploadCounter,
            name: f.name,
            progress: 0,
            status: 'uploading',
        })
        uploads.value = [...uploads.value, row]

        if (f.size > MAX_FILE_SIZE_BYTES) {
            row.status = 'error'
            row.error = `Exceeds 5 GB limit (${formatBytes(f.size)})`
            continue
        }

        try {
            await uploadFile(props.artistId, f, {
                folder_id: currentFolderId.value,
                onProgress: (pct) => { row.progress = pct },
            })
            row.status = 'done'
            row.progress = 100
        } catch (err: unknown) {
            row.status = 'error'
            row.error = err instanceof Error ? err.message : 'Upload failed'
        }
    }
    // Prune completed uploads after a short delay.
    setTimeout(() => {
        uploads.value = uploads.value.filter(u => u.status === 'uploading' || u.status === 'error')
    }, 2000)
}

function triggerFilePicker() {
    fileInputRef.value?.click()
}

function onFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
        startUploads(input.files)
        input.value = ''
    }
}

// ── Drag-and-drop ──────────────────────────────────────────────────────────
const isDragOverPanel = ref(false)
const dragOverFolderId = ref<string | null>(null)

// Internal drag payloads
const draggingEntry = ref<{ type: 'folder' | 'file'; id: string } | null>(null)

function onPanelDragOver(e: DragEvent) {
    if (!e.dataTransfer) return
    // Only show the OS-drop overlay if files are being dragged.
    if (Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault()
        isDragOverPanel.value = true
    }
}

function onPanelDragLeave(e: DragEvent) {
    // Only clear when leaving the outer wrapper (not moving between children).
    if (e.target === e.currentTarget) {
        isDragOverPanel.value = false
    }
}

function onPanelDrop(e: DragEvent) {
    isDragOverPanel.value = false
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        e.preventDefault()
        startUploads(e.dataTransfer.files)
    }
}

function onEntryDragStart(type: 'folder' | 'file', id: string, e: DragEvent) {
    draggingEntry.value = { type, id }
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        // Set some text data so Chrome treats this as a valid drag.
        e.dataTransfer.setData('text/plain', id)
    }
}

function onEntryDragEnd() {
    draggingEntry.value = null
    dragOverFolderId.value = null
}

function onFolderDragOver(folderId: string, e: DragEvent) {
    // Ignore OS file drops on folder rows (let them fall through to the panel).
    if (!draggingEntry.value) return
    // Disallow dropping a folder into itself or its own descendant.
    if (draggingEntry.value.type === 'folder') {
        if (draggingEntry.value.id === folderId) return
        if (isDescendant(folderId, draggingEntry.value.id)) return
    }
    e.preventDefault()
    e.stopPropagation()
    dragOverFolderId.value = folderId
}

function onFolderDragLeave(folderId: string) {
    if (dragOverFolderId.value === folderId) dragOverFolderId.value = null
}

async function onFolderDrop(folderId: string, e: DragEvent) {
    if (!draggingEntry.value) return
    e.preventDefault()
    e.stopPropagation()
    const payload = draggingEntry.value
    draggingEntry.value = null
    dragOverFolderId.value = null
    try {
        if (payload.type === 'folder') {
            if (payload.id === folderId) return
            if (isDescendant(folderId, payload.id)) return
            await moveFolder(payload.id, folderId)
        } else {
            await moveFile(payload.id, folderId)
        }
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to move')
    }
}

// ── Folder modal (create/rename) ───────────────────────────────────────────
const folderModalOpen = ref(false)
const folderModalMode = ref<'create' | 'rename'>('create')
const folderModalTarget = ref<PressKitFolder | null>(null)
const folderModalName = ref('')
const folderModalError = ref('')
const folderModalSaving = ref(false)

function openCreateFolder() {
    folderModalMode.value = 'create'
    folderModalTarget.value = null
    folderModalName.value = ''
    folderModalError.value = ''
    folderModalOpen.value = true
}

function openRenameFolder(folder: PressKitFolder) {
    folderModalMode.value = 'rename'
    folderModalTarget.value = folder
    folderModalName.value = folder.name
    folderModalError.value = ''
    folderModalOpen.value = true
}

async function submitFolderModal() {
    const name = folderModalName.value.trim()
    if (!name) {
        folderModalError.value = 'Name is required.'
        return
    }
    if (/[/\\]/.test(name)) {
        folderModalError.value = 'Folder name cannot contain slashes.'
        return
    }
    folderModalSaving.value = true
    folderModalError.value = ''
    try {
        if (folderModalMode.value === 'create') {
            await createFolder(props.artistId, { name, parent_id: currentFolderId.value })
        } else if (folderModalTarget.value) {
            await renameFolder(folderModalTarget.value.id, name)
        }
        folderModalOpen.value = false
    } catch (err: unknown) {
        folderModalError.value = err instanceof Error ? err.message : 'Failed to save folder.'
    } finally {
        folderModalSaving.value = false
    }
}

// ── Rename file modal ──────────────────────────────────────────────────────
const fileRenameOpen = ref(false)
const fileRenameTarget = ref<PressKitFile | null>(null)
const fileRenameName = ref('')
const fileRenameError = ref('')
const fileRenameSaving = ref(false)

function openRenameFile(file: PressKitFile) {
    fileRenameTarget.value = file
    fileRenameName.value = file.name
    fileRenameError.value = ''
    fileRenameOpen.value = true
}

async function submitFileRename() {
    if (!fileRenameTarget.value) return
    const name = fileRenameName.value.trim()
    if (!name) {
        fileRenameError.value = 'Name is required.'
        return
    }
    fileRenameSaving.value = true
    fileRenameError.value = ''
    try {
        await renameFile(fileRenameTarget.value.id, name)
        fileRenameOpen.value = false
    } catch (err: unknown) {
        fileRenameError.value = err instanceof Error ? err.message : 'Failed to rename.'
    } finally {
        fileRenameSaving.value = false
    }
}

// ── Move modal ─────────────────────────────────────────────────────────────
const moveModalOpen = ref(false)
const moveTarget = ref<{ type: 'folder' | 'file'; id: string; name: string } | null>(null)
const moveSaving = ref(false)

// Flattened folder list with indentation for the move picker.
interface FlatFolderOption {
    id: string | null
    label: string
    depth: number
    disabled: boolean
}

const moveFolderOptions = computed<FlatFolderOption[]>(() => {
    const out: FlatFolderOption[] = [{ id: null, label: '⌂ (Root)', depth: 0, disabled: false }]

    function walk(parentId: string | null, depth: number) {
        const children = folders.value
            .filter(f => f.parent_id === parentId)
            .sort((a, b) => a.name.localeCompare(b.name))
        for (const f of children) {
            const isTarget = moveTarget.value?.type === 'folder' && moveTarget.value.id === f.id
            const isDescendantOfTarget =
                moveTarget.value?.type === 'folder' && isDescendant(f.id, moveTarget.value.id)
            out.push({
                id: f.id,
                label: `${'—'.repeat(depth)} ${f.name}`,
                depth,
                disabled: isTarget || isDescendantOfTarget,
            })
            walk(f.id, depth + 1)
        }
    }
    walk(null, 1)
    return out
})

const selectedMoveTarget = ref<string | null>(null)

function openMoveModal(type: 'folder' | 'file', id: string, name: string) {
    moveTarget.value = { type, id, name }
    const current =
        type === 'folder'
            ? folders.value.find(f => f.id === id)?.parent_id ?? null
            : files.value.find(f => f.id === id)?.folder_id ?? null
    selectedMoveTarget.value = current
    moveModalOpen.value = true
}

async function submitMove() {
    if (!moveTarget.value) return
    moveSaving.value = true
    try {
        if (moveTarget.value.type === 'folder') {
            await moveFolder(moveTarget.value.id, selectedMoveTarget.value)
        } else {
            await moveFile(moveTarget.value.id, selectedMoveTarget.value)
        }
        moveModalOpen.value = false
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to move')
    } finally {
        moveSaving.value = false
    }
}

// ── Delete handlers ────────────────────────────────────────────────────────
async function handleDeleteFolder(folder: PressKitFolder) {
    const childCount = folderChildCount(folder.id)
    const msg = childCount === 0
        ? `Delete folder "${folder.name}"?`
        : `Delete folder "${folder.name}" and all ${childCount} items inside it? This cannot be undone.`
    if (!confirm(msg)) return
    try {
        await deleteFolder(folder.id)
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete folder.')
    }
}

async function handleDeleteFile(file: PressKitFile) {
    if (!confirm(`Delete "${file.name}"?`)) return
    try {
        await deleteFile(file.id)
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete file.')
    }
}

// ── Download single file ───────────────────────────────────────────────────
/**
 * Tracks in-flight downloads for chunked files (keyed by file id). Lets the UI
 * show a progress indicator and prevents double-clicks while the browser is
 * streaming all chunks. Empty entries mean "not downloading".
 */
const chunkedDownloads = ref<Record<string, number>>({})

function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Let the browser commit the download before revoking — 1s is plenty in practice.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function handleDownloadFile(file: PressKitFile) {
    try {
        const url = await getDownloadUrl(file.id)
        if (url) {
            window.open(url, '_blank')
            return
        }

        // Chunked file — reassemble in the browser.
        chunkedDownloads.value = { ...chunkedDownloads.value, [file.id]: 0 }
        const blob = await downloadFileBlob(file.id, (pct) => {
            chunkedDownloads.value = { ...chunkedDownloads.value, [file.id]: pct }
        })
        triggerBlobDownload(blob, file.name)
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to download file.')
    } finally {
        const next = { ...chunkedDownloads.value }
        delete next[file.id]
        chunkedDownloads.value = next
    }
}

function isDownloading(fileId: string): boolean {
    return Object.prototype.hasOwnProperty.call(chunkedDownloads.value, fileId)
}

function downloadProgress(fileId: string): number {
    return chunkedDownloads.value[fileId] ?? 0
}

// ── Preview lightbox ───────────────────────────────────────────────────────
const previewFile = ref<PressKitFile | null>(null)
const previewUrl = ref('')
const previewIsBlobUrl = ref(false)
const previewLoading = ref(false)
const previewProgress = ref(0)

async function openPreview(file: PressKitFile) {
    if (!isImage(file) && !isVideo(file)) {
        handleDownloadFile(file)
        return
    }
    try {
        const url = await getPreviewUrl(file.id)
        if (url) {
            previewUrl.value = url
            previewIsBlobUrl.value = false
            previewFile.value = file
            return
        }

        // Chunked file — stream all parts into a Blob, then preview from an object URL.
        previewLoading.value = true
        previewProgress.value = 0
        previewFile.value = file
        const blob = await downloadFileBlob(file.id, (pct) => { previewProgress.value = pct })
        previewUrl.value = URL.createObjectURL(blob)
        previewIsBlobUrl.value = true
    } catch (err: unknown) {
        previewFile.value = null
        alert(err instanceof Error ? err.message : 'Failed to generate preview.')
    } finally {
        previewLoading.value = false
    }
}

function closePreview() {
    if (previewIsBlobUrl.value && previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value)
    }
    previewFile.value = null
    previewUrl.value = ''
    previewIsBlobUrl.value = false
    previewProgress.value = 0
}

// ── Share links ────────────────────────────────────────────────────────────
const shareModalOpen = ref(false)
const shareForm = ref({ label: '', expires_at: '' })
const shareSaving = ref(false)
const shareError = ref('')
const copiedLinkId = ref<string | null>(null)

function openShareModal() {
    shareForm.value = { label: '', expires_at: '' }
    shareError.value = ''
    shareModalOpen.value = true
}

async function submitShareLink() {
    shareSaving.value = true
    shareError.value = ''
    try {
        await createShareLink(props.artistId, {
            label: shareForm.value.label || null,
            expires_at: shareForm.value.expires_at
                ? new Date(`${shareForm.value.expires_at}T23:59:59`).toISOString()
                : null,
        })
        shareForm.value = { label: '', expires_at: '' }
    } catch (err: unknown) {
        shareError.value = err instanceof Error ? err.message : 'Failed to create link.'
    } finally {
        shareSaving.value = false
    }
}

async function copyShareLink(link: PressKitShareLink) {
    const url = getPublicShareUrl(link)
    try {
        await navigator.clipboard.writeText(url)
        copiedLinkId.value = link.id
        setTimeout(() => {
            if (copiedLinkId.value === link.id) copiedLinkId.value = null
        }, 1500)
    } catch {
        // Fallback: select text via prompt
        window.prompt('Copy this link:', url)
    }
}

async function handleRevokeLink(link: PressKitShareLink) {
    if (!confirm(`Revoke this share link? It will stop working immediately.`)) return
    try {
        await revokeShareLink(link.id)
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to revoke.')
    }
}

async function handleDeleteLink(link: PressKitShareLink) {
    if (!confirm(`Permanently delete this share link?`)) return
    try {
        await deleteShareLink(link.id)
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete.')
    }
}

function linkStatus(link: PressKitShareLink): { label: string; variant: 'success' | 'warning' | 'error' | 'muted' } {
    if (link.revoked_at) return { label: 'revoked', variant: 'error' }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
        return { label: 'expired', variant: 'muted' }
    }
    if (link.expires_at) return { label: 'active (expires)', variant: 'warning' }
    return { label: 'active', variant: 'success' }
}

async function handleUpdateExpiry(link: PressKitShareLink, expiresAt: string) {
    try {
        await updateShareLink(link.id, {
            expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        })
    } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to update expiry.')
    }
}

function expiresAtAsInput(iso: string | null): string {
    if (!iso) return ''
    return new Date(iso).toISOString().slice(0, 10)
}
</script>

<template>
    <div
        class="pk-panel"
        :class="{ 'is-drag-over': isDragOverPanel }"
        @dragover="onPanelDragOver"
        @dragleave="onPanelDragLeave"
        @drop="onPanelDrop"
    >
        <!-- Toolbar -->
        <div class="pk-toolbar">
            <div class="pk-breadcrumb">
                <button type="button" class="pk-crumb" @click="navigateTo(null)">Press Kit</button>
                <template v-for="crumb in breadcrumb" :key="crumb.id">
                    <span class="pk-crumb-sep">/</span>
                    <button type="button" class="pk-crumb" @click="navigateTo(crumb.id)">{{ crumb.name }}</button>
                </template>
            </div>
            <div class="pk-toolbar-actions">
                <SyvoraButton variant="ghost" @click="openCreateFolder">+ New Folder</SyvoraButton>
                <SyvoraButton @click="triggerFilePicker">Upload Files</SyvoraButton>
                <SyvoraButton variant="ghost" @click="openShareModal">Share</SyvoraButton>
                <input
                    ref="fileInputRef"
                    type="file"
                    accept="*/*"
                    multiple
                    hidden
                    @change="onFileInputChange"
                />
            </div>
        </div>

        <!-- Upload progress -->
        <div v-if="uploads.length > 0" class="pk-uploads">
            <div v-for="u in uploads" :key="u.id" class="pk-upload-row" :class="`is-${u.status}`">
                <span class="pk-upload-name">{{ u.name }}</span>
                <div v-if="u.status === 'uploading'" class="pk-upload-bar">
                    <div class="pk-upload-bar-fill" :style="{ width: `${u.progress}%` }" />
                </div>
                <span v-else-if="u.status === 'done'" class="pk-upload-status-ok">Uploaded</span>
                <span v-else class="pk-upload-status-err">{{ u.error ?? 'Error' }}</span>
            </div>
        </div>

        <!-- Drop overlay -->
        <div v-if="isDragOverPanel" class="pk-drop-overlay">
            <div class="pk-drop-overlay-inner">
                <div class="pk-drop-title">Drop files to upload</div>
                <div class="pk-drop-sub">
                    into
                    <strong>
                        {{ breadcrumb.length === 0 ? 'Press Kit' : breadcrumb[breadcrumb.length - 1].name }}
                    </strong>
                </div>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="pk-loading">Loading press kit…</div>

        <!-- Empty state -->
        <SyvoraEmptyState v-else-if="currentFolders.length === 0 && currentFiles.length === 0">
            <div class="pk-empty">
                <div class="pk-empty-title">
                    {{ breadcrumb.length === 0 ? 'This press kit is empty' : 'This folder is empty' }}
                </div>
                <p class="pk-empty-desc">
                    Upload photos, videos, riders, bios, and logos to share with promoters and journalists.
                </p>
                <SyvoraButton @click="triggerFilePicker">Upload your first file</SyvoraButton>
            </div>
        </SyvoraEmptyState>

        <!-- Grid -->
        <div v-else class="pk-grid">
            <!-- Folders -->
            <div
                v-for="folder in currentFolders"
                :key="`folder-${folder.id}`"
                class="pk-entry pk-entry-folder"
                :class="{ 'is-drop-target': dragOverFolderId === folder.id }"
                draggable="true"
                @dragstart="onEntryDragStart('folder', folder.id, $event)"
                @dragend="onEntryDragEnd"
                @dragover="onFolderDragOver(folder.id, $event)"
                @dragleave="onFolderDragLeave(folder.id)"
                @drop="onFolderDrop(folder.id, $event)"
                @dblclick="navigateTo(folder.id)"
            >
                <div class="pk-entry-icon pk-entry-icon-folder" @click="navigateTo(folder.id)">📁</div>
                <div class="pk-entry-body">
                    <button class="pk-entry-name pk-folder-link" @click="navigateTo(folder.id)">
                        {{ folder.name }}
                    </button>
                    <div class="pk-entry-meta">{{ folderChildCount(folder.id) }} items</div>
                </div>
                <div class="pk-entry-actions">
                    <button class="pk-action-btn" title="Rename" @click.stop="openRenameFolder(folder)">Rename</button>
                    <button class="pk-action-btn" title="Move" @click.stop="openMoveModal('folder', folder.id, folder.name)">Move</button>
                    <button class="pk-action-btn pk-action-danger" title="Delete" @click.stop="handleDeleteFolder(folder)">Delete</button>
                </div>
            </div>

            <!-- Files -->
            <div
                v-for="file in currentFiles"
                :key="`file-${file.id}`"
                class="pk-entry pk-entry-file"
                draggable="true"
                @dragstart="onEntryDragStart('file', file.id, $event)"
                @dragend="onEntryDragEnd"
                @click="openPreview(file)"
            >
                <div class="pk-entry-icon">
                    <span v-if="isImage(file)">🖼️</span>
                    <span v-else-if="isVideo(file)">🎬</span>
                    <span v-else-if="file.mime_type?.startsWith('audio/')">🎵</span>
                    <span v-else-if="file.mime_type === 'application/pdf'">📄</span>
                    <span v-else>📎</span>
                </div>
                <div class="pk-entry-body">
                    <div class="pk-entry-name" :title="file.name">{{ file.name }}</div>
                    <div class="pk-entry-meta">
                        {{ formatBytes(file.size_bytes) }} · {{ formatDate(file.created_at) }}
                    </div>
                </div>
                <div class="pk-entry-actions">
                    <button
                        class="pk-action-btn"
                        :title="isDownloading(file.id) ? 'Downloading…' : 'Download'"
                        :disabled="isDownloading(file.id)"
                        @click.stop="handleDownloadFile(file)"
                    >
                        {{ isDownloading(file.id) ? `Downloading ${downloadProgress(file.id)}%` : 'Download' }}
                    </button>
                    <button class="pk-action-btn" title="Rename" @click.stop="openRenameFile(file)">Rename</button>
                    <button class="pk-action-btn" title="Move" @click.stop="openMoveModal('file', file.id, file.name)">Move</button>
                    <button class="pk-action-btn pk-action-danger" title="Delete" @click.stop="handleDeleteFile(file)">Delete</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Folder create/rename modal -->
    <SyvoraModal
        v-if="folderModalOpen"
        :title="folderModalMode === 'create' ? 'New Folder' : 'Rename Folder'"
        size="sm"
        @close="folderModalOpen = false"
    >
        <div class="modal-form">
            <SyvoraFormField label="Folder name" for="pk-folder-name">
                <SyvoraInput
                    id="pk-folder-name"
                    v-model="folderModalName"
                    placeholder="e.g. Photos"
                    @keyup.enter="submitFolderModal"
                />
            </SyvoraFormField>
            <p v-if="folderModalError" class="error-msg">{{ folderModalError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="folderModalOpen = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="folderModalSaving" @click="submitFolderModal">
                {{ folderModalMode === 'create' ? 'Create' : 'Save' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- File rename modal -->
    <SyvoraModal
        v-if="fileRenameOpen"
        title="Rename File"
        size="sm"
        @close="fileRenameOpen = false"
    >
        <div class="modal-form">
            <SyvoraFormField label="File name" for="pk-file-name">
                <SyvoraInput
                    id="pk-file-name"
                    v-model="fileRenameName"
                    placeholder="e.g. press-photo-01.jpg"
                    @keyup.enter="submitFileRename"
                />
            </SyvoraFormField>
            <p v-if="fileRenameError" class="error-msg">{{ fileRenameError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="fileRenameOpen = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="fileRenameSaving" @click="submitFileRename">Save</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Move modal -->
    <SyvoraModal
        v-if="moveModalOpen"
        :title="moveTarget ? `Move “${moveTarget.name}”` : 'Move'"
        size="sm"
        @close="moveModalOpen = false"
    >
        <div class="modal-form">
            <SyvoraFormField label="Destination" for="pk-move-dest">
                <select id="pk-move-dest" v-model="selectedMoveTarget" class="pk-select">
                    <option
                        v-for="opt in moveFolderOptions"
                        :key="opt.id ?? 'root'"
                        :value="opt.id"
                        :disabled="opt.disabled"
                    >
                        {{ opt.label }}
                    </option>
                </select>
            </SyvoraFormField>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="moveModalOpen = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="moveSaving" @click="submitMove">Move</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Share modal -->
    <SyvoraModal
        v-if="shareModalOpen"
        title="Share press kit"
        size="lg"
        @close="shareModalOpen = false"
    >
        <div class="modal-form">
            <div class="pk-share-create">
                <SyvoraFormField label="Internal label (optional)" for="pk-share-label">
                    <SyvoraInput
                        id="pk-share-label"
                        v-model="shareForm.label"
                        placeholder="e.g. Groove Magazine, EXIT Festival 2026"
                    />
                </SyvoraFormField>
                <SyvoraFormField label="Expires on (optional)" for="pk-share-expiry">
                    <SyvoraInput
                        id="pk-share-expiry"
                        v-model="shareForm.expires_at"
                        type="date"
                    />
                </SyvoraFormField>
                <div class="pk-share-create-actions">
                    <SyvoraButton :loading="shareSaving" @click="submitShareLink">Create link</SyvoraButton>
                </div>
                <p v-if="shareError" class="error-msg">{{ shareError }}</p>
            </div>

            <div class="pk-share-divider" />

            <div v-if="shareLinks.length === 0" class="pk-share-empty">
                No share links yet. Create one above to hand out to a promoter or journalist.
            </div>
            <div v-else class="pk-share-list">
                <div v-for="link in shareLinks" :key="link.id" class="pk-share-row">
                    <div class="pk-share-row-main">
                        <div class="pk-share-row-header">
                            <span class="pk-share-label">{{ link.label || '(unlabelled)' }}</span>
                            <SyvoraBadge :variant="linkStatus(link).variant">
                                {{ linkStatus(link).label }}
                            </SyvoraBadge>
                        </div>
                        <div class="pk-share-url" :title="getPublicShareUrl(link)">
                            {{ getPublicShareUrl(link) }}
                        </div>
                        <div class="pk-share-meta">
                            <span>{{ link.download_count }} download{{ link.download_count === 1 ? '' : 's' }}</span>
                            <span v-if="link.last_downloaded_at"> · last on {{ formatDate(link.last_downloaded_at) }}</span>
                            <span> · created {{ formatDate(link.created_at) }}</span>
                        </div>
                        <div class="pk-share-expiry-edit">
                            <label class="pk-share-expiry-label" :for="`pk-expiry-${link.id}`">Expiry:</label>
                            <input
                                :id="`pk-expiry-${link.id}`"
                                type="date"
                                :value="expiresAtAsInput(link.expires_at)"
                                :disabled="!!link.revoked_at"
                                class="pk-expiry-input"
                                @change="handleUpdateExpiry(link, ($event.target as HTMLInputElement).value)"
                            />
                        </div>
                    </div>
                    <div class="pk-share-row-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="copyShareLink(link)">
                            {{ copiedLinkId === link.id ? 'Copied!' : 'Copy link' }}
                        </SyvoraButton>
                        <SyvoraButton
                            v-if="!link.revoked_at"
                            variant="ghost"
                            size="sm"
                            @click="handleRevokeLink(link)"
                        >Revoke</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteLink(link)">
                            Delete
                        </SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="shareModalOpen = false">Close</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Preview lightbox -->
    <div v-if="previewFile" class="pk-lightbox" @click.self="closePreview">
        <button class="pk-lightbox-close" type="button" @click="closePreview">✕</button>
        <div class="pk-lightbox-content">
            <div v-if="previewLoading" class="pk-lightbox-loading">
                <div class="pk-lightbox-loading-title">Preparing preview…</div>
                <div class="pk-lightbox-loading-bar">
                    <div class="pk-lightbox-loading-fill" :style="{ width: `${previewProgress}%` }" />
                </div>
                <div class="pk-lightbox-loading-sub">{{ previewProgress }}%</div>
            </div>
            <template v-else>
                <img v-if="isImage(previewFile)" :src="previewUrl" :alt="previewFile.name" />
                <video v-else-if="isVideo(previewFile)" :src="previewUrl" controls autoplay />
            </template>
            <div class="pk-lightbox-caption">{{ previewFile.name }}</div>
        </div>
    </div>
</template>

<style scoped>
.pk-panel {
    position: relative;
    min-height: 200px;
}

.pk-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
}

.pk-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    font-size: 0.9rem;
    color: var(--color-text-muted);
}

.pk-crumb {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    transition: color 0.15s;
}
.pk-crumb:hover { color: var(--color-text); }

.pk-crumb:last-child,
.pk-breadcrumb > .pk-crumb:not(:hover):last-of-type {
    color: var(--color-text);
    font-weight: 600;
}

.pk-crumb-sep { color: var(--color-border); }

.pk-toolbar-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

.pk-loading { color: var(--color-text-muted); padding: 2rem; text-align: center; }

.pk-empty { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1rem; }
.pk-empty-title { font-size: 1rem; font-weight: 700; color: var(--color-text); }
.pk-empty-desc { margin: 0 0 0.5rem; color: var(--color-text-muted); max-width: 40ch; }

.pk-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
}

.pk-entry {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.9rem;
    border-radius: 0.75rem;
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    background: var(--color-surface, rgba(255, 255, 255, 0.5));
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
    cursor: default;
}
.pk-entry:hover {
    border-color: var(--color-accent, #0c1a27);
}
.pk-entry.is-drop-target {
    border-color: var(--color-accent, #0c1a27);
    background: rgba(12, 26, 39, 0.06);
    transform: scale(1.005);
}

.pk-entry-folder { cursor: pointer; }
.pk-entry-file { cursor: pointer; }

.pk-entry-icon {
    width: 2.5rem; height: 2.5rem;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 0.5rem;
    flex-shrink: 0;
}
.pk-entry-icon-folder { background: rgba(234, 197, 85, 0.15); }

.pk-entry-body {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
}
.pk-entry-name {
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-size: inherit;
    font-family: inherit;
    cursor: inherit;
}
.pk-folder-link {
    cursor: pointer;
    color: var(--color-text);
}
.pk-folder-link:hover { color: var(--color-accent, #0c1a27); }

.pk-entry-meta { font-size: 0.8rem; color: var(--color-text-muted); }

.pk-entry-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.15s;
}
.pk-entry:hover .pk-entry-actions,
.pk-entry:focus-within .pk-entry-actions {
    opacity: 1;
}

.pk-action-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
    border-radius: 0.375rem;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s;
}
.pk-action-btn:hover {
    border-color: var(--color-border, rgba(0, 0, 0, 0.1));
    color: var(--color-text);
}
.pk-action-danger:hover {
    color: var(--color-error, #c23b3b);
    border-color: var(--color-error, #c23b3b);
}

/* Drop overlay */
.pk-drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(12, 26, 39, 0.1);
    border: 2px dashed var(--color-accent, #0c1a27);
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
}
.pk-drop-overlay-inner {
    text-align: center;
    color: var(--color-accent, #0c1a27);
}
.pk-drop-title { font-size: 1.1rem; font-weight: 700; }
.pk-drop-sub { font-size: 0.9rem; color: var(--color-text-muted); margin-top: 0.25rem; }

/* Uploads */
.pk-uploads {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.03);
}

.pk-upload-row {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 1rem;
    align-items: center;
    font-size: 0.85rem;
}

.pk-upload-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text);
}

.pk-upload-bar {
    height: 4px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 2px;
    overflow: hidden;
}
.pk-upload-bar-fill {
    height: 100%;
    background: var(--color-accent, #0c1a27);
    transition: width 0.25s;
}

.pk-upload-status-ok { color: #2e8b57; font-size: 0.8rem; text-align: right; }
.pk-upload-status-err { color: var(--color-error, #c23b3b); font-size: 0.8rem; text-align: right; }

/* Modal form */
.modal-form { display: flex; flex-direction: column; gap: 0.75rem; }
.error-msg { color: var(--color-error, #c23b3b); font-size: 0.85rem; margin: 0; }

.pk-select {
    width: 100%;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--color-border, rgba(0,0,0,0.1));
    border-radius: 0.5rem;
    background: #fff;
    font-family: inherit;
    font-size: 0.9rem;
}

/* Share */
.pk-share-create { display: flex; flex-direction: column; gap: 0.75rem; }
.pk-share-create-actions { display: flex; justify-content: flex-end; }
.pk-share-divider { height: 1px; background: var(--color-border-subtle, rgba(0,0,0,0.08)); margin: 0.75rem 0; }
.pk-share-empty { color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem 0; }

.pk-share-list { display: flex; flex-direction: column; gap: 0.75rem; }

.pk-share-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    padding: 0.9rem;
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.6);
}

.pk-share-row-main { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.pk-share-row-header { display: flex; align-items: center; gap: 0.5rem; }
.pk-share-label { font-weight: 600; color: var(--color-text); }
.pk-share-url {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pk-share-meta { font-size: 0.75rem; color: var(--color-text-muted); }
.pk-share-expiry-edit { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
.pk-share-expiry-label { font-size: 0.8rem; color: var(--color-text-muted); }
.pk-expiry-input {
    border: 1px solid var(--color-border, rgba(0,0,0,0.1));
    border-radius: 0.375rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
    font-family: inherit;
    background: #fff;
}
.pk-expiry-input:disabled { opacity: 0.5; cursor: not-allowed; }

.pk-share-row-actions { display: flex; flex-direction: column; gap: 0.3rem; align-items: flex-end; }

.btn-danger { color: var(--color-error, #c23b3b); }

/* Lightbox */
.pk-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: 2rem;
}
.pk-lightbox-close {
    position: absolute;
    top: 1rem; right: 1rem;
    width: 2.5rem; height: 2.5rem;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 1.25rem;
    cursor: pointer;
}
.pk-lightbox-content {
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
}
.pk-lightbox-content img,
.pk-lightbox-content video {
    max-width: 90vw;
    max-height: 80vh;
    border-radius: 0.5rem;
    background: #000;
}
.pk-lightbox-caption {
    color: #fff;
    font-size: 0.85rem;
    opacity: 0.8;
}

.pk-lightbox-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 2rem 3rem;
    color: #fff;
}
.pk-lightbox-loading-title { font-size: 1rem; font-weight: 600; }
.pk-lightbox-loading-bar {
    width: 240px;
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
}
.pk-lightbox-loading-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.9);
    transition: width 0.25s;
}
.pk-lightbox-loading-sub { font-size: 0.8rem; opacity: 0.65; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) {
    .pk-entry { grid-template-columns: 2.5rem 1fr; }
    .pk-entry-actions {
        grid-column: 1 / -1;
        opacity: 1;
        flex-wrap: wrap;
    }
    .pk-upload-row { grid-template-columns: 1fr; }
    .pk-share-row { grid-template-columns: 1fr; }
    .pk-share-row-actions { flex-direction: row; align-items: flex-start; flex-wrap: wrap; }
}
</style>
