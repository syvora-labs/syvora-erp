<script setup lang="ts">
defineProps<{
    modelValue: boolean
    title?: string
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
}>()

function close() {
    emit('update:modelValue', false)
}
</script>

<template>
    <Teleport to="body">
        <Transition name="drawer">
            <div v-if="modelValue" class="drawer-backdrop" @click.self="close">
                <div class="drawer-panel">
                    <div v-if="title" class="drawer-header">
                        <span class="drawer-title">{{ title }}</span>
                        <button class="drawer-close" @click="close">&times;</button>
                    </div>
                    <div class="drawer-body">
                        <slot />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
}

.drawer-panel {
    width: 100%;
    max-width: 500px;
    max-height: 70vh;
    background: var(--color-surface, #fff);
    border-radius: 1rem 1rem 0 0;
    overflow-y: auto;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.07));
    position: sticky;
    top: 0;
    background: var(--color-surface, #fff);
}

.drawer-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
}

.drawer-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0 0.25rem;
}

.drawer-body {
    padding: 0.5rem 0;
}

/* Transitions */
.drawer-enter-active,
.drawer-leave-active {
    transition: opacity 0.2s ease;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
    transition: transform 0.2s ease;
}

.drawer-enter-from,
.drawer-leave-to {
    opacity: 0;
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
    transform: translateY(100%);
}
</style>
