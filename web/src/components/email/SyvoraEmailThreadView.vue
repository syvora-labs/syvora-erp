<script setup lang="ts">
import { computed } from 'vue'
import type { EmailMessage } from '../../composables/useEmail'

const props = defineProps<{
    messages: EmailMessage[]
}>()

const emit = defineEmits<{
    select: [uid: number]
}>()

interface Thread {
    subject: string
    messages: EmailMessage[]
    latestDate: string
    unreadCount: number
}

function normalizeSubject(subject: string): string {
    return subject.replace(/^(Re|Fwd|Fw):\s*/gi, '').trim().toLowerCase()
}

const threads = computed<Thread[]>(() => {
    const map = new Map<string, EmailMessage[]>()

    for (const msg of props.messages) {
        const key = normalizeSubject(msg.envelope.subject || '(no subject)')
        const arr = map.get(key)
        if (arr) {
            arr.push(msg)
        } else {
            map.set(key, [msg])
        }
    }

    const result: Thread[] = []
    for (const [, msgs] of map) {
        msgs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        result.push({
            subject: msgs[0].envelope.subject || '(no subject)',
            messages: msgs,
            latestDate: msgs[0].date,
            unreadCount: msgs.filter((m) => !m.flags.includes('\\Seen')).length,
        })
    }

    result.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())
    return result
})

function formatSender(msg: EmailMessage): string {
    const from = msg.envelope.from[0]
    return from?.name || from?.address || 'Unknown'
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
</script>

<template>
    <div class="thread-list">
        <div
            v-for="thread in threads"
            :key="thread.subject"
            class="thread-item"
            :class="{ 'thread-item--unread': thread.unreadCount > 0 }"
            @click="emit('select', thread.messages[0].uid)"
        >
            <div class="thread-top">
                <span class="thread-senders">
                    {{ thread.messages.map(formatSender).filter((v, i, a) => a.indexOf(v) === i).join(', ') }}
                </span>
                <span v-if="thread.messages.length > 1" class="thread-count">{{ thread.messages.length }}</span>
                <span class="thread-date">{{ formatDate(thread.latestDate) }}</span>
            </div>
            <div class="thread-subject" :class="{ 'thread-subject--unread': thread.unreadCount > 0 }">
                {{ thread.subject }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.thread-list {
    display: flex;
    flex-direction: column;
}

.thread-item {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: background 0.15s;
}

.thread-item:hover {
    background: rgba(0, 0, 0, 0.03);
}

.thread-item--unread {
    background: rgba(115, 195, 254, 0.05);
}

.thread-top {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    margin-bottom: 0.125rem;
}

.thread-senders {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.thread-item--unread .thread-senders {
    font-weight: 600;
    color: var(--color-text);
}

.thread-count {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-accent-dim, #4aacf5);
    background: rgba(115, 195, 254, 0.12);
    padding: 0 0.3rem;
    border-radius: 4px;
    flex-shrink: 0;
}

.thread-date {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
}

.thread-subject {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.thread-subject--unread {
    font-weight: 600;
    color: var(--color-text);
}
</style>
