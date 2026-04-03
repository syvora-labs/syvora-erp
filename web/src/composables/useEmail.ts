import { ref, readonly, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailAddress {
    name?: string
    address: string
}

export interface EmailEnvelope {
    subject: string
    from: EmailAddress[]
    to: EmailAddress[]
    date: string | null
    messageId: string | null
    inReplyTo: string | null
}

export interface EmailMessage {
    uid: number
    seq: number
    flags: string[]
    size: number
    date: string
    envelope: EmailEnvelope
}

export interface EmailDetail {
    uid: number
    subject: string
    from: EmailAddress[]
    to: EmailAddress[]
    cc: EmailAddress[]
    bcc: EmailAddress[]
    date: string | null
    html: string | null
    text: string
    messageId: string | null
    inReplyTo: string | null
    references: string[]
    attachments: { id: number; filename: string; contentType: string; size: number; part?: string }[]
}

export interface EmailFolder {
    path: string
    name: string
    delimiter: string
    flags: string[]
    specialUse: string | null
    unread: number
}

export interface EmailSettings {
    id: string
    email_address: string
    display_name: string | null
    signature_html: string | null
}

// ── State ────────────────────────────────────────────────────────────────────

const folders = ref<EmailFolder[]>([])
const messages = ref<EmailMessage[]>([])
const selectedMessage = ref<EmailDetail | null>(null)
const currentFolder = ref('INBOX')
const loading = ref(false)
const loadingMessage = ref(false)
const totalMessages = ref(0)
const currentPage = ref(1)
const settings = ref<EmailSettings | null>(null)
const configured = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null
const polling = ref(false)

// ── API helpers ──────────────────────────────────────────────────────────────
// All email operations go through the Supabase Edge Function at /functions/v1/email/*.

function getEdgeFunctionBaseUrl(): string {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    return `${supabaseUrl}/functions/v1/email`
}

async function getAuthHeaders(): Promise<HeadersInit> {
    const { data } = await supabase.auth.getSession()
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.session?.access_token ?? ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${getEdgeFunctionBaseUrl()}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? `Request failed: ${res.status}`)
    }
    return res.json()
}

// ── Settings ─────────────────────────────────────────────────────────────────

async function fetchSettings(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
        .from('user_email_settings')
        .select('id, email_address, display_name, signature_html')
        .eq('user_id', user.id)
        .maybeSingle()

    if (error) throw error
    settings.value = data as EmailSettings | null
    configured.value = !!data
}

async function saveSettings(form: {
    email_address: string
    password: string
    display_name: string | null
    signature_html: string | null
}): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { mandator } = useMandator()
    if (!mandator.value) throw new Error('No mandator')

    const { data: encrypted, error: encError } = await supabase
        .rpc('encrypt_email_password', {
            p_password: form.password,
            p_key: import.meta.env.VITE_EMAIL_ENCRYPTION_KEY,
        })
    if (encError) throw encError

    if (settings.value) {
        const { error } = await supabase
            .from('user_email_settings')
            .update({
                email_address: form.email_address,
                encrypted_password: encrypted,
                display_name: form.display_name,
                signature_html: form.signature_html,
            })
            .eq('id', settings.value.id)
        if (error) throw error
    } else {
        const { error } = await supabase
            .from('user_email_settings')
            .insert({
                user_id: user.id,
                mandator_id: mandator.value.id,
                email_address: form.email_address,
                encrypted_password: encrypted,
                display_name: form.display_name,
                signature_html: form.signature_html,
            })
        if (error) throw error
    }

    await fetchSettings()
}

async function deleteSettings(): Promise<void> {
    if (!settings.value) return
    const { error } = await supabase
        .from('user_email_settings')
        .delete()
        .eq('id', settings.value.id)
    if (error) throw error
    settings.value = null
    configured.value = false
}

// ── Init (folders + messages in one IMAP connection) ────────────────────────

async function fetchInit(folder?: string, page?: number): Promise<void> {
    loading.value = true
    try {
        const f = folder ?? currentFolder.value
        const p = page ?? currentPage.value
        currentFolder.value = f
        currentPage.value = p

        const data = await apiFetch(`/init?folder=${encodeURIComponent(f)}&page=${p}&limit=50`)
        folders.value = data.folders
        messages.value = data.messages
        totalMessages.value = data.total
    } finally {
        loading.value = false
    }
}

// ── Folders ──────────────────────────────────────────────────────────────────

async function fetchFolders(): Promise<void> {
    const data = await apiFetch('/folders')
    folders.value = data
}

// ── Messages ─────────────────────────────────────────────────────────────────

async function fetchMessages(folder?: string, page?: number): Promise<void> {
    loading.value = true
    try {
        const f = folder ?? currentFolder.value
        const p = page ?? currentPage.value
        currentFolder.value = f
        currentPage.value = p

        const data = await apiFetch(`/messages?folder=${encodeURIComponent(f)}&page=${p}&limit=50`)
        messages.value = data.messages
        totalMessages.value = data.total
    } finally {
        loading.value = false
    }
}

