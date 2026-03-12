<script setup lang="ts">
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useMandator } from './composables/useMandator'
import { AppShell, SyvoraButton, SyvoraAvatar } from '@syvora/ui'

const { currentProfile, isAuthenticated, isAdmin, signOut } = useAuth()
const { releasesEnabled, eventsEnabled, radiosEnabled, artistsEnabled, financialsEnabled } = useMandator()
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
            <RouterLink v-if="isAdmin" to="/admin" class="nav-link" active-class="nav-link--active">Administration</RouterLink>
        </template>

        <template v-if="isAuthenticated" #actions>
            <div class="actions-row">
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
</style>
