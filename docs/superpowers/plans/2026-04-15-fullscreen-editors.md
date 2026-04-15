# Fullscreen Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped modal editors for radios, releases, and events with full-page sectioned editors at dedicated routes, plus a new `ReleaseDetailView` to mirror the existing radio/event detail-view pattern.

**Architecture:** A shared `SyvoraEditorPage` shell component (sticky header + side nav + sectioned body) hosts three thin per-entity editor views (`RadioEditorView`, `ReleaseEditorView`, `EventEditorView`). Each editor uses a `useDirtyGuard` composable to prevent unsaved-change loss. Existing modals are removed from list views and detail views; CRUD composables (`useRadios`, `useReleases`, `useEvents`) are unchanged.

**Tech Stack:** Vue 3 SFCs with `<script setup lang="ts">`, vue-router 4, `@syvora/ui` design system, Supabase via existing composables. No tests in this project — verification uses `yarn workspace web build` (type-check + production build) and explicit manual smoke tests.

**Reference spec:** `docs/superpowers/specs/2026-04-15-fullscreen-editors-design.md`

**Verification command for every code-change task:**
```bash
yarn workspace web build
```
Expected: completes with no TypeScript errors, no Vue compile errors.

---

## Task 1: Add `useDirtyGuard` composable

**Files:**
- Create: `web/src/composables/useDirtyGuard.ts`

- [ ] **Step 1: Create the composable**

Create file `web/src/composables/useDirtyGuard.ts`:

```ts
import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/**
 * Guards navigation away from the current route while `dirty` is true.
 * Uses native `confirm()` for in-app navigation and `beforeunload` for
 * tab close / hard reload.
 *
 * Returns a `confirmDiscard()` helper for explicit Cancel buttons that
 * need to perform their own navigation only after user confirmation.
 */
export function useDirtyGuard(dirty: Ref<boolean>) {
    onBeforeRouteLeave(() => {
        if (!dirty.value) return true
        return window.confirm('You have unsaved changes. Leave?')
    })

    function onBeforeUnload(e: BeforeUnloadEvent) {
        if (!dirty.value) return
        e.preventDefault()
        e.returnValue = ''
    }

    onMounted(() => {
        window.addEventListener('beforeunload', onBeforeUnload)
    })

    onBeforeUnmount(() => {
        window.removeEventListener('beforeunload', onBeforeUnload)
    })

    function confirmDiscard(): boolean {
        if (!dirty.value) return true
        return window.confirm('You have unsaved changes. Discard?')
    }

    return { confirmDiscard }
}
```

- [ ] **Step 2: Build to verify types**

Run: `yarn workspace web build`
Expected: PASS. (The composable is unused, but it must type-check standalone.)

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useDirtyGuard.ts
git commit -m "feat(web): add useDirtyGuard composable for unsaved-change protection"
```

---

## Task 2: Add `SyvoraEditorPage` shell component

**Files:**
- Create: `packages/ui/src/components/SyvoraEditorPage.vue`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the component**

Create file `packages/ui/src/components/SyvoraEditorPage.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
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
const slots = useSlots()

const activeSection = ref<string>(props.sections[0]?.id ?? '')
const bodyRef = ref<HTMLElement | null>(null)
const sectionRefs = ref<Record<string, HTMLElement | null>>({})

function setSectionRef(id: string, el: Element | null) {
    sectionRefs.value[id] = el as HTMLElement | null
}

function scrollToSection(id: string) {
    const el = sectionRefs.value[id]
    if (!el || !bodyRef.value) return
    const top = el.offsetTop - 16
    bodyRef.value.scrollTo({ top, behavior: 'smooth' })
}

let observer: IntersectionObserver | null = null

function createObserver() {
    if (!bodyRef.value) return
    observer?.disconnect()
    observer = new IntersectionObserver(
        (entries) => {
            // Pick the section whose top is closest to the top of the viewport
            const visible = entries
                .filter(e => e.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
            if (visible[0]?.target instanceof HTMLElement) {
                const id = visible[0].target.dataset.sectionId
                if (id) activeSection.value = id
            }
        },
        {
            root: bodyRef.value,
            rootMargin: '0px 0px -60% 0px',
            threshold: 0,
        }
    )
    for (const id of Object.keys(sectionRefs.value)) {
        const el = sectionRefs.value[id]
        if (el) observer.observe(el)
    }
}

onMounted(() => {
    createObserver()
})

onBeforeUnmount(() => {
    observer?.disconnect()
})

watch(() => props.sections.map(s => s.id).join(','), () => {
    // Re-observe when sections change (e.g., Tracks appearing after first save)
    createObserver()
})

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
                    @click="scrollToSection(section.id)"
                >
                    {{ section.label }}
                </button>
            </nav>

            <div ref="bodyRef" class="editor-body">
                <section
                    v-for="section in sections"
                    :key="section.id"
                    :ref="(el) => setSectionRef(section.id, el as Element | null)"
                    :data-section-id="section.id"
                    class="editor-section"
                >
                    <h2 class="editor-section-title">{{ section.label }}</h2>
                    <div class="editor-section-body">
                        <slot :name="section.id" />
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<style scoped>
.editor-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 100vh;
    background: var(--color-bg, #f7f7f7);
}

.editor-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
    background: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
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
    position: sticky;
    top: 65px;
    align-self: flex-start;
    height: calc(100vh - 65px);
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

.editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem 6rem;
    max-width: 800px;
    width: 100%;
}

.editor-section {
    margin-bottom: 2.5rem;
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
}

