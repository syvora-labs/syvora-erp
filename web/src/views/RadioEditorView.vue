<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRadios } from '../composables/useRadios'
import { useArtists } from '../composables/useArtists'
import { useDirtyGuard } from '../composables/useDirtyGuard'
import {
    SyvoraEditorPage, SyvoraFormField, SyvoraInput, SyvoraTextarea,
    type EditorSection,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const { fetchRadioById, createRadio, updateRadio } = useRadios()
const { artists, fetchArtists } = useArtists()

const radioId = computed(() => (route.params.id as string | undefined) ?? null)
const isNew = computed(() => !radioId.value)

interface RadioForm {
    title: string
    description: string
    artists: string[]
    release_date: string
    soundcloud_link: string
}

function emptyForm(): RadioForm {
    return { title: '', description: '', artists: [], release_date: '', soundcloud_link: '' }
}

const form = ref<RadioForm>(emptyForm())
const lastSaved = ref<RadioForm>(emptyForm())
const saving = ref(false)
const error = ref('')

const sections: EditorSection[] = [
    { id: 'basics', label: 'Basics' },
    { id: 'links', label: 'Links' },
    { id: 'description', label: 'Description' },
]

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(lastSaved.value))
const canSave = computed(() => form.value.title.trim().length > 0 && dirty.value && !saving.value)

const { confirmDiscard } = useDirtyGuard(dirty)

onMounted(async () => {
    fetchArtists()
    if (radioId.value) {
        const r = await fetchRadioById(radioId.value)
        if (r) {
            form.value = {
                title: r.title,
                description: r.description ?? '',
                artists: [...r.artists],
                release_date: r.release_date ?? '',
                soundcloud_link: r.soundcloud_link ?? '',
            }
            lastSaved.value = JSON.parse(JSON.stringify(form.value))
        } else {
            error.value = 'Radio not found.'
        }
    }
})

function addArtist(name: string) {
    if (name && !form.value.artists.includes(name)) form.value.artists.push(name)
}

function removeArtist(idx: number) {
    form.value.artists.splice(idx, 1)
}

async function handleSave() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    const payload = {
        title: form.value.title.trim(),
        description: form.value.description.trim() || null,
        artists: form.value.artists,
        release_date: form.value.release_date || null,
        soundcloud_link: form.value.soundcloud_link.trim() || null,
    }
    try {
        if (radioId.value) {
            await updateRadio(radioId.value, payload)
            lastSaved.value = JSON.parse(JSON.stringify(form.value))
        } else {
            const created = await createRadio(payload)
            // Snapshot before navigating so the route guard sees clean state
            lastSaved.value = JSON.parse(JSON.stringify(form.value))
            await router.push(`/radios/${created.id}`)
            return
        }
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save radio.'
    } finally {
        saving.value = false
    }
}

function handleCancel() {
    if (!confirmDiscard()) return
    router.back()
}

// Watch select element for adding artists (cannot use v-model on a select that resets)
const artistPicker = ref('')
watch(artistPicker, (val) => {
    if (val) {
        addArtist(val)
        artistPicker.value = ''
    }
})
</script>

<template>
    <SyvoraEditorPage
        :title="isNew ? 'New Radio' : 'Edit Radio'"
        :subtitle="form.title || undefined"
        :sections="sections"
        :saving="saving"
        :can-save="canSave"
        @save="handleSave"
        @cancel="handleCancel"
    >
        <template #basics>
            <SyvoraFormField label="Radio Title" for="rd-title">
                <SyvoraInput id="rd-title" v-model="form.title" placeholder="Radio episode name" />
            </SyvoraFormField>

            <SyvoraFormField label="Artists" for="rd-artists">
                <div class="multi-select-wrap">
                    <div v-if="form.artists.length" class="selected-artists">
                        <span v-for="(name, i) in form.artists" :key="i" class="selected-artist-chip">
                            {{ name }}
                            <button type="button" class="chip-remove" @click="removeArtist(i)">&times;</button>
                        </span>
                    </div>
                    <select id="rd-artists" v-model="artistPicker" class="syvora-select">
                        <option value="">Add artist...</option>
                        <option
                            v-for="a in artists"
                            :key="a.id"
                            :value="a.name"
                            :disabled="form.artists.includes(a.name)"
                        >{{ a.name }}</option>
                    </select>
                </div>
            </SyvoraFormField>

            <SyvoraFormField label="Release Date" for="rd-date">
                <SyvoraInput id="rd-date" v-model="form.release_date" type="date" />
            </SyvoraFormField>
        </template>

        <template #links>
            <SyvoraFormField label="SoundCloud Link" for="rd-soundcloud">
                <SyvoraInput
                    id="rd-soundcloud"
                    v-model="form.soundcloud_link"
                    placeholder="https://soundcloud.com/..."
                />
            </SyvoraFormField>
        </template>

        <template #description>
            <SyvoraFormField label="Description" for="rd-desc">
                <SyvoraTextarea
                    id="rd-desc"
                    v-model="form.description"
                    placeholder="Radio description..."
                    :rows="6"
                />
            </SyvoraFormField>
        </template>
    </SyvoraEditorPage>

    <p v-if="error" class="error-msg">{{ error }}</p>
</template>

<style scoped>
.multi-select-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.selected-artists {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
}

.selected-artist-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem 0.25rem 0.625rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 9999px;
    font-size: 0.8125rem;
    color: var(--color-text);
}

.chip-remove {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
}

.chip-remove:hover {
    color: var(--color-text);
}

.syvora-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0.5rem;
    background: #fff;
    font-size: 0.875rem;
    color: var(--color-text);
}

.error-msg {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.625rem 1rem;
    background: rgba(220, 38, 38, 0.95);
    color: #fff;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    z-index: 600;
}
</style>
