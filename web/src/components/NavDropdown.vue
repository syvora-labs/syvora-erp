<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useIsMobile } from '@syvora/ui'
import { useNavGroups } from '../composables/useNavGroups'
import type { NavGroup } from '../composables/useNavGroups'

const route = useRoute()
const isMobile = useIsMobile()
const { groups } = useNavGroups()

const openGroup = ref<string | null>(null)
let closeTimeout: ReturnType<typeof setTimeout> | null = null

function isGroupActive(group: NavGroup): boolean {
    return group.items.some((item) => route.path.startsWith(item.to))
}

function handleEnter(label: string) {
    if (closeTimeout) {
        clearTimeout(closeTimeout)
        closeTimeout = null
    }
    openGroup.value = label
}

function handleLeave() {
    closeTimeout = setTimeout(() => {
        openGroup.value = null
    }, 150)
}

function closeDropdown() {
    openGroup.value = null
}

// Close dropdown on route change
watch(() => route.path, () => {
    openGroup.value = null
})

function isSingleItem(group: NavGroup): boolean {
    return group.items.length === 1 && group.label === group.items[0]!.label
}

function firstItem(group: NavGroup) {
    return group.items[0]!
}
</script>

<template>
    <!-- Mobile: flat grouped list for the drawer -->
    <template v-if="isMobile">
        <template v-for="group in groups" :key="group.label">
            <div v-if="!isSingleItem(group)" class="mobile-group-label">{{ group.label }}</div>
            <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link"
                active-class="nav-link--active">
                {{ item.label }}
            </RouterLink>
        </template>
    </template>

    <!-- Desktop: dropdown groups -->
    <template v-else>
        <template v-for="group in groups" :key="group.label">
            <!-- Single-item group: render as a direct link -->
            <RouterLink v-if="isSingleItem(group)" :to="firstItem(group).to" class="nav-link"
                active-class="nav-link--active">
                {{ firstItem(group).label }}
            </RouterLink>

            <!-- Multi-item group: dropdown -->
            <div v-else class="nav-dropdown" @mouseenter="handleEnter(group.label)"
                @mouseleave="handleLeave">
                <button class="nav-link nav-dropdown-trigger"
                    :class="{ 'nav-link--active': isGroupActive(group) }"
                    @click="openGroup = openGroup === group.label ? null : group.label">
                    {{ group.label }}
                    <svg class="nav-dropdown-chevron" :class="{ 'nav-dropdown-chevron--open': openGroup === group.label }"
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>

                <Transition name="dropdown">
                    <div v-if="openGroup === group.label" class="nav-dropdown-panel">
                        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to"
                            class="nav-dropdown-item"
                            :class="{ 'nav-dropdown-item--active': route.path.startsWith(item.to) }"
                            @click="closeDropdown">
                            {{ item.label }}
                        </RouterLink>
                    </div>
                </Transition>
            </div>
        </template>
    </template>
</template>

<style scoped>
/* ── Dropdown container ── */
.nav-dropdown {
    position: relative;
}

.nav-dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    /* nav-link styles are inherited from AppShell :slotted(.nav-link) */
}

.nav-dropdown-chevron {
    transition: transform 0.2s ease;
    opacity: 0.5;
}

.nav-dropdown-chevron--open {
    transform: rotate(180deg);
}

/* ── Dropdown panel ── */
.nav-dropdown-panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    min-width: 160px;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(48px) saturate(200%);
    -webkit-backdrop-filter: blur(48px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.65);
    border-radius: 0.875rem;
    padding: 0.375rem;
    box-shadow:
        0 0 0 0.5px rgba(255, 255, 255, 0.8) inset,
        0 2px 0 rgba(255, 255, 255, 0.95) inset,
        0 4px 16px rgba(0, 0, 0, 0.08),
        0 16px 32px rgba(0, 0, 0, 0.06);
    z-index: 200;
}

.nav-dropdown-item {
    display: block;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text, #0c1a27);
    text-decoration: none;
    border-radius: 0.5rem;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
}

.nav-dropdown-item:hover {
    background: rgba(0, 0, 0, 0.04);
}

.nav-dropdown-item--active {
    color: var(--color-accent, #73c3fe);
    background: rgba(115, 195, 254, 0.12);
    font-weight: 600;
}

/* ── Mobile group labels ── */
.mobile-group-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted, rgba(12, 26, 39, 0.48));
    padding: 0.75rem 0.75rem 0.25rem;
}

/* ── Dropdown transitions ── */
.dropdown-enter-active,
.dropdown-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px);
}

.dropdown-enter-to,
.dropdown-leave-from {
    transform: translateX(-50%) translateY(0);
}
</style>
