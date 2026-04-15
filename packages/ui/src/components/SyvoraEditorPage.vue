<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useIsMobile } from '../composables/useIsMobile'
import SyvoraButton from './SyvoraButton.vue'

export interface EditorSection {
    id: string
    label: string
}

const props = defineProps<{
    title: string
    subtitle?: string
    sections: EditorSection[]
    saving?: boolean
    canSave: boolean
    saveLabel?: string
}>()

const emit = defineEmits<{
    save: []
    cancel: []
}>()

const isMobile = useIsMobile()

const activeSection = ref<string>(props.sections[0]?.id ?? '')

// If the active section disappears from the list (shouldn't happen in current
// usage, but cheap to guard), fall back to the first available section.
watch(() => props.sections.map(s => s.id).join(','), () => {
    if (!props.sections.find(s => s.id === activeSection.value)) {
        activeSection.value = props.sections[0]?.id ?? ''
    }
})

const activeSectionLabel = computed(
    () => props.sections.find(s => s.id === activeSection.value)?.label ?? ''
)

const headerLabel = computed(() => {
    if (props.subtitle) return `${props.title}: ${props.subtitle}`
    return props.title
})
</script>

<template>
    <div class="editor-page">
        <header class="editor-header">
            <button class="editor-back" @click="emit('cancel')" aria-label="Back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                </svg>
            </button>
            <h1 class="editor-title">{{ headerLabel }}</h1>
            <div class="editor-actions">
                <SyvoraButton variant="ghost" @click="emit('cancel')">Cancel</SyvoraButton>
                <SyvoraButton :loading="saving" :disabled="!canSave || saving" @click="emit('save')">
                    {{ saveLabel ?? 'Save' }}
                </SyvoraButton>
            </div>
        </header>

        <div class="editor-shell">
            <nav v-if="!isMobile" class="editor-nav" aria-label="Sections">
                <button
                    v-for="section in sections"
                    :key="section.id"
                    class="editor-nav-item"
                    :class="{ 'editor-nav-item--active': activeSection === section.id }"
                    @click="activeSection = section.id"
                >
                    {{ section.label }}
                </button>
            </nav>

            <div v-else class="editor-nav-mobile">
                <select v-model="activeSection" class="editor-nav-mobile-select">
                    <option v-for="section in sections" :key="section.id" :value="section.id">
                        {{ section.label }}
                    </option>
                </select>
            </div>

            <div class="editor-body">
                <section class="editor-section">
                    <h2 class="editor-section-title">{{ activeSectionLabel }}</h2>
                    <div class="editor-section-body">
                        <slot :name="activeSection" />
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<style scoped>
.editor-page {
    position: fixed;
    top: 4rem;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 500;
    display: flex;
    flex-direction: column;
    background: var(--color-bg, #f7f7f7);
}

.editor-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
    background: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
}

.editor-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: rgba(0, 0, 0, 0.04);
    border: none;
    border-radius: 50%;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.editor-back:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--color-text);
}

.editor-title {
    flex: 1;
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.editor-actions {
    display: flex;
    gap: 0.5rem;
}

.editor-shell {
    display: flex;
    flex: 1;
    min-height: 0;
}

.editor-nav {
    flex: 0 0 200px;
    padding: 1.5rem 0.75rem;
    border-right: 1px solid rgba(0, 0, 0, 0.06);
    background: #fff;
    overflow-y: auto;
}

.editor-nav-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.125rem;
    background: none;
    border: none;
    border-radius: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.editor-nav-item:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--color-text);
}

.editor-nav-item--active {
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-text);
    font-weight: 600;
}

.editor-nav-mobile {
    padding: 0.75rem 1rem;
    background: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
}

.editor-nav-mobile-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0.5rem;
    background: #fff;
    font-size: 0.875rem;
    color: var(--color-text);
}

.editor-body {
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem 2rem;
}

.editor-section-title {
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    margin: 0 0 1rem;
}

.editor-section-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 720px;
}

@media (max-width: 600px) {
    .editor-shell {
        flex-direction: column;
    }

    .editor-body {
        padding: 1rem 1rem 2rem;
    }
}
</style>
