<script setup lang="ts">
import { ref, watch } from 'vue'
import { SyvoraButton } from '@syvora/ui'
import type { EmailDetail } from '../../composables/useEmail'

const props = defineProps<{
    message: EmailDetail | null
    loading: boolean
}>()

const emit = defineEmits<{
    reply: [message: EmailDetail]
    replyAll: [message: EmailDetail]
    forward: [message: EmailDetail]
    delete: [uid: number]
    downloadAttachment: [uid: number, attachmentId: number, filename: string]
}>()

const showImages = ref(false)

watch(() => props.message?.uid, () => {
    showImages.value = false
})

function formatAddresses(addrs: { name?: string; address: string }[]): string {
    return addrs.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
}

function formatDate(iso: string | null): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString()
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}

function getSafeHtml(html: string): string {
    // Strip scripts to prevent sandbox console errors
    let safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Strip remote images unless opted in
    if (!showImages.value) {
        safe = safe.replace(/(<img[^>]+)src=["']https?:\/\/[^"']+["']/gi, '$1src=""')
    }
    return safe
}
</script>

<template>
    <div class="detail-pane">
        <div v-if="loading" class="detail-loading">Loading message...</div>
        <div v-else-if="!message" class="detail-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p>Select a message to read</p>
        </div>
        <template v-else>
            <div class="detail-header">
                <h2 class="detail-subject">{{ message.subject || '(no subject)' }}</h2>
                <div class="detail-actions">
                    <SyvoraButton variant="ghost" size="sm" @click="emit('reply', message)">Reply</SyvoraButton>
                    <SyvoraButton variant="ghost" size="sm" @click="emit('replyAll', message)">Reply All</SyvoraButton>
                    <SyvoraButton variant="ghost" size="sm" @click="emit('forward', message)">Forward</SyvoraButton>
                    <SyvoraButton variant="ghost" size="sm" @click="emit('delete', message.uid)">Delete</SyvoraButton>
                </div>
            </div>

            <div class="detail-meta">
                <div class="meta-row">
                    <span class="meta-label">From</span>
                    <span class="meta-value">{{ formatAddresses(message.from) }}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">To</span>
                    <span class="meta-value">{{ formatAddresses(message.to) }}</span>
                </div>
                <div v-if="message.cc.length" class="meta-row">
                    <span class="meta-label">Cc</span>
                    <span class="meta-value">{{ formatAddresses(message.cc) }}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Date</span>
                    <span class="meta-value">{{ formatDate(message.date) }}</span>
                </div>
            </div>

            <div v-if="message.html && !showImages" class="detail-images-notice">
                <span>Remote images are hidden for privacy.</span>
                <button class="show-images-btn" @click="showImages = true">Show images</button>
            </div>

            <div class="detail-body">
                <iframe
                    v-if="message.html"
                    class="detail-iframe"
                    :srcdoc="getSafeHtml(message.html)"
                    sandbox="allow-same-origin"
                    referrerpolicy="no-referrer"
                ></iframe>
                <pre v-else class="detail-text">{{ message.text }}</pre>
            </div>

            <div v-if="message.attachments.length > 0" class="detail-attachments">
                <h3 class="attachments-title">Attachments ({{ message.attachments.length }})</h3>
                <div class="attachments-grid">
                    <button
                        v-for="att in message.attachments"
                        :key="att.id"
                        class="attachment-chip"
                        @click="emit('downloadAttachment', message.uid, att.id, att.filename)"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                        <span class="attachment-name">{{ att.filename }}</span>
                        <span class="attachment-size">{{ formatSize(att.size) }}</span>
                    </button>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.detail-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
}

.detail-loading,
.detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.75rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

.detail-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.detail-subject {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.3;
}

.detail-actions {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
}

.detail-meta {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.meta-row {
    display: flex;
    gap: 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.4;
}

.meta-label {
    color: var(--color-text-muted);
    min-width: 3rem;
    font-weight: 500;
}

.meta-value {
    color: var(--color-text);
    word-break: break-all;
}

.detail-images-notice {
    padding: 0.5rem 1.25rem;
    background: rgba(115, 195, 254, 0.08);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.show-images-btn {
    background: none;
    border: none;
    color: var(--color-accent-dim, #4aacf5);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0;
}

.show-images-btn:hover {
    text-decoration: underline;
}

.detail-body {
    flex: 1;
    min-height: 0;
    padding: 0;
}

.detail-iframe {
    width: 100%;
    height: 100%;
    min-height: 400px;
    border: none;
    background: #fff;
}

.detail-text {
    padding: 1.25rem;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    line-height: 1.6;
    color: var(--color-text);
}

.detail-attachments {
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
}

.attachments-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
}

.attachments-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
}

.attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.72));
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-btn, 0.875rem);
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--color-text);
    transition: background 0.15s, box-shadow 0.15s;
}

.attachment-chip:hover {
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.attachment-name {
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.attachment-size {
    color: var(--color-text-muted);
    font-size: 0.6875rem;
}
</style>
