<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvents } from '../composables/useEvents'
import { useDirtyGuard } from '../composables/useDirtyGuard'
import {
    SyvoraEditorPage, SyvoraFormField, SyvoraInput, SyvoraTextarea,
    type EditorSection,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const {
    fetchEventById, createEvent, updateEvent, uploadEventArtwork,
} = useEvents()

const eventId = computed(() => (route.params.id as string | undefined) ?? null)
const isNew = computed(() => !eventId.value)

interface EventForm {
    title: string
    description: string
    lineupRaw: string
    location: string
    event_date: string
    event_time: string
    artwork_url: string | null
    ticket_link: string
    ticket_management: 'internal' | 'external'
}

function emptyForm(): EventForm {
    return {
        title: '', description: '', lineupRaw: '', location: '',
        event_date: '', event_time: '', artwork_url: null,
        ticket_link: '', ticket_management: 'internal',
    }
}

const form = ref<EventForm>(emptyForm())
const lastSaved = ref<EventForm>(emptyForm())
const pendingArtwork = ref<File | null>(null)
const artworkPreview = ref<string | null>(null)
const artworkInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const error = ref('')

const sections: EditorSection[] = [
    { id: 'basics', label: 'Basics' },
    { id: 'artwork', label: 'Artwork' },
    { id: 'lineup', label: 'Lineup' },
    { id: 'description', label: 'Description' },
    { id: 'tickets', label: 'Tickets' },
]

const dirty = computed(
    () => JSON.stringify(form.value) !== JSON.stringify(lastSaved.value) || pendingArtwork.value !== null
)
const canSave = computed(() => form.value.title.trim().length > 0 && dirty.value && !saving.value)

const { confirmDiscard } = useDirtyGuard(dirty)

onMounted(async () => {
    if (eventId.value) {
        const e = await fetchEventById(eventId.value)
        if (e) {
            form.value = {
                title: e.title,
                description: e.description ?? '',
                lineupRaw: (e.lineup ?? []).join(', '),
                location: e.location ?? '',
                event_date: e.event_date ? (new Date(e.event_date).toISOString().split('T')[0] ?? '') : '',
                event_time: e.event_date ? new Date(e.event_date).toTimeString().slice(0, 5) : '',
                artwork_url: e.artwork_url,
                ticket_link: e.ticket_link ?? '',
                ticket_management: e.ticket_management,
            }
            artworkPreview.value = e.artwork_url
            lastSaved.value = JSON.parse(JSON.stringify(form.value))
        } else {
            error.value = 'Event not found.'
        }
    }
})

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    pendingArtwork.value = file
    const reader = new FileReader()
    reader.onload = () => { artworkPreview.value = reader.result as string }
    reader.readAsDataURL(file)
}

function buildPayload() {
    const lineup = form.value.lineupRaw
        .split(',').map(s => s.trim()).filter(Boolean)
    const event_date = form.value.event_date
        ? new Date(`${form.value.event_date}T${form.value.event_time || '00:00'}`).toISOString()
        : null
    return {
        title: form.value.title.trim(),
        description: form.value.description.trim() || null,
        lineup,
        location: form.value.location.trim() || null,
        event_date,
        artwork_url: form.value.artwork_url,
        ticket_link: form.value.ticket_link.trim() || null,
        ticket_management: form.value.ticket_management,
    }
}

async function handleSave() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        let workingId = eventId.value
        if (workingId) {
            await updateEvent(workingId, buildPayload())
        } else {
            const created = await createEvent(buildPayload())
            workingId = created.id
        }

        if (pendingArtwork.value && workingId) {
            const url = await uploadEventArtwork(pendingArtwork.value, workingId)
            await updateEvent(workingId, { artwork_url: url })
            form.value.artwork_url = url
            artworkPreview.value = url
            pendingArtwork.value = null
        }

        lastSaved.value = JSON.parse(JSON.stringify(form.value))

        if (isNew.value && workingId) {
            await router.push(`/events/${workingId}`)
            return
        }
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save event.'
    } finally {
        saving.value = false
    }
}

function handleCancel() {
    if (!confirmDiscard()) return
    router.back()
}
</script>

