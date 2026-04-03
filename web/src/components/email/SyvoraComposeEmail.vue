<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SyvoraButton } from '@syvora/ui'
import SyvoraContactAutocomplete from './SyvoraContactAutocomplete.vue'
import { useEmail } from '../../composables/useEmail'
import type { EmailDetail } from '../../composables/useEmail'

const props = defineProps<{
    mode: 'compose' | 'reply' | 'replyAll' | 'forward'
    replyTo?: EmailDetail | null
}>()

const emit = defineEmits<{
    sent: []
    cancel: []
}>()

const { sendMessage, replyMessage, forwardMessage, saveDraft, settings } = useEmail()

const to = ref('')
const cc = ref('')
const bcc = ref('')
const subject = ref('')
const body = ref('')
const showCcBcc = ref(false)
const sending = ref(false)
const error = ref('')
const attachments = ref<{ filename: string; content: string; contentType: string }[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
    if (props.replyTo) {
        const msg = props.replyTo
        if (props.mode === 'reply' || props.mode === 'replyAll') {
            to.value = msg.from.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
            if (props.mode === 'replyAll' && msg.cc.length) {
                cc.value = msg.cc.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
                showCcBcc.value = true
            }
            subject.value = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`
            body.value = buildQuote(msg)
        } else if (props.mode === 'forward') {
            subject.value = msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`
            body.value = buildForwardBody(msg)
        }
    }

    // Append signature
    if (settings.value?.signature_html) {
        body.value += `\n\n--\n${settings.value.signature_html}`
    }
})

function buildQuote(msg: EmailDetail): string {
    const date = msg.date ? new Date(msg.date).toLocaleString() : ''
    const from = msg.from.map((a) => a.name || a.address).join(', ')
    const quoted = (msg.text || '').split('\n').map((l) => `> ${l}`).join('\n')
    return `\n\nOn ${date}, ${from} wrote:\n${quoted}`
}

function buildForwardBody(msg: EmailDetail): string {
    const date = msg.date ? new Date(msg.date).toLocaleString() : ''
    const from = msg.from.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
    const toAddrs = msg.to.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
    return `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${date}\nSubject: ${msg.subject}\nTo: ${toAddrs}\n\n${msg.text || ''}`
}

async function handleAttachFile() {
    fileInput.value?.click()
}

async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files) return

    for (const file of files) {
        const buffer = await file.arrayBuffer()
        const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        attachments.value.push({
            filename: file.name,
            content: base64,
            contentType: file.type || 'application/octet-stream',
        })
    }
    input.value = ''
}

function removeAttachment(index: number) {
    attachments.value.splice(index, 1)
}

async function handleSend() {
    if (!to.value.trim()) {
        error.value = 'Please specify at least one recipient'
        return
    }

    sending.value = true
    error.value = ''
    try {
        const htmlBody = `<div style="font-family: sans-serif; font-size: 14px;">${body.value.replace(/\n/g, '<br>')}</div>`
        const params = {
            to: to.value,
            cc: cc.value || undefined,
            bcc: bcc.value || undefined,
            subject: subject.value,
            html: htmlBody,
            text: body.value,
            attachments: attachments.value.length ? attachments.value : undefined,
        }

        if (props.mode === 'reply' || props.mode === 'replyAll') {
            await replyMessage({
                ...params,
                inReplyTo: props.replyTo?.messageId ?? '',
                references: [
                    ...(props.replyTo?.references ?? []),
                    props.replyTo?.messageId ?? '',
                ].filter(Boolean),
            })
        } else if (props.mode === 'forward') {
            await forwardMessage(params)
        } else {
            await sendMessage(params)
        }

        emit('sent')
    } catch (e: any) {
        error.value = e.message
    } finally {
        sending.value = false
    }
}

async function handleSaveDraft() {
    try {
        await saveDraft({
            to: to.value || undefined,
            cc: cc.value || undefined,
            bcc: bcc.value || undefined,
            subject: subject.value,
            html: body.value ? `<div>${body.value.replace(/\n/g, '<br>')}</div>` : undefined,
            text: body.value,
        })
        emit('cancel')
    } catch (e: any) {
        error.value = e.message
    }
}