@media (max-width: 600px) {
    .editor-body {
        padding: 1rem 1rem 6rem;
    }
}
</style>
```

- [ ] **Step 2: Export from `@syvora/ui`**

Edit `packages/ui/src/index.ts` — add this line near the other component exports (after the `SyvoraDrawer` export on line 16):

```ts
export { default as SyvoraEditorPage } from './components/SyvoraEditorPage.vue'
export type { EditorSection } from './components/SyvoraEditorPage.vue'
```

- [ ] **Step 3: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/SyvoraEditorPage.vue packages/ui/src/index.ts
git commit -m "feat(ui): add SyvoraEditorPage shell component"
```

---

## Task 3: Create `RadioEditorView`

**Files:**
- Create: `web/src/views/RadioEditorView.vue`

This is a brand-new view that handles both `/radios/new` and `/radios/:id/edit`. It does NOT include file management — files stay in `RadioDetailView`'s Files tab per the spec.

- [ ] **Step 1: Create the editor view**

Create file `web/src/views/RadioEditorView.vue`:

```vue
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
const loading = ref(false)
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
        loading.value = true
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
        loading.value = false
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
    z-index: 100;
}
</style>
```

- [ ] **Step 2: Build to verify**

Run: `yarn workspace web build`
Expected: PASS. (View is not yet wired to a route, so it builds as dead code.)

- [ ] **Step 3: Commit**

```bash
git add web/src/views/RadioEditorView.vue
git commit -m "feat(web): add RadioEditorView fullscreen editor"
```

---

## Task 4: Wire radio routes and remove radio modals

**Files:**
- Modify: `web/src/router/index.ts`
- Modify: `web/src/views/RadiosView.vue`
- Modify: `web/src/views/RadioDetailView.vue`

- [ ] **Step 1: Register routes**

Edit `web/src/router/index.ts`:

Add this import near the existing view imports (next to the `RadioDetailView` import on line 15):
```ts
import RadioEditorView from "../views/RadioEditorView.vue";
```

In the `routes` array, add these two routes immediately after the existing `/radios/:id` route (line 38):
```ts
{ path: "/radios/new", component: RadioEditorView, meta: { requiresAuth: true, module: "radios" } },
{ path: "/radios/:id/edit", component: RadioEditorView, meta: { requiresAuth: true, module: "radios" } },
```

**Important:** Place `/radios/new` BEFORE `/radios/:id` is fine because the existing route uses `:id` as a wildcard, but `/radios/new` is a literal path. vue-router prefers literal matches over param matches when both could match, so order does not actually matter — but place them adjacent for readability.

- [ ] **Step 2: Cut over `RadiosView` — wire navigation, remove modal**

Open `web/src/views/RadiosView.vue`. Apply these changes:

**(a) Update the script imports (line 6-9)** — remove `SyvoraModal` and `SyvoraTextarea` from the `@syvora/ui` import (kept ones: `SyvoraButton`, `SyvoraFormField`, `SyvoraInput`, `SyvoraEmptyState`, `SyvoraTabs`):

Replace:
```ts
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, SyvoraTabs
} from '@syvora/ui'
```
With:
```ts
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs
} from '@syvora/ui'
```
(`SyvoraFormField` and `SyvoraInput` were only used in the modal — drop them too.)

**(b) Remove modal state and handlers** — delete these blocks:
- Lines 28-46 (state: `showModal`, `editingRadio`, `saving`, `error`, `form`, `PendingFile` interface, `pendingFiles`, `newFileLabel`)
- Lines 53-93 (handlers: `openCreate`, `openEdit`, `closeModal`, `onFilePick`, `removePendingFile`)
- Lines 95-129 (`saveRadio`)
- Lines 162-174 (`handleDeleteFile`, `downloadFile`)