<template>
    <SyvoraEditorPage
        :title="isNew ? 'New Event' : 'Edit Event'"
        :subtitle="form.title || undefined"
        :sections="sections"
        :saving="saving"
        :can-save="canSave"
        @save="handleSave"
        @cancel="handleCancel"
    >
        <template #basics>
            <SyvoraFormField label="Event Title" for="ev-title">
                <SyvoraInput id="ev-title" v-model="form.title" placeholder="Event name" />
            </SyvoraFormField>
            <div class="form-row">
                <SyvoraFormField label="Date" for="ev-date" class="flex-1">
                    <SyvoraInput id="ev-date" v-model="form.event_date" type="date" />
                </SyvoraFormField>
                <SyvoraFormField label="Time" for="ev-time" class="flex-1">
                    <SyvoraInput id="ev-time" v-model="form.event_time" type="time" />
                </SyvoraFormField>
            </div>
            <SyvoraFormField label="Location" for="ev-location">
                <SyvoraInput id="ev-location" v-model="form.location" placeholder="Venue name, city" />
            </SyvoraFormField>
        </template>

        <template #artwork>
            <div class="artwork-upload">
                <div class="artwork-preview" @click="artworkInput?.click()">
                    <img v-if="artworkPreview" :src="artworkPreview" alt="Artwork" />
                    <div v-else class="artwork-placeholder">
                        <span>+</span>
                        <small>Event artwork</small>
                    </div>
                    <div class="artwork-overlay">Change artwork</div>
                </div>
                <input ref="artworkInput" type="file" accept="image/*"
                    class="hidden-input" @change="onArtworkPick" />
            </div>
        </template>

        <template #lineup>
            <SyvoraFormField label="Lineup (comma-separated)" for="ev-lineup">
                <SyvoraInput
                    id="ev-lineup"
                    v-model="form.lineupRaw"
                    placeholder="Artist One, Artist Two, DJ Three"
                />
            </SyvoraFormField>
        </template>

        <template #description>
            <SyvoraFormField label="Description" for="ev-desc">
                <SyvoraTextarea id="ev-desc" v-model="form.description"
                    placeholder="Event description..." :rows="6" />
            </SyvoraFormField>
        </template>

        <template #tickets>
            <SyvoraFormField label="Ticket Link" for="ev-tickets">
                <SyvoraInput id="ev-tickets" v-model="form.ticket_link"
                    placeholder="https://tickets.example.com" />
            </SyvoraFormField>
            <SyvoraFormField label="Ticket Management">
                <div class="toggle-row">
                    <label class="toggle-option" :class="{ active: form.ticket_management === 'internal' }">
                        <input type="radio" v-model="form.ticket_management" value="internal" class="hidden-input" />
                        Internal
                    </label>
                    <label class="toggle-option" :class="{ active: form.ticket_management === 'external' }">
                        <input type="radio" v-model="form.ticket_management" value="external" class="hidden-input" />
                        External
                    </label>
                </div>
                <small class="field-hint">
                    {{ form.ticket_management === 'internal'
                        ? 'Tickets are managed in Sales.'
                        : 'Tickets are managed externally. This event won\'t appear in Sales.' }}
                </small>
            </SyvoraFormField>
        </template>
    </SyvoraEditorPage>

    <p v-if="error" class="error-msg">{{ error }}</p>
</template>

<style scoped>
.form-row {
    display: flex;
    gap: 1rem;
}
.flex-1 { flex: 1; }

.artwork-upload {
    display: flex;
    justify-content: center;
}

.artwork-preview {
    position: relative;
    width: 320px;
    height: 320px;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    cursor: pointer;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.artwork-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.artwork-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-muted);
}
.artwork-placeholder span {
    font-size: 2rem;
    line-height: 1;
}
.artwork-placeholder small { font-size: 0.75rem; }

.artwork-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    font-size: 0.875rem;
}

.artwork-preview:hover .artwork-overlay { opacity: 1; }

.hidden-input { display: none; }

.toggle-row {
    display: flex;
    gap: 0.5rem;
}
.toggle-option {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0.5rem;
    text-align: center;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--color-text-muted);
}
.toggle-option.active {
    background: var(--color-text);
    color: #fff;
    border-color: var(--color-text);
}
.field-hint {
    display: block;
    margin-top: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
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
    z-index: 100;
}
</style>