const modeLabel = {
    compose: 'New Email',
    reply: 'Reply',
    replyAll: 'Reply All',
    forward: 'Forward',
}
</script>

<template>
    <div class="compose">
        <div class="compose-header">
            <h2 class="compose-title">{{ modeLabel[mode] }}</h2>
            <div class="compose-header-actions">
                <SyvoraButton variant="ghost" size="sm" @click="handleSaveDraft">Save Draft</SyvoraButton>
                <SyvoraButton variant="ghost" size="sm" @click="emit('cancel')">Discard</SyvoraButton>
            </div>
        </div>

        <div class="compose-fields">
            <SyvoraContactAutocomplete v-model="to" label="To" />

            <button v-if="!showCcBcc" class="toggle-cc" @click="showCcBcc = true">Cc / Bcc</button>
            <template v-if="showCcBcc">
                <SyvoraContactAutocomplete v-model="cc" label="Cc" />
                <SyvoraContactAutocomplete v-model="bcc" label="Bcc" />
            </template>

            <div class="field">
                <label class="field-label">Subject</label>
                <input v-model="subject" class="field-input" type="text" />
            </div>
        </div>

        <div class="compose-body">
            <textarea
                v-model="body"
                class="compose-textarea"
                placeholder="Write your message..."
            ></textarea>
        </div>

        <div v-if="attachments.length > 0" class="compose-attachments">
            <div
                v-for="(att, i) in attachments"
                :key="i"
                class="compose-attachment"
            >
                <span class="compose-attachment-name">{{ att.filename }}</span>
                <button class="compose-attachment-remove" @click="removeAttachment(i)">&times;</button>
            </div>
        </div>

        <div class="compose-footer">
            <div class="compose-footer-left">
                <SyvoraButton variant="primary" size="sm" :disabled="sending" @click="handleSend">
                    {{ sending ? 'Sending...' : 'Send' }}
                </SyvoraButton>
                <button class="attach-btn" @click="handleAttachFile" title="Attach file">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                </button>
                <input ref="fileInput" type="file" multiple hidden @change="onFileSelected" />
            </div>
            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
    </div>
</template>

<style scoped>
.compose {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.compose-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.compose-title {
    font-size: 1rem;
    font-weight: 600;
}

.compose-header-actions {
    display: flex;
    gap: 0.375rem;
}

.compose-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.toggle-cc {
    background: none;
    border: none;
    color: var(--color-accent-dim, #4aacf5);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;
    align-self: flex-start;
}

.toggle-cc:hover {
    text-decoration: underline;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
}

.field-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm, 0.625rem);
    background: var(--color-surface, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--glass-blur-light);
    font-size: 0.8125rem;
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus {
    border-color: var(--color-accent, #73c3fe);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.15);
}

.compose-body {
    flex: 1;
    min-height: 0;
    padding: 0;
}

.compose-textarea {
    width: 100%;
    height: 100%;
    min-height: 200px;
    padding: 1rem 1.25rem;
    border: none;
    background: none;
    font-size: 0.875rem;
    font-family: inherit;
    line-height: 1.6;
    color: var(--color-text);
    resize: none;
    outline: none;
}

.compose-textarea::placeholder {
    color: var(--color-text-muted);
}

.compose-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.5rem 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
}

.compose-attachment {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(115, 195, 254, 0.1);
    border-radius: 0.375rem;
    font-size: 0.75rem;
}

.compose-attachment-name {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.compose-attachment-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 1rem;
    line-height: 1;
    padding: 0;
}

.compose-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
}

.compose-footer-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.attach-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    padding: 0.25rem;
    border-radius: 0.375rem;
    transition: color 0.15s, background 0.15s;
}

.attach-btn:hover {
    color: var(--color-text);
    background: rgba(0, 0, 0, 0.04);
}

.error-msg {
    color: var(--color-error, #dc2626);
    font-size: 0.8125rem;
}
</style>