Also remove the unused `RadioFile` type from the import on line 4:
```ts
import { useRadios, type Radio } from '../composables/useRadios'
```
And remove `uploadRadioFile, deleteRadioFile` from the `useRadios()` destructure on lines 17-22 (keep only what's still used). After cleanup the destructure should be:
```ts
const {
    activeRadios, archivedRadios, loading,
    fetchRadios, deleteRadio,
    publishRadio, unpublishRadio, archiveRadio, unarchiveRadio,
} = useRadios()
```
Also remove `createRadio, updateRadio` (now only used in editor).

**(c) Replace button handlers** — In the template:

Replace `@click="openCreate"` (line 202 area) with:
```html
@click="router.push('/radios/new')"
```

Replace `@click="openEdit(radio)"` (line 260 area) with:
```html
@click="router.push(`/radios/${radio.id}/edit`)"
```

**(d) Remove the entire `<SyvoraModal>` block** — lines 316-412 (the whole modal element from `<SyvoraModal v-if="showModal"` through `</SyvoraModal>`).

**(e) Remove modal-only CSS** — in the `<style scoped>` block, delete any rules that only apply to elements inside the removed modal. Search for and remove rule blocks for: `.modal-form`, `.published-notice`, `.badge-published`, `.multi-select-wrap`, `.selected-artists`, `.selected-artist-chip`, `.chip-remove`, `.syvora-select` (if local), `.form-section`, `.form-section-label`, `.existing-files`, `.file-row`, `.file-row-label`, `.file-row-size`, `.file-row-btn`, `.file-row-delete`, `.file-add-row`, `.file-pick-btn`, `.hidden-input`, `.pending-files`, `.error-msg`. **Keep** any styles still referenced by remaining template (radio cards, list, badges, actions).

If unsure whether a class is still used, search the remaining template: if no element uses it, remove the rule.

- [ ] **Step 3: Cut over `RadioDetailView` — replace edit button, remove inline modal**

Open `web/src/views/RadioDetailView.vue`. Apply these changes:

**(a) Update imports (line 6-11)** — drop `SyvoraModal`, `SyvoraFormField`, `SyvoraInput`, `SyvoraTextarea` if only the inline modal uses them. Keep `SyvoraButton`, `SyvoraEmptyState`, `SyvoraTabs`, `useIsMobile`, and `TabItem` type:

Replace:
```ts
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
    SyvoraTabs, useIsMobile,
} from '@syvora/ui'
```
With:
```ts
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'
```

(If `SyvoraFormField`, `SyvoraInput`, or `SyvoraTextarea` are still used elsewhere in the file outside the modal, keep them. Files tab UI may use them — verify by searching the template after removing the modal.)

**(b) Remove edit modal state and handlers** — delete:
- Lines 124-177 (the `// ── Edit modal` block: `showEditModal`, `editForm`, `openEdit`, `closeEditModal`, `saveEdit`, and `saving`/`editError` if not used elsewhere)

`updateRadio` may be used only by `saveEdit` — if so, remove it from the `useRadios()` destructure too.

**(c) Replace the Edit button handler in the template** — find the existing `<SyvoraButton ... @click="openEdit">Edit</SyvoraButton>` (or similar) and replace its handler with:
```html
@click="router.push(`/radios/${radioId}/edit`)"
```

If the file does not currently import `useRouter`, add it to the existing `vue-router` import:
```ts
import { useRoute, useRouter } from 'vue-router'
```
And add `const router = useRouter()` near the existing `const route = useRoute()`.

**(d) Remove the `<SyvoraModal v-if="showEditModal">` block** — lines 331-388 (the entire modal element).

**(e) Remove modal-only CSS** — same approach as RadiosView — drop rules only used by the removed modal markup.

- [ ] **Step 4: Build to verify**

Run: `yarn workspace web build`
Expected: PASS. Watch out for "unused import" or "unused locals" errors from strict TS — clean up anything flagged.

- [ ] **Step 5: Manual smoke test**

Run: `yarn workspace web dev`

In a browser at http://localhost:5173:
1. Navigate to `/radios`. Click "+ New Radio" → URL becomes `/radios/new`, full-page editor renders with side nav (Basics / Links / Description).
2. Type a title. Save button enables. Click Save → navigates to `/radios/<new-id>` (detail view).
3. From the radio list, click the "Edit" action on a row → URL becomes `/radios/<id>/edit`, fields prefill.
4. Change a field. Try to navigate away (sidebar click). Native confirm appears. Cancel → stay. Confirm → leave.
5. From the detail view, click Edit → editor opens with prefilled fields.
6. Verify mobile layout: shrink window below 600px, side nav disappears, sections render stacked.
7. Verify file management still works on the Files tab of `RadioDetailView` (unchanged by this work).

- [ ] **Step 6: Commit**

```bash
git add web/src/router/index.ts web/src/views/RadiosView.vue web/src/views/RadioDetailView.vue
git commit -m "feat(web): cut over radios to fullscreen editor, remove modals"
```

---

## Task 5: Create `EventEditorView`

**Files:**
- Create: `web/src/views/EventEditorView.vue`

This editor handles `/events/new` and `/events/:id/edit`. It has artwork upload (the file is held in memory and uploaded after first save in new mode, identical to the existing modal pattern).

- [ ] **Step 1: Create the editor view**

Create file `web/src/views/EventEditorView.vue`:

```vue
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
                event_date: e.event_date ? e.event_date.split('T')[0]! : '',
                event_time: e.event_date && e.event_date.includes('T')
                    ? e.event_date.split('T')[1]!.slice(0, 5)
                    : '',
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
        ? (form.value.event_time
            ? `${form.value.event_date}T${form.value.event_time}:00`
            : form.value.event_date)
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
```

- [ ] **Step 2: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/EventEditorView.vue
git commit -m "feat(web): add EventEditorView fullscreen editor"
```

---

## Task 6: Wire event routes and remove event modals

**Files:**
- Modify: `web/src/router/index.ts`
- Modify: `web/src/views/EventsView.vue`
- Modify: `web/src/views/EventDetailView.vue`

- [ ] **Step 1: Register routes**

Edit `web/src/router/index.ts`:

Add this import next to existing event imports:
```ts
import EventEditorView from "../views/EventEditorView.vue";
```

Add these routes adjacent to the existing `/events/:id` route:
```ts
{ path: "/events/new", component: EventEditorView, meta: { requiresAuth: true, module: "events" } },
{ path: "/events/:id/edit", component: EventEditorView, meta: { requiresAuth: true, module: "events" } },
```

- [ ] **Step 2: Cut over `EventsView`**

Open `web/src/views/EventsView.vue`.

**(a)** Update the `@syvora/ui` import — remove `SyvoraModal`, `SyvoraFormField`, `SyvoraInput`, `SyvoraTextarea` if they are only used by the modal. Verify by searching the template for their tags after the modal is removed.

**(b)** Remove the modal block (lines 427-500) entirely.

**(c)** Remove modal state and handlers:
- `showModal`, `editingEvent`, `saving`, `error`, `form` definition
- `pendingArtwork`, `artworkPreview`, `artworkInput` ref
- `openCreate`, `openEdit`, `closeModal`, `onArtworkPick`, `saveEvent`

**(d)** Remove now-unused `useEvents` destructure entries: `createEvent`, `updateEvent`, `uploadEventArtwork`. Keep the rest.

**(e)** Replace button handlers in template:
- "+ New Event" `@click="openCreate"` → `@click="router.push('/events/new')"`
- Per-row Edit `@click.stop="openEdit(event)"` → `@click.stop="router.push(`/events/${event.id}/edit`)"`

**(f)** Remove modal-only CSS rules from `<style scoped>`. Look for: `.modal-form`, `.artwork-upload`, `.artwork-preview`, `.artwork-placeholder`, `.artwork-overlay`, `.published-notice`, `.badge-published`, `.form-row`, `.flex-1`, `.toggle-row`, `.toggle-option`, `.field-hint`, `.hidden-input`, `.error-msg`. Verify each is unused in remaining template before removing.

- [ ] **Step 3: Cut over `EventDetailView` — remove ONLY the event-edit modal**

Open `web/src/views/EventDetailView.vue`.

**Critical:** This view has THREE modals. Remove ONLY the event-edit modal. Keep the team-assignment modal (lines 645-673) and transaction modal (lines 676-717) untouched.

**(a)** Remove the event-edit modal (lines 572-642).

**(b)** Remove event-edit state and handlers:
- `showEditModal`, `editForm` (the event-edit form, NOT the team form `teamForm` or the tx form)
- `openEditModal`, `closeEditModal`, `saveEdit` (or whatever the event-edit save fn is named)
- The corresponding `saving`/`error` refs IF dedicated to the event-edit (verify they aren't shared with the other two modals)

**(c)** Keep `SyvoraModal`, `SyvoraFormField`, `SyvoraInput`, `SyvoraTextarea` in the imports — they are still used by the team and transaction modals.

**(d)** Replace the Edit button click handler:
- Find the "Edit" button in the page header and change its handler to `router.push(`/events/${eventId}/edit`)`. If `useRouter` is not yet imported, add it.

- [ ] **Step 4: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `yarn workspace web dev`

1. `/events` → "+ New Event" → `/events/new`. Editor renders with five sections in side nav (Basics, Artwork, Lineup, Description, Tickets).
2. Add an artwork file → preview shows. Add title, date, location. Save → navigates to `/events/<id>`.
3. From list, click row Edit action → `/events/<id>/edit`. Pre-filled fields. Verify artwork preview shows existing artwork.
4. Modify artwork → preview updates. Save → artwork uploads, page stays on edit, Save button greys.
5. Detail view → Edit button → editor opens with prefill.
6. **Critical:** Open the team-assignment modal and the transactions modal in `EventDetailView` — both still work and look unchanged.
7. Dirty guard: change a field, click sidebar nav → confirm prompt appears.

- [ ] **Step 6: Commit**

```bash
git add web/src/router/index.ts web/src/views/EventsView.vue web/src/views/EventDetailView.vue
git commit -m "feat(web): cut over events to fullscreen editor, remove event modals"
```

---

## Task 7: Create `ReleaseDetailView`

**Files:**
- Create: `web/src/views/ReleaseDetailView.vue`

This is a brand-new detail view, mirroring `RadioDetailView` and `EventDetailView`. It is read-only — track management lives in the editor per the spec.

- [ ] **Step 1: Create the detail view**

Create file `web/src/views/ReleaseDetailView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReleases, type Release, type Track } from '../composables/useReleases'
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs, useIsMobile,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const releaseId = computed(() => route.params.id as string)

