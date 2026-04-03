<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEmail } from '../../composables/useEmail'

const model = defineModel<string>({ required: true })
defineProps<{ label: string }>()

const { suggestContacts } = useEmail()

const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(model, (val) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    // Get the last email being typed (after the last comma/semicolon)
    const parts = val.split(/[,;]\s*/)
    const query = parts[parts.length - 1].trim()

    if (query.length < 2) {
        suggestions.value = []
        showSuggestions.value = false
        return
    }

    debounceTimer = setTimeout(async () => {
        suggestions.value = await suggestContacts(query)
        showSuggestions.value = suggestions.value.length > 0
    }, 250)
})

function selectSuggestion(suggestion: string) {
    const parts = model.value.split(/[,;]\s*/)
    parts[parts.length - 1] = suggestion
    model.value = parts.join(', ') + ', '
    showSuggestions.value = false
    inputRef.value?.focus()
}

function handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
        showSuggestions.value = false
    }, 200)
}
</script>

<template>
    <div class="autocomplete-wrapper">
        <label class="autocomplete-label">{{ label }}</label>
        <input
            ref="inputRef"
            :value="model"
            @input="model = ($event.target as HTMLInputElement).value"
            @blur="handleBlur"
            @focus="showSuggestions = suggestions.length > 0"
            class="autocomplete-input"
            type="text"
            autocomplete="off"
        />
        <div v-if="showSuggestions" class="autocomplete-dropdown">
            <button
                v-for="s in suggestions"
                :key="s"
                class="autocomplete-item"
                @mousedown.prevent="selectSuggestion(s)"
            >
                {{ s }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.autocomplete-wrapper {
    position: relative;
}

.autocomplete-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: 0.25rem;
}

.autocomplete-input {
    width: 100%;
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

.autocomplete-input:focus {
    border-color: var(--color-accent, #73c3fe);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.15);
}

.autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--color-bg, #f7fbff);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm, 0.625rem);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    margin-top: 0.25rem;
    max-height: 200px;
    overflow-y: auto;
}

.autocomplete-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
    transition: background 0.1s;
}

.autocomplete-item:hover {
    background: rgba(115, 195, 254, 0.1);
}
</style>
