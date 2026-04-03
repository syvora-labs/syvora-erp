<script setup lang="ts">
import type { EmailMessage } from '../../composables/useEmail'

const props = defineProps<{
    messages: EmailMessage[]
    selectedUid: number | null
    loading: boolean
}>()

const emit = defineEmits<{
    select: [uid: number]
    toggleFlag: [uid: number, flag: string]
}>()

function formatSender(msg: EmailMessage): string {
    const from = msg.envelope.from[0]
    if (!from) return 'Unknown'
    return from.name || from.address
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    if (diff < 604800000) {
        return d.toLocaleDateString([], { weekday: 'short' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
}

const isRead = (msg: EmailMessage) => msg.flags.includes('\\Seen')
const isFlagged = (msg: EmailMessage) => msg.flags.includes('\\Flagged')
</script>

<template>
    <div class="message-list">
        <div v-if="loading && messages.length === 0" class="message-list-loading">
            Loading messages...
        </div>
        <div v-else-if="messages.length === 0" class="message-list-empty">
            No messages in this folder
        </div>
        <button
            v-for="msg in messages"
            :key="msg.uid"
            class="message-item"
            :class="{
                'message-item--unread': !isRead(msg),
                'message-item--selected': selectedUid === msg.uid,
            }"
            draggable="true"
            @dragstart="$event.dataTransfer?.setData('text/plain', String(msg.uid))"
            @click="emit('select', msg.uid)"
        >
            <button
                class="flag-btn"
                :class="{ 'flag-btn--active': isFlagged(msg) }"
                @click.stop="emit('toggleFlag', msg.uid, '\\Flagged')"
                title="Toggle flag"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" :fill="isFlagged(msg) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            </button>
            <div class="message-content">
                <div class="message-top">
                    <span class="message-sender" :class="{ 'message-sender--unread': !isRead(msg) }">
                        {{ formatSender(msg) }}
                    </span>
                    <span class="message-date">{{ formatDate(msg.date) }}</span>
                </div>
                <div class="message-subject" :class="{ 'message-subject--unread': !isRead(msg) }">
                    {{ msg.envelope.subject || '(no subject)' }}
                </div>
                <div class="message-meta">
                    <span class="message-size">{{ formatSize(msg.size) }}</span>
                </div>
            </div>
        </button>
    </div>
</template>

<style scoped>
.message-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex: 1;
}

.message-list-loading,
.message-list-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
}

.message-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    text-align: left;
    color: var(--color-text);
    transition: background 0.15s;
    width: 100%;
}

.message-item:hover {
    background: rgba(0, 0, 0, 0.03);
}

.message-item--selected {
    background: rgba(115, 195, 254, 0.1);
}

.message-item--unread {
    background: rgba(115, 195, 254, 0.05);
}

.message-item--unread:hover {
    background: rgba(115, 195, 254, 0.1);
}

.flag-btn {
    background: none;
    border: none;
    padding: 0.25rem;
    cursor: pointer;
    color: var(--color-text-muted);
    opacity: 0.3;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
    margin-top: 0.125rem;
}

.flag-btn:hover,
.flag-btn--active {
    opacity: 1;
    color: var(--color-warning, #d97706);
}

.message-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
}

.message-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
}

.message-sender {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.message-sender--unread {
    font-weight: 600;
    color: var(--color-text);
}

.message-date {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
}

.message-subject {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.message-subject--unread {
    font-weight: 600;
    color: var(--color-text);
}

.message-meta {
    display: flex;
    gap: 0.5rem;
}

.message-size {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    opacity: 0.6;
}
</style>