const { releases, fetchReleases, deleteRelease } = useReleases()

const release = ref<Release | null>(null)
const loading = ref(true)
const activeTab = ref('overview')

const tabs = computed<TabItem[]>(() => [
    { key: 'overview', label: 'Overview' },
    { key: 'tracks', label: 'Tracks', count: release.value?.tracks?.length ?? 0 },
])

const sortedTracks = computed<Track[]>(() => {
    const ts = release.value?.tracks ?? []
    return ts.slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
})

onMounted(async () => {
    await reload()
})

async function reload() {
    loading.value = true
    if (!releases.value.length) {
        await fetchReleases()
    }
    release.value = releases.value.find(r => r.id === releaseId.value) ?? null
    if (!release.value) {
        // Cache miss — refetch and retry
        await fetchReleases()
        release.value = releases.value.find(r => r.id === releaseId.value) ?? null
    }
    loading.value = false
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    })
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function handleDelete() {
    if (!release.value) return
    if (!confirm(`Delete "${release.value.title}"?`)) return
    try {
        await deleteRelease(release.value.id)
        router.push('/releases')
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete release.')
    }
}
</script>

<template>
    <div class="page">
        <header class="detail-header">
            <button class="back-btn" @click="router.push('/releases')" aria-label="Back to releases">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                </svg>
            </button>
            <div class="title-block">
                <h1 class="title">{{ release?.title ?? '…' }}</h1>
                <p v-if="release" class="subtitle">{{ release.artist }}</p>
            </div>
            <div class="actions">
                <SyvoraButton
                    v-if="release"
                    @click="router.push(`/releases/${release.id}/edit`)"
                >Edit</SyvoraButton>
                <SyvoraButton
                    v-if="release"
                    variant="ghost"
                    class="btn-danger"
                    @click="handleDelete"
                >Delete</SyvoraButton>
            </div>
        </header>

        <SyvoraTabs v-if="release" v-model="activeTab" :tabs="tabs" />

        <div v-if="loading" class="loading">Loading…</div>

        <div v-else-if="!release">
            <SyvoraEmptyState
                title="Release not found"
                description="This release may have been deleted."
            />
        </div>

        <section v-else-if="activeTab === 'overview'" class="overview">
            <div class="overview-grid" :class="{ 'overview-grid--mobile': isMobile }">
                <div class="artwork-col">
                    <div class="artwork">
                        <img v-if="release.artwork_url" :src="release.artwork_url" :alt="release.title" />
                        <div v-else class="artwork-empty">No artwork</div>
                    </div>
                </div>
                <div class="meta-col">
                    <dl class="meta">
                        <dt>Type</dt><dd>{{ release.type }}</dd>
                        <dt>Artist</dt><dd>{{ release.artist }}</dd>
                        <dt>Release date</dt><dd>{{ formatDate(release.release_date) }}</dd>
                        <dt v-if="release.description">Description</dt>
                        <dd v-if="release.description" class="description">{{ release.description }}</dd>
                    </dl>
                    <p class="audit">
                        Created {{ formatAuditDate(release.created_at) }}
                        <span v-if="release.creator_name">by {{ release.creator_name }}</span>
                        · Updated {{ formatAuditDate(release.updated_at) }}
                        <span v-if="release.updater_name">by {{ release.updater_name }}</span>
                    </p>
                </div>
            </div>
        </section>

        <section v-else-if="activeTab === 'tracks'" class="tracks">
            <div v-if="sortedTracks.length" class="track-list">
                <div v-for="track in sortedTracks" :key="track.id" class="track-row">
                    <span class="track-num">{{ track.track_number ?? '—' }}</span>
                    <span class="track-title">{{ track.title }}</span>
                    <a v-if="track.file_url" :href="track.file_url" target="_blank" class="track-play"
                        title="Open audio">▶</a>
                    <span v-else class="track-no-file" title="No audio file">–</span>
                </div>
            </div>
            <SyvoraEmptyState
                v-else
                title="No tracks yet"
                description="Add tracks by editing the release."
            />
        </section>
    </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem; }

