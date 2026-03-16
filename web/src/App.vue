<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useMandator } from './composables/useMandator'
import { useNotifications } from './composables/useNotifications'
import { AppShell, SyvoraButton, SyvoraAvatar } from '@syvora/ui'

const { currentProfile, isAuthenticated, isAdmin, signOut } = useAuth()
const { releasesEnabled, eventsEnabled, radiosEnabled, artistsEnabled, financialsEnabled, associationsEnabled, meetingsEnabled } = useMandator()
const { notifications, unreadCount, markAsRead, markAllAsRead, startPolling, stopPolling } = useNotifications()

const showInbox = ref(false)
const inboxBtnRef = ref<HTMLElement | null>(null)
const inboxBtnMobileRef = ref<HTMLElement | null>(null)
const inboxPosition = ref<Record<string, string>>({})

function toggleInbox(_event: Event, mobile: boolean) {
    showInbox.value = !showInbox.value
    if (showInbox.value) {
        nextTick(() => {
            const el = mobile ? inboxBtnMobileRef.value : inboxBtnRef.value
            if (!el) return
            const rect = el.getBoundingClientRect()
            inboxPosition.value = {
                position: 'fixed',
                top: `${rect.bottom + 8}px`,
                right: `${window.innerWidth - rect.right}px`,
            }
        })
    }
}

watch(isAuthenticated, (val) => {
    if (val) startPolling()
    else stopPolling()
}, { immediate: true })

function handleNotificationClick(n: typeof notifications.value[0]) {
    markAsRead(n.id)
    showInbox.value = false
    if (n.link) router.push(n.link)
}

function formatTimeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
}
const router = useRouter()

async function handleSignOut() {
    await signOut()
    router.push('/login')
}
</script>

<template>
    <AppShell>
        <template #logo>
            <span class="logo-mark">◆</span>
            <span class="logo-text">SYVORA</span>
        </template>

        <template v-if="isAuthenticated" #nav>
            <RouterLink v-if="releasesEnabled" to="/releases" class="nav-link" active-class="nav-link--active">Releases
            </RouterLink>
            <RouterLink v-if="eventsEnabled" to="/events" class="nav-link" active-class="nav-link--active">Events
            </RouterLink>
            <RouterLink v-if="radiosEnabled" to="/radios" class="nav-link" active-class="nav-link--active">Radios
            </RouterLink>
            <RouterLink v-if="artistsEnabled" to="/artists" class="nav-link" active-class="nav-link--active">Artists
            </RouterLink>
            <RouterLink v-if="financialsEnabled" to="/financials" class="nav-link" active-class="nav-link--active">
                Financials</RouterLink>
            <RouterLink v-if="associationsEnabled" to="/associations" class="nav-link" active-class="nav-link--active">
                Associations</RouterLink>
            <RouterLink v-if="meetingsEnabled" to="/meetings" class="nav-link" active-class="nav-link--active">
                Meetings</RouterLink>
            <RouterLink v-if="isAdmin" to="/admin" class="nav-link" active-class="nav-link--active">Administration</RouterLink>
        </template>

        <template v-if="isAuthenticated" #actions-mobile>
            <div class="inbox-wrapper" ref="inboxBtnMobileRef">
                <button class="inbox-btn" @click="toggleInbox($event, true)" title="Notifications">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <span v-if="unreadCount > 0" class="inbox-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
                </button>
            </div>
        </template>

        <template v-if="isAuthenticated" #actions>
            <div class="actions-row">
                <div class="inbox-wrapper" ref="inboxBtnRef">
                    <button class="inbox-btn" @click="toggleInbox($event, false)" title="Notifications">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <span v-if="unreadCount > 0" class="inbox-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
                    </button>
                </div>
                <SyvoraButton variant="ghost" size="sm" @click="handleSignOut">Sign out</SyvoraButton>
                <RouterLink to="/profile" class="profile-btn">
                    <SyvoraAvatar :src="currentProfile?.avatar_url ?? undefined"
                        :name="currentProfile?.display_name ?? currentProfile?.username ?? 'U'" size="sm" />
                </RouterLink>
            </div>
        </template>

        <RouterView />

        <template #footer>
            <p>Syvora Record Label Management</p>
        </template>
    </AppShell>

    <Teleport to="body">
        <div v-if="showInbox" class="inbox-backdrop" @click="showInbox = false"></div>
        <div v-if="showInbox" class="inbox-dropdown" :style="inboxPosition">
            <div class="inbox-header">
                <span class="inbox-title">Notifications</span>
                <button v-if="unreadCount > 0" class="inbox-mark-all" @click="markAllAsRead">Mark all read</button>
            </div>
            <div v-if="notifications.length === 0" class="inbox-empty">No notifications</div>
            <div v-else class="inbox-list">
                <button
                    v-for="n in notifications"
                    :key="n.id"
                    class="inbox-item"
                    :class="{ 'inbox-item--unread': !n.read }"
                    @click="handleNotificationClick(n)"
                >
                    <div class="inbox-item-dot" v-if="!n.read"></div>
                    <div class="inbox-item-content">
                        <span class="inbox-item-title">{{ n.title }}</span>
                        <span v-if="n.message" class="inbox-item-message">{{ n.message }}</span>
                        <span class="inbox-item-time">{{ formatTimeAgo(n.created_at) }}</span>
                    </div>
                </button>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.logo-mark {
    color: var(--color-accent);
    font-size: 1.1rem;
}

.logo-text {
    font-weight: 700;
    font-size: 1.0625rem;
    color: var(--color-text);
    letter-spacing: -0.01em;
}

.profile-btn {
    display: flex;
    align-items: center;
    border-radius: 50%;
    text-decoration: none;
    transition: opacity 0.15s;
}

.profile-btn:hover {
    opacity: 0.8;
}

.actions-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
}

.inbox-wrapper {
    position: relative;
}

.inbox-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0.375rem;
    border-radius: var(--radius-sm, 6px);
    transition: color 0.15s, background 0.15s;
}

.inbox-btn:hover {
    color: var(--color-text);
    background: rgba(0, 0, 0, 0.04);
}

.inbox-badge {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;
    background: var(--color-error, #f87171);
    color: #fff;
    font-size: 0.625rem;
    font-weight: 700;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transform: translate(25%, -25%);
}

</style>

<style>
.inbox-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
}

.inbox-dropdown {
    width: 340px;
    max-height: 420px;
    background: var(--color-bg, #f7fbff);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card, 1.5rem);
    box-shadow: var(--shadow-card);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.inbox-title {
    font-size: 0.875rem;
    font-weight: 600;
}

.inbox-mark-all {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;
}

.inbox-mark-all:hover {
    text-decoration: underline;
}

.inbox-empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
}

.inbox-list {
    overflow-y: auto;
    flex: 1;
}

.inbox-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
}

.inbox-item:last-child {
    border-bottom: none;
}

.inbox-item:hover {
    background: rgba(0, 0, 0, 0.03);
}

.inbox-item--unread {
    background: rgba(115, 195, 254, 0.08);
}

.inbox-item-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-accent);
    flex-shrink: 0;
    margin-top: 0.375rem;
}

.inbox-item-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.inbox-item-title {
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.inbox-item-message {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.inbox-item-time {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    opacity: 0.7;
}

@media (max-width: 600px) {
    .inbox-dropdown {
        width: auto;
        max-height: 60vh;
        right: 0.75rem !important;
        left: 0.75rem !important;
    }
}
</style>
