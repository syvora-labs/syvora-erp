<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SyvoraButton, SyvoraTabs } from '@syvora/ui'
import type { TabItem } from '@syvora/ui'
import { useEmail } from '../composables/useEmail'
import type { EmailDetail } from '../composables/useEmail'
import SyvoraEmailLayout from '../components/email/SyvoraEmailLayout.vue'
import SyvoraFolderList from '../components/email/SyvoraFolderList.vue'
import SyvoraMessageList from '../components/email/SyvoraMessageList.vue'
import SyvoraMessageDetail from '../components/email/SyvoraMessageDetail.vue'
import SyvoraComposeEmail from '../components/email/SyvoraComposeEmail.vue'
import SyvoraEmailSettings from '../components/email/SyvoraEmailSettings.vue'

const route = useRoute()
const router = useRouter()

const {
    folders,
    messages,
    selectedMessage,
    currentFolder,
    loading,
    loadingMessage,
    configured,
    fetchSettings,
    fetchInit,
    fetchMessage,
    switchFolder,
    deleteMessage,
    updateFlags,
    getAttachmentUrl,
    startPolling,
    stopPolling,
} = useEmail()

const tabs: TabItem[] = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'settings', label: 'Settings' },
]
const activeTab = ref('inbox')

const composeMode = ref<'compose' | 'reply' | 'replyAll' | 'forward' | null>(null)
const replyToMessage = ref<EmailDetail | null>(null)

onMounted(async () => {
    await fetchSettings()

    if (configured.value) {
        const folder = route.params.folder as string
        await fetchInit(folder || undefined)
        startPolling()

        const uid = route.params.uid as string
        if (uid) {
            await fetchMessage(parseInt(uid), folder || undefined)
        }
    }
})

onUnmounted(() => {
    stopPolling()
})

// Sync route params with state
watch(() => route.params, (params) => {
    if (route.path.startsWith('/email/compose')) {
        composeMode.value = 'compose'
        return
    }
    const folder = params.folder as string
    const uid = params.uid as string
    if (folder && folder !== currentFolder.value) {
        switchFolder(folder)
    }
    if (uid) {
        fetchMessage(parseInt(uid), folder || undefined)
    }
}, { deep: true })

function handleFolderSelect(path: string) {
    switchFolder(path)
    router.push(`/email/${encodeURIComponent(path)}`)
}

function handleMessageSelect(uid: number) {
    fetchMessage(uid)
    router.push(`/email/${encodeURIComponent(currentFolder.value)}/${uid}`)
}

function handleCompose() {
    composeMode.value = 'compose'
    replyToMessage.value = null
}

function handleReply(msg: EmailDetail) {
    composeMode.value = 'reply'
    replyToMessage.value = msg
}

function handleReplyAll(msg: EmailDetail) {
    composeMode.value = 'replyAll'
    replyToMessage.value = msg
}

function handleForward(msg: EmailDetail) {
    composeMode.value = 'forward'
    replyToMessage.value = msg
}

function handleSent() {
    composeMode.value = null
    replyToMessage.value = null
    fetchInit()
}

function handleCancelCompose() {
    composeMode.value = null
    replyToMessage.value = null
}

async function handleDelete(uid: number) {
    await deleteMessage(uid)
    fetchInit()
}

async function handleToggleFlag(uid: number, flag: string) {
    const msg = messages.value.find((m) => m.uid === uid)
    if (!msg) return
    if (msg.flags.includes(flag)) {
        await updateFlags(uid, undefined, [flag])
    } else {
        await updateFlags(uid, [flag])
    }
}

async function handleDownloadAttachment(uid: number, attachmentId: number, filename: string) {
    const url = getAttachmentUrl(uid, attachmentId)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}
</script>

<template>
    <div class="email-view">
        <div class="email-toolbar">
            <SyvoraTabs :tabs="tabs" v-model="activeTab" />
            <SyvoraButton v-if="activeTab === 'inbox' && configured" variant="primary" size="sm" @click="handleCompose">
                Compose
            </SyvoraButton>
        </div>

        <template v-if="activeTab === 'settings'">
            <SyvoraEmailSettings />
        </template>

        <template v-else-if="!configured">
            <div class="email-setup">
                <div class="email-setup-card">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <h2>Set up your email</h2>
                    <p>Configure your Hostpoint email account to start sending and receiving emails.</p>
                    <SyvoraButton variant="primary" @click="activeTab = 'settings'">
                        Configure Email
                    </SyvoraButton>
                </div>
            </div>
        </template>

        <template v-else>
            <SyvoraEmailLayout>
                <template #sidebar>
                    <div class="sidebar-header">
                        <SyvoraButton variant="primary" size="sm" class="compose-btn" @click="handleCompose">
                            Compose
                        </SyvoraButton>
                    </div>
                    <SyvoraFolderList
                        :folders="folders"
                        :current-folder="currentFolder"
                        @select="handleFolderSelect"
                    />
                </template>

                <template #list>
                    <div class="list-header">
                        <h3 class="list-title">{{ currentFolder }}</h3>
                    </div>
                    <SyvoraMessageList
                        :messages="messages"
                        :selected-uid="selectedMessage?.uid ?? null"
                        :loading="loading"
                        @select="handleMessageSelect"
                        @toggle-flag="handleToggleFlag"
                    />
                </template>

                <template #detail>
                    <SyvoraComposeEmail
                        v-if="composeMode"
                        :mode="composeMode"
                        :reply-to="replyToMessage"
                        @sent="handleSent"
                        @cancel="handleCancelCompose"
                    />
                    <SyvoraMessageDetail
                        v-else
                        :message="selectedMessage"
                        :loading="loadingMessage"
                        @reply="handleReply"
                        @reply-all="handleReplyAll"
                        @forward="handleForward"
                        @delete="handleDelete"
                        @download-attachment="handleDownloadAttachment"
                    />
                </template>
            </SyvoraEmailLayout>
        </template>
    </div>
</template>

<style scoped>
.email-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0;
    height: 100%;
}

.email-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.25rem;
}

.sidebar-header {
    padding: 0.75rem 0.75rem 0.25rem;
}

.compose-btn {
    width: 100%;
}

.list-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.list-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
}

.email-setup {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem;
}

.email-setup-card {
    background: var(--color-surface, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card, 1.5rem);
    padding: 3rem 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 24rem;
    box-shadow: var(--shadow-card);
}

.email-setup-card h2 {
    font-size: 1.125rem;
    font-weight: 600;
}

.email-setup-card p {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.5;
}
</style>