.detail-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}

.back-btn {
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
}
.back-btn:hover { background: rgba(0, 0, 0, 0.08); color: var(--color-text); }

.title-block { flex: 1; min-width: 0; }
.title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.subtitle { margin: 0.125rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }

.actions { display: flex; gap: 0.5rem; }
.btn-danger { color: rgb(220, 38, 38); }

.loading { padding: 2rem; text-align: center; color: var(--color-text-muted); }

.overview { margin-top: 1.5rem; }
.overview-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 2rem;
}
.overview-grid--mobile { grid-template-columns: 1fr; }

.artwork {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}
.artwork img { width: 100%; height: 100%; object-fit: cover; }
.artwork-empty { color: var(--color-text-muted); font-size: 0.875rem; }

.meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5rem 1rem;
    margin: 0;
}
.meta dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
}
.meta dd { margin: 0; color: var(--color-text); }
.description { white-space: pre-wrap; }

.audit {
    margin-top: 1.25rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.tracks { margin-top: 1.5rem; }
.track-list {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 0.75rem;
    overflow: hidden;
}
.track-row {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.track-row:last-child { border-bottom: none; }
.track-num { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.track-title { font-weight: 500; }
.track-play, .track-no-file {
    text-decoration: none;
    color: var(--color-text-muted);
    font-size: 1rem;
}
.track-play:hover { color: var(--color-text); }
</style>
```

- [ ] **Step 2: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ReleaseDetailView.vue
git commit -m "feat(web): add ReleaseDetailView read-only detail page"
```

---

## Task 8: Create `ReleaseEditorView`

**Files:**
- Create: `web/src/views/ReleaseEditorView.vue`

This is the most complex editor. It includes a Tracks section that is hidden in new mode until first save (per spec), at which point the URL replaces to `/releases/:id/edit` and the Tracks section appears.

- [ ] **Step 1: Create the editor view**

Create file `web/src/views/ReleaseEditorView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReleases, type Release, type ReleaseType, type Track } from '../composables/useReleases'
import { useDirtyGuard } from '../composables/useDirtyGuard'
import {
    SyvoraEditorPage, SyvoraButton, SyvoraFormField, SyvoraInput, SyvoraTextarea,
    type EditorSection,
} from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const {
    releases, fetchReleases, createRelease, updateRelease, uploadArtwork,
    addTrack, deleteTrack, reorderTrack, uploadTrack, updateTrack,
} = useReleases()

const releaseId = ref<string | null>((route.params.id as string | undefined) ?? null)
const isNew = computed(() => !releaseId.value)

const releaseTypes: { value: ReleaseType; label: string }[] = [
    { value: 'album', label: 'Album' },
    { value: 'ep', label: 'EP' },
    { value: 'single', label: 'Single' },
    { value: 'compilation', label: 'Compilation' },
]

interface ReleaseForm {
    title: string
    type: ReleaseType
    artist: string
    description: string
    release_date: string
    artwork_url: string | null
}

function emptyForm(): ReleaseForm {
    return { title: '', type: 'single', artist: '', description: '', release_date: '', artwork_url: null }
}

const form = ref<ReleaseForm>(emptyForm())
const lastSaved = ref<ReleaseForm>(emptyForm())
const pendingArtwork = ref<File | null>(null)
const artworkPreview = ref<string | null>(null)
const artworkInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const error = ref('')

const newTrackTitle = ref('')
const newTrackFile = ref<File | null>(null)
const trackSaving = ref(false)
const showOrdering = ref(false)

const currentRelease = computed<Release | null>(() => {
    if (!releaseId.value) return null
    return releases.value.find(r => r.id === releaseId.value) ?? null
})

const sortedTracks = computed<Track[]>(() => {
    const ts = currentRelease.value?.tracks ?? []
    return ts.slice().sort((a, b) => (a.track_number ?? 999) - (b.track_number ?? 999))
})

const sections = computed<EditorSection[]>(() => {
    const base: EditorSection[] = [
        { id: 'basics', label: 'Basics' },
        { id: 'artwork', label: 'Artwork' },
        { id: 'description', label: 'Description' },
    ]
    if (!isNew.value) base.splice(2, 0, { id: 'tracks', label: 'Tracks' })
    return base
})

const dirty = computed(
    () => JSON.stringify(form.value) !== JSON.stringify(lastSaved.value) || pendingArtwork.value !== null
)
const canSave = computed(() => form.value.title.trim().length > 0 && dirty.value && !saving.value)

const { confirmDiscard } = useDirtyGuard(dirty)

onMounted(async () => {
    if (!releases.value.length) await fetchReleases()
    if (releaseId.value) loadFromCache()
})

function loadFromCache() {
    const r = currentRelease.value
    if (!r) {
        error.value = 'Release not found.'
        return
    }
    form.value = {
        title: r.title,
        type: r.type,
        artist: r.artist,
        description: r.description ?? '',
        release_date: r.release_date ?? '',
        artwork_url: r.artwork_url,
    }
    artworkPreview.value = r.artwork_url
    lastSaved.value = JSON.parse(JSON.stringify(form.value))
}

function onArtworkPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    pendingArtwork.value = file
    const reader = new FileReader()
    reader.onload = () => { artworkPreview.value = reader.result as string }
    reader.readAsDataURL(file)
}

function buildPayload() {
    return {
        title: form.value.title.trim(),
        type: form.value.type,
        artist: form.value.artist.trim(),
        description: form.value.description.trim() || null,
        release_date: form.value.release_date || null,
        artwork_url: form.value.artwork_url,
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
        let workingId = releaseId.value
        const isFirstSave = !workingId
        if (workingId) {
            await updateRelease(workingId, buildPayload())
        } else {
            const created = await createRelease(buildPayload())
            workingId = created.id
        }

        if (pendingArtwork.value && workingId) {
            const url = await uploadArtwork(pendingArtwork.value, workingId)
            await updateRelease(workingId, { artwork_url: url })
            form.value.artwork_url = url
            pendingArtwork.value = null
        }

        lastSaved.value = JSON.parse(JSON.stringify(form.value))

        if (isFirstSave && workingId) {
            // Replace URL so Tracks section appears and back nav doesn't return to /releases/new
            releaseId.value = workingId
            await router.replace(`/releases/${workingId}/edit`)
        }
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save release.'
    } finally {
        saving.value = false
    }
}

function handleCancel() {
    if (!confirmDiscard()) return
    router.back()
}

function onTrackFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    newTrackFile.value = file ?? null
}

async function handleAddTrack() {
    if (!releaseId.value) return
    const title = newTrackTitle.value.trim()
    if (!title) return
    trackSaving.value = true
    try {
        const nextNumber = (sortedTracks.value[sortedTracks.value.length - 1]?.track_number ?? 0) + 1
        const created = await addTrack(releaseId.value, { title, track_number: nextNumber })
        if (newTrackFile.value) {
            const url = await uploadTrack(newTrackFile.value, releaseId.value, created.id)
            await updateTrack(created.id, { file_url: url })
        }
        newTrackTitle.value = ''
        newTrackFile.value = null
        await fetchReleases()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to add track.'
    } finally {
        trackSaving.value = false
    }
}

async function handleReorder(track: Track, direction: 'up' | 'down') {
    showOrdering.value = true
    try {
        await reorderTrack(track.id, direction, sortedTracks.value)
    } catch (e: any) {
        error.value = e.message ?? 'Failed to reorder.'
    }
}

async function handleDeleteTrack(track: Track) {
    if (!confirm(`Delete track "${track.title}"?`)) return
    try {
        await deleteTrack(track.id)
    } catch (e: any) {
        error.value = e.message ?? 'Failed to delete track.'
    }
}
</script>

<template>
    <SyvoraEditorPage
        :title="isNew ? 'New Release' : 'Edit Release'"
        :subtitle="form.title || undefined"
        :sections="sections"
        :saving="saving"
        :can-save="canSave"
        @save="handleSave"
        @cancel="handleCancel"
    >
        <template #basics>
            <div class="form-row">
                <SyvoraFormField label="Title" for="r-title" class="flex-1">
                    <SyvoraInput id="r-title" v-model="form.title" placeholder="Release title" />
                </SyvoraFormField>
                <SyvoraFormField label="Type" for="r-type">
                    <select id="r-type" v-model="form.type" class="native-select">
                        <option v-for="t in releaseTypes" :key="t.value" :value="t.value">
                            {{ t.label }}
                        </option>
                    </select>
                </SyvoraFormField>
            </div>
            <SyvoraFormField label="Artist" for="r-artist">
                <SyvoraInput id="r-artist" v-model="form.artist" placeholder="Artist name" />
            </SyvoraFormField>
            <SyvoraFormField label="Release Date" for="r-date">
                <SyvoraInput id="r-date" v-model="form.release_date" type="date" />
            </SyvoraFormField>
        </template>

        <template #artwork>
            <div class="artwork-upload">
                <div class="artwork-preview" @click="artworkInput?.click()">
                    <img v-if="artworkPreview" :src="artworkPreview" alt="Artwork" />
                    <div v-else class="artwork-placeholder">
                        <span>+</span>
                        <small>Upload artwork</small>
                    </div>
                    <div class="artwork-overlay">Change artwork</div>
                </div>
                <input ref="artworkInput" type="file" accept="image/*"
                    class="hidden-input" @change="onArtworkPick" />
            </div>
        </template>

        <template v-if="!isNew" #tracks>
            <div class="tracks-section">
                <div class="tracks-header">
                    <span class="tracks-label">Tracks</span>
                    <span v-if="showOrdering" class="tracks-hint">Use arrows to set order</span>
                </div>
                <div v-if="sortedTracks.length" class="track-list">
                    <div v-for="(track, idx) in sortedTracks" :key="track.id" class="track-item">
                        <div v-if="showOrdering" class="track-reorder">
                            <button class="reorder-btn" :disabled="idx === 0" title="Move up"
                                @click="handleReorder(track, 'up')">▲</button>
                            <button class="reorder-btn"
                                :disabled="idx === sortedTracks.length - 1"
                                title="Move down" @click="handleReorder(track, 'down')">▼</button>
                        </div>
                        <span class="track-num">{{ track.track_number ?? '—' }}</span>
                        <span class="track-title-text">{{ track.title }}</span>
                        <a v-if="track.file_url" :href="track.file_url" target="_blank"
                            class="track-play" title="Open audio">▶</a>
                        <span v-else class="track-no-file" title="No audio file">–</span>
                        <button class="track-delete" title="Delete track"
                            @click="handleDeleteTrack(track)">✕</button>
                    </div>
                </div>
                <p v-else class="placeholder">No tracks yet — add one below.</p>

                <div class="add-track">
                    <p class="add-track-label">Add track</p>
                    <SyvoraFormField label="Title" for="new-track-title">
                        <SyvoraInput id="new-track-title" v-model="newTrackTitle"
                            placeholder="Track title" @keydown.enter="handleAddTrack" />
                    </SyvoraFormField>
                    <SyvoraFormField label="Audio file" for="new-track-file">
                        <label class="file-pick-btn">
                            <input id="new-track-file" type="file" accept="audio/*"
                                class="hidden-input" @change="onTrackFilePick" />
                            <span class="file-pick-icon">♪</span>
                            <span class="file-pick-text">
                                {{ newTrackFile ? newTrackFile.name : 'Choose audio file (MP3, WAV, FLAC...)' }}
                            </span>
                        </label>
                    </SyvoraFormField>
                    <SyvoraButton size="sm" :loading="trackSaving"
                        :disabled="!newTrackTitle.trim() || trackSaving" @click="handleAddTrack">
                        {{ trackSaving ? 'Uploading...' : '+ Add Track' }}
                    </SyvoraButton>
                </div>
            </div>
        </template>

        <template #description>
            <SyvoraFormField label="Description" for="r-desc">
                <SyvoraTextarea id="r-desc" v-model="form.description"
                    placeholder="Optional description..." :rows="6" />
            </SyvoraFormField>
            <p v-if="isNew" class="save-hint">
                You can add tracks after saving the release.
            </p>
        </template>
    </SyvoraEditorPage>

    <p v-if="error" class="error-msg">{{ error }}</p>
</template>

<style scoped>
.form-row { display: flex; gap: 1rem; }
.flex-1 { flex: 1; }

.native-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 0.5rem;
    background: #fff;
    font-size: 0.875rem;
    color: var(--color-text);
}

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
.artwork-preview img { width: 100%; height: 100%; object-fit: cover; }
.artwork-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-muted);
}
.artwork-placeholder span { font-size: 2rem; line-height: 1; }
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

.tracks-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.tracks-header { display: flex; align-items: baseline; gap: 0.5rem; }
.tracks-label { font-weight: 600; }
.tracks-hint { font-size: 0.75rem; color: var(--color-text-muted); }

.track-list {
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 0.5rem;
    overflow: hidden;
}
.track-item {
    display: grid;
    grid-template-columns: auto 2.5rem 1fr auto auto;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.track-item:last-child { border-bottom: none; }
.track-reorder { display: flex; flex-direction: column; gap: 0.125rem; }
.reorder-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.625rem;
    line-height: 1;
    padding: 0;
}
.reorder-btn:disabled { opacity: 0.3; cursor: default; }
.track-num { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.track-title-text { font-weight: 500; }
.track-play, .track-no-file { text-decoration: none; color: var(--color-text-muted); }
.track-play:hover { color: var(--color-text); }
.track-delete {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
}
.track-delete:hover { color: rgb(220, 38, 38); }

.placeholder { color: var(--color-text-muted); font-size: 0.875rem; padding: 0.5rem 0; }

.add-track {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.5rem;
}
.add-track-label { margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; }

.file-pick-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.04);
    border: 1px dashed rgba(0, 0, 0, 0.16);
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}
.file-pick-icon { font-size: 1rem; }

.save-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
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
```

- [ ] **Step 2: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ReleaseEditorView.vue
git commit -m "feat(web): add ReleaseEditorView fullscreen editor with tracks management"
```

---

## Task 9: Wire release routes and remove release modal

**Files:**
- Modify: `web/src/router/index.ts`
- Modify: `web/src/views/ReleasesView.vue`

- [ ] **Step 1: Register routes**

Edit `web/src/router/index.ts`:

Add imports:
```ts
import ReleaseDetailView from "../views/ReleaseDetailView.vue";
import ReleaseEditorView from "../views/ReleaseEditorView.vue";
```

Add these routes adjacent to the existing `/releases` route (line 34):
```ts
{ path: "/releases/new", component: ReleaseEditorView, meta: { requiresAuth: true, module: "releases" } },
{ path: "/releases/:id", component: ReleaseDetailView, meta: { requiresAuth: true, module: "releases" } },
{ path: "/releases/:id/edit", component: ReleaseEditorView, meta: { requiresAuth: true, module: "releases" } },
```

- [ ] **Step 2: Cut over `ReleasesView`**

Open `web/src/views/ReleasesView.vue`.

**(a)** Update `@syvora/ui` import — drop `SyvoraModal`, `SyvoraFormField`, `SyvoraInput`, `SyvoraTextarea` if only the modal uses them.

**(b)** Remove the modal block (lines 531-627) entirely.

**(c)** Remove modal state and handlers:
- `showModal`, `editingRelease`, `saving`, `error`, `form`, `artworkInput`, `pendingArtwork`, `artworkPreview`
- `newTrackTitle`, `newTrackFile`, `trackSaving`, `showOrdering`
- `openCreate`, `openEdit`, `closeModal`, `onArtworkPick`, `saveRelease`
- `handleAddTrack`, `handleReorder`, `handleDeleteTrack`, `onTrackFilePick`
- `sortedTracks` (was likely scoped to `editingRelease`)

**(d)** From the `useReleases()` destructure remove what only the modal used: `createRelease`, `updateRelease`, `uploadArtwork`, `addTrack`, `deleteTrack`, `reorderTrack`, `uploadTrack`, `updateTrack`. Keep `releases`, `loading`, `fetchReleases`, `deleteRelease`.

**(e)** Add `useRouter` if not already imported, and replace button handlers in template:
- "+ New Release" `@click="openCreate"` → `@click="router.push('/releases/new')"`
- Per-row Edit `@click="openEdit(release)"` → `@click.stop="router.push(`/releases/${release.id}/edit`)"` (add `.stop` if the row itself is clickable)
- Make rows clickable: add `@click="router.push(`/releases/${release.id}`)"` to each release row's container element. (Find the row element — it's likely a `<div class="release-row">` or `<li>` — match the pattern used in `RadiosView` row.)

**(f)** Remove modal-only CSS (similar approach as Tasks 4 and 6).

- [ ] **Step 3: Build to verify**

Run: `yarn workspace web build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `yarn workspace web dev`

1. `/releases` → "+ New Release" → `/releases/new`. Editor shows three sections (Basics, Artwork, Description) — **no Tracks section yet**.
2. Fill title, artist, type. Save → URL replaces to `/releases/<id>/edit`. Tracks section now appears in side nav.
3. In Tracks section: enter a track title, optionally pick an audio file, click "+ Add Track". Track appears in list. Repeat for several.
4. Refresh page → fields and tracks persist.
5. Click row in `/releases` list → goes to `/releases/<id>` (new ReleaseDetailView).
6. From detail view: Edit button → `/releases/<id>/edit`. Delete button works.
7. Detail view Tracks tab: shows tracks read-only, with play links if files attached.
8. Dirty guard: change a basic field, click Cancel → confirm. Click sidebar nav → confirm.
9. Mobile (<600px): side nav hidden, sections stack.
10. Reorder a track: click ▲/▼ on a track → order updates, confirm by reload.
11. Delete a track: confirm prompt, then track removed.

- [ ] **Step 5: Commit**

```bash
git add web/src/router/index.ts web/src/views/ReleasesView.vue
git commit -m "feat(web): cut over releases to fullscreen editor + add ReleaseDetailView routes"
```

---

## Task 10: Final cleanup sweep

**Files:** all touched above

- [ ] **Step 1: Search for orphan symbols**

Search the modified list/detail views for any leftover symbols from the removed modals. Use the Grep tool on each:

```
RadiosView.vue        — search: showModal, editingRadio, saveRadio, openCreate, openEdit, closeModal, onFilePick, pendingFiles
EventsView.vue        — search: showModal, editingEvent, saveEvent, openCreate, openEdit, closeModal, onArtworkPick, artworkPreview
ReleasesView.vue      — search: showModal, editingRelease, saveRelease, openCreate, openEdit, closeModal, onArtworkPick, handleAddTrack
RadioDetailView.vue   — search: showEditModal, editForm, openEdit, closeEditModal, saveEdit
EventDetailView.vue   — search: showEditModal (only the event-edit one — team and tx ones may share names; verify each match)
```

Each match should be a remaining usage that you intentionally kept (e.g. team modal in EventDetailView). If it's a leftover from the removed event-edit modal, delete it.

- [ ] **Step 2: Run a clean production build**

```bash
yarn workspace web build
```
Expected: PASS with no warnings about unused imports/variables. If TS strict mode flags anything, fix it.

- [ ] **Step 3: Full end-to-end manual smoke**

Run: `yarn workspace web dev`

Walk every flow once more:
- [ ] Create + edit a Radio (no files in editor; files via detail view's Files tab)
- [ ] Create + edit an Event (artwork upload, ticket toggle)
- [ ] Create + edit a Release (basics, then tracks appear after first save, add/reorder/delete tracks)
- [ ] Each detail view Edit button navigates to its editor
- [ ] Each list view "+ New" navigates to its editor
- [ ] Dirty guard fires on attempted nav-away with unsaved changes
- [ ] Browser tab close warns when dirty
- [ ] Mobile breakpoint: side nav disappears, sections stack
- [ ] EventDetailView's team-assignment modal still works
- [ ] EventDetailView's transaction modal still works
- [ ] No console errors

- [ ] **Step 4: Commit any final cleanup**

If step 1 or 2 surfaced any orphans:

```bash
git add -p   # interactively review and stage
git commit -m "chore(web): clean up orphan modal references after editor cutover"
```

If everything was already clean, skip the commit.

---

## Notes for the executor

- **CSS classes named identically across views** (e.g. `.form-row`, `.flex-1`, `.artwork-preview`) are SCOPED in Vue SFCs — duplicating them per file is intentional and correct.
- **Why `JSON.stringify` for dirty checking:** good enough for these flat forms with primitive arrays. Don't over-engineer with a deep-equal library; YAGNI.
- **Why the artwork upload happens AFTER createRelease/createEvent:** `uploadArtwork`/`uploadEventArtwork` need the entity's ID to construct the storage path. This is preserved from the existing modal logic.
- **Why `router.replace` for first-save in release new mode:** after first save, the URL becomes the edit URL; `replace` (not `push`) prevents browser back from returning to `/releases/new` with stale state.
- **The Tracks section appearing dynamically** triggers `SyvoraEditorPage`'s `watch(() => sections.map(...))` which re-creates the IntersectionObserver — this is intentional.
- **Build before commit, always.** A failing typecheck after a "clean" diff is the most common slip-up.
