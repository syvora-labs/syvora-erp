<script setup lang="ts">
import { computed } from 'vue'
import type { EmailFolder } from '../../composables/useEmail'

const props = defineProps<{
    folders: EmailFolder[]
    currentFolder: string
}>()

const emit = defineEmits<{
    select: [path: string]
}>()

const SPECIAL_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Jstrash', '\\Trash', '\\Junk']

const FOLDER_ICONS: Record<string, string> = {
    '\\Inbox': 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    '\\Sent': 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
    '\\Drafts': 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    '\\Trash': 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    '\\Junk': 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
}

const DEFAULT_ICON = 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'

const sortedFolders = computed(() => {
    const special: EmailFolder[] = []
    const custom: EmailFolder[] = []

    for (const f of props.folders) {
        if (f.specialUse && SPECIAL_ORDER.includes(f.specialUse)) {
            special.push(f)
        } else {
            custom.push(f)
        }
    }

    special.sort((a, b) => {
        const ai = SPECIAL_ORDER.indexOf(a.specialUse ?? '')
        const bi = SPECIAL_ORDER.indexOf(b.specialUse ?? '')
        return ai - bi
    })

    custom.sort((a, b) => a.name.localeCompare(b.name))

    return [...special, ...custom]
})

function getIcon(folder: EmailFolder): string {
    return FOLDER_ICONS[folder.specialUse ?? ''] ?? DEFAULT_ICON
}
</script>

<template>
    <div class="folder-list">
        <button
            v-for="folder in sortedFolders"
            :key="folder.path"
            class="folder-item"
            :class="{ 'folder-item--active': currentFolder === folder.path }"
            @click="emit('select', folder.path)"
            @dragover.prevent
            @drop.prevent="emit('select', folder.path)"
        >
            <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path :d="getIcon(folder)" />
            </svg>
            <span class="folder-name">{{ folder.name }}</span>
            <span v-if="folder.unread > 0" class="folder-badge">{{ folder.unread }}</span>
        </button>
    </div>
</template>

<style scoped>
.folder-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem;
}

.folder-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    border-radius: var(--radius-sm, 0.625rem);
    cursor: pointer;
    color: var(--color-text);
    font-size: 0.8125rem;
    text-align: left;
    transition: background 0.15s;
    width: 100%;
}

.folder-item:hover {
    background: rgba(0, 0, 0, 0.04);
}

.folder-item--active {
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent-dim, #4aacf5);
    font-weight: 600;
}

.folder-icon {
    flex-shrink: 0;
    opacity: 0.6;
}

.folder-item--active .folder-icon {
    opacity: 1;
}

.folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.folder-badge {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-accent-dim, #4aacf5);
    background: rgba(115, 195, 254, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    min-width: 1.25rem;
    text-align: center;
}
</style>