async function fetchMessage(uid: number, folder?: string): Promise<void> {
    loadingMessage.value = true
    try {
        const f = folder ?? currentFolder.value
        const data = await apiFetch(`/messages/${uid}?folder=${encodeURIComponent(f)}`)
        selectedMessage.value = data

        const msg = messages.value.find((m) => m.uid === uid)
        if (msg && !msg.flags.includes('\\Seen')) {
            msg.flags.push('\\Seen')
        }
    } finally {
        loadingMessage.value = false
    }
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function sendMessage(params: {
    to: string
    cc?: string
    bcc?: string
    subject: string
    html: string
    text?: string
    attachments?: { filename: string; content: string; contentType: string }[]
}): Promise<void> {
    await apiFetch('/send', { method: 'POST', body: JSON.stringify(params) })
}

async function replyMessage(params: {
    to: string
    cc?: string
    bcc?: string
    subject: string
    html: string
    text?: string
    inReplyTo: string
    references: string[]
    attachments?: { filename: string; content: string; contentType: string }[]
}): Promise<void> {
    await apiFetch('/reply', { method: 'POST', body: JSON.stringify(params) })
}

async function forwardMessage(params: {
    to: string
    cc?: string
    bcc?: string
    subject: string
    html: string
    text?: string
    attachments?: { filename: string; content: string; contentType: string }[]
}): Promise<void> {
    await apiFetch('/forward', { method: 'POST', body: JSON.stringify(params) })
}

async function moveMessage(uid: number, from: string, to: string): Promise<void> {
    await apiFetch(`/messages/${uid}/move`, {
        method: 'PUT',
        body: JSON.stringify({ from, to }),
    })
    messages.value = messages.value.filter((m) => m.uid !== uid)
    if (selectedMessage.value?.uid === uid) {
        selectedMessage.value = null
    }
}

async function updateFlags(uid: number, add?: string[], remove?: string[]): Promise<void> {
    await apiFetch(`/messages/${uid}/flags`, {
        method: 'PUT',
        body: JSON.stringify({ folder: currentFolder.value, add, remove }),
    })
    const msg = messages.value.find((m) => m.uid === uid)
    if (msg) {
        if (add) msg.flags.push(...add.filter((f) => !msg.flags.includes(f)))
        if (remove) msg.flags = msg.flags.filter((f) => !remove?.includes(f))
    }
}

async function deleteMessage(uid: number, permanent = false): Promise<void> {
    await apiFetch(`/messages/${uid}`, {
        method: 'DELETE',
        body: JSON.stringify({ folder: currentFolder.value, permanent }),
    })
    messages.value = messages.value.filter((m) => m.uid !== uid)
    if (selectedMessage.value?.uid === uid) {
        selectedMessage.value = null
    }
}

async function saveDraft(params: {
    to?: string
    cc?: string
    bcc?: string
    subject?: string
    html?: string
    text?: string
}): Promise<void> {
    await apiFetch('/drafts', { method: 'POST', body: JSON.stringify(params) })
}

// ── Contact suggestions ──────────────────────────────────────────────────────

async function suggestContacts(query: string): Promise<string[]> {
    if (!query || query.length < 2) return []
    return apiFetch(`/contacts?q=${encodeURIComponent(query)}`)
}

// ── Attachment download ──────────────────────────────────────────────────────

function getAttachmentUrl(uid: number, attachmentId: number): string {
    const att = selectedMessage.value?.attachments.find((a) => a.id === attachmentId)
    const params = new URLSearchParams({
        folder: currentFolder.value,
        part: att?.part ?? String(attachmentId + 2),
        filename: att?.filename ?? 'download',
        contentType: att?.contentType ?? 'application/octet-stream',
    })
    return `${getEdgeFunctionBaseUrl()}/messages/${uid}/attachments/${attachmentId}?${params}`
}

// ── Polling ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000

function startPolling(): void {
    if (pollTimer) return
    polling.value = true
    pollTimer = setInterval(async () => {
        try {
            await fetchInit()
        } catch {
            // Silently retry on next interval
        }
    }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
    }
    polling.value = false
}

function switchFolder(folder: string): void {
    currentFolder.value = folder
    currentPage.value = 1
    selectedMessage.value = null
    fetchMessages(folder, 1)
}

// ── Computed helpers ─────────────────────────────────────────────────────────

const unreadCount = computed(() => {
    const inbox = folders.value.find((f) => f.path === 'INBOX' || f.specialUse === '\\Inbox')
    return inbox?.unread ?? 0
})

const isRead = (msg: EmailMessage) => msg.flags.includes('\\Seen')
const isFlagged = (msg: EmailMessage) => msg.flags.includes('\\Flagged')

// ── Export ───────────────────────────────────────────────────────────────────

export function useEmail() {
    return {
        folders,
        messages,
        selectedMessage,
        currentFolder: readonly(currentFolder),
        loading: readonly(loading),
        loadingMessage: readonly(loadingMessage),
        totalMessages: readonly(totalMessages),
        currentPage: readonly(currentPage),
        settings,
        configured: readonly(configured),
        polling: readonly(polling),
        unreadCount,

        fetchSettings,
        saveSettings,
        deleteSettings,

        fetchInit,
        fetchFolders,
        fetchMessages,
        fetchMessage,
        sendMessage,
        replyMessage,
        forwardMessage,
        moveMessage,
        updateFlags,
        deleteMessage,
        saveDraft,
        suggestContacts,
        getAttachmentUrl,

        startPolling,
        stopPolling,
        switchFolder,

        isRead,
        isFlagged,
    }
}
