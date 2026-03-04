<script setup lang="ts">
export interface TabItem {
    key: string
    label: string
    count?: number
}

const props = defineProps<{
    modelValue: string
    tabs: TabItem[]
}>()

const emit = defineEmits<{
    'update:modelValue': [key: string]
}>()
</script>

<template>
    <div class="syvora-tabs">
        <button
            v-for="tab in props.tabs"
            :key="tab.key"
            class="syvora-tab"
            :class="{ 'syvora-tab--active': props.modelValue === tab.key }"
            @click="emit('update:modelValue', tab.key)"
        >
            {{ tab.label }}
            <span v-if="tab.count !== undefined" class="syvora-tab-count">{{ tab.count }}</span>
        </button>
    </div>
</template>

<style scoped>
.syvora-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.07));
    margin-bottom: 1.5rem;
}

.syvora-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    font-family: inherit;
}

.syvora-tab:hover {
    color: var(--color-text);
}

.syvora-tab--active {
    color: var(--color-text);
    border-bottom-color: var(--color-accent);
}

.syvora-tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
}
</style>
