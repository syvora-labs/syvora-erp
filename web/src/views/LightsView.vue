<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
    useLights,
    getDefaultConfigForType,
    type Lightshow, type LightshowMode, type LightshowModeType,
    type GradientConfig, type BuildupConfig, type TextConfig, type SpotlightsConfig, type ModeConfig,
} from '../composables/useLights'
import { useLightshowPlayer } from '../composables/useLightshowPlayer'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState, useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()

const {
    lightshows, loading, fetchLightshows,
    createLightshow, updateLightshow, deleteLightshow,
    fetchModes, createMode, updateMode, deleteMode, reorderModes,
} = useLights()

const player = useLightshowPlayer()

// ── Lightshow CRUD modal ────────────────────────────────────────────────────
const showModal = ref(false)
const editingLightshow = ref<Lightshow | null>(null)
const saving = ref(false)
const error = ref('')
const form = ref({ title: '', description: '' })

// ── Detail view ─────────────────────────────────────────────────────────────
const selectedLightshow = ref<Lightshow | null>(null)
const modes = ref<LightshowMode[]>([])
const selectedMode = ref<LightshowMode | null>(null)
const loadingModes = ref(false)

// ── Mode modal ──────────────────────────────────────────────────────────────
const showModeModal = ref(false)
const editingMode = ref<LightshowMode | null>(null)
const modeType = ref<LightshowModeType>('gradient')
const modeConfig = ref<ModeConfig>(getDefaultConfigForType('gradient'))
const savingMode = ref(false)
const modeError = ref('')

// ── Fullscreen ──────────────────────────────────────────────────────────────
const fullscreenContainer = ref<HTMLElement | null>(null)
const fullscreenCanvas = ref<HTMLCanvasElement | null>(null)
const showControls = ref(true)
let controlsTimeout: ReturnType<typeof setTimeout> | null = null

// ── Preview canvas ──────────────────────────────────────────────────────────
const previewCanvas = ref<HTMLCanvasElement | null>(null)

onMounted(async () => {
    await fetchLightshows()
})

// ── Lightshow CRUD ──────────────────────────────────────────────────────────
function openCreate() {
    editingLightshow.value = null
    form.value = { title: '', description: '' }
    error.value = ''
    showModal.value = true
}

function openEdit(lightshow: Lightshow) {
    editingLightshow.value = lightshow
    form.value = { title: lightshow.title, description: lightshow.description ?? '' }
    error.value = ''
    showModal.value = true
}

async function saveLightshow() {
    if (!form.value.title.trim()) { error.value = 'Title is required.'; return }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description.trim() || null,
        }
        if (editingLightshow.value) {
            await updateLightshow(editingLightshow.value.id, payload)
        } else {
            await createLightshow(payload)
        }
        showModal.value = false
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save lightshow.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(lightshow: Lightshow) {
    if (!confirm(`Delete "${lightshow.title}"?`)) return
    try {
        await deleteLightshow(lightshow.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete lightshow.')
    }
}

// ── Detail view ─────────────────────────────────────────────────────────────
async function openDetail(lightshow: Lightshow) {
    selectedLightshow.value = lightshow
    await loadModes(lightshow.id)
}

function closeDetail() {
    player.stopRendering()
    selectedLightshow.value = null
    modes.value = []
    selectedMode.value = null
}

async function loadModes(lightshowId: string) {
    loadingModes.value = true
    const prevSelectedId = selectedMode.value?.id
    try {
        modes.value = await fetchModes(lightshowId)
        // Re-select the previously selected mode (by ID) from the fresh list,
        // or fall back to the first mode
        const match = prevSelectedId ? modes.value.find(m => m.id === prevSelectedId) : null
        const target = match ?? (modes.value.length > 0 ? modes.value[0] : null)
        if (target) {
            selectMode(target)
        } else {
            selectedMode.value = null
        }
    } finally {
        loadingModes.value = false
    }
}

function selectMode(mode: LightshowMode) {
    selectedMode.value = mode
    player.switchMode(mode)
    startPreview()
}

// ── Preview ─────────────────────────────────────────────────────────────────
async function startPreview() {
    await nextTick()
    if (previewCanvas.value) {
        player.setCanvas(previewCanvas.value)
        if (!player.isPlaying.value) {
            player.startRendering()
        }
    }
}

// ── Mode CRUD ───────────────────────────────────────────────────────────────
function openCreateMode() {
    editingMode.value = null
    modeType.value = 'gradient'
    modeConfig.value = getDefaultConfigForType('gradient')
    modeError.value = ''
    showModeModal.value = true
}

function openEditMode(mode: LightshowMode) {
    editingMode.value = mode
    modeType.value = mode.type
    modeConfig.value = JSON.parse(JSON.stringify(mode.config))
    modeError.value = ''
    showModeModal.value = true
}

function onModeTypeChange() {
    if (!editingMode.value) {
        modeConfig.value = getDefaultConfigForType(modeType.value)
    }
}

async function saveMode() {
    if (!selectedLightshow.value) return
    savingMode.value = true
    modeError.value = ''
    try {
        if (editingMode.value) {
            await updateMode(editingMode.value.id, { type: modeType.value, config: modeConfig.value })
        } else {
            await createMode(selectedLightshow.value.id, {
                type: modeType.value,
                config: modeConfig.value,
                sort_order: modes.value.length,
            })
        }
        await loadModes(selectedLightshow.value.id)
        showModeModal.value = false
    } catch (e: any) {
        modeError.value = e.message ?? 'Failed to save mode.'
    } finally {
        savingMode.value = false
    }
}

async function handleDeleteMode(mode: LightshowMode) {
    if (!confirm(`Delete this ${mode.type} mode?`)) return
    if (!selectedLightshow.value) return
    try {
        await deleteMode(mode.id)
        if (selectedMode.value?.id === mode.id) {
            selectedMode.value = null
            player.stopRendering()
        }
        await loadModes(selectedLightshow.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete mode.')
    }
}

async function moveModeUp(index: number) {
    if (index <= 0 || !selectedLightshow.value) return
    const ids = modes.value.map(m => m.id)
    const tmp = ids[index - 1]!
    ids[index - 1] = ids[index]!
    ids[index] = tmp
    await reorderModes(selectedLightshow.value.id, ids)
    await loadModes(selectedLightshow.value.id)
}

async function moveModeDown(index: number) {
    if (index >= modes.value.length - 1 || !selectedLightshow.value) return
    const ids = modes.value.map(m => m.id)
    const tmp = ids[index]!
    ids[index] = ids[index + 1]!
    ids[index + 1] = tmp
    await reorderModes(selectedLightshow.value.id, ids)
    await loadModes(selectedLightshow.value.id)
}

// ── Fullscreen playback ─────────────────────────────────────────────────────
async function launchFullscreen() {
    if (!selectedMode.value) return
    await nextTick()
    if (fullscreenContainer.value && fullscreenCanvas.value) {
        player.setCanvas(fullscreenCanvas.value)
        player.switchMode(selectedMode.value)
        player.startRendering()
        await player.enterFullscreen(fullscreenContainer.value)
    }
}

watch(() => player.isFullscreen.value, (fs) => {
    if (!fs && fullscreenCanvas.value) {
        // Returned from fullscreen — switch back to preview canvas
        if (previewCanvas.value) {
            player.setCanvas(previewCanvas.value)
        }
    }
})

function onFullscreenMouseMove() {
    showControls.value = true
    if (controlsTimeout) clearTimeout(controlsTimeout)
    controlsTimeout = setTimeout(() => { showControls.value = false }, 2500)
}

function switchFullscreenMode(mode: LightshowMode) {
    selectedMode.value = mode
    player.switchMode(mode)
}

// ── Live performance keyboard shortcuts ─────────────────────────────────────
// Space = hold to build, release to freeze | Enter = drop | F = flash
// Arrow Up/Down = intensity | R = reset to auto | 1-9 = switch mode
function onKeyDown(e: KeyboardEvent) {
    if (!player.isFullscreen.value) return
    switch (e.code) {
        case 'Space':
            e.preventDefault()
            player.startBuildup()
            break
        case 'Enter':
            e.preventDefault()
            player.triggerDrop()
            break
        case 'KeyF':
            player.triggerFlash()
            break
        case 'ArrowUp':
            e.preventDefault()
            player.setLiveIntensity(player.liveIntensity.value + 0.1)
            break
        case 'ArrowDown':
            e.preventDefault()
            player.setLiveIntensity(player.liveIntensity.value - 0.1)
            break
        case 'KeyR':
            player.resetBuildup()
            player.setLiveIntensity(1)
            break
        default: {
            // 1-9 switch modes
            const num = parseInt(e.key)
            if (num >= 1 && num <= modes.value.length) {
                const mode = modes.value[num - 1]
                if (mode) switchFullscreenMode(mode)
            }
        }
    }
}

function onKeyUp(e: KeyboardEvent) {
    if (!player.isFullscreen.value) return
    if (e.code === 'Space') {
        player.stopBuildup()
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
})

// ── Config helpers ──────────────────────────────────────────────────────────
const gradientConfig = computed(() => modeConfig.value as GradientConfig)
const buildupConfig = computed(() => modeConfig.value as BuildupConfig)
const textConfig = computed(() => modeConfig.value as TextConfig)
const spotlightsConfig = computed(() => modeConfig.value as SpotlightsConfig)

function addColor() {
    const cfg = modeConfig.value as any
    if (cfg.colors) cfg.colors.push('#ffffff')
}

function removeColor(index: number) {
    const cfg = modeConfig.value as any
    if (cfg.colors && cfg.colors.length > 1) cfg.colors.splice(index, 1)
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function modeLabel(type: string) {
    if (type === 'gradient_aggressive') return 'Aggressive'
    if (type === 'spotlights') return 'Spotlights'
    return type.charAt(0).toUpperCase() + type.slice(1)
}

</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <!-- ── Lightshow list ────────────────────────────────────────────── -->
        <template v-if="!selectedLightshow">
            <div class="page-inner">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">Lights</h1>
                        <p class="page-subtitle">Create and manage lightshows for events</p>
                    </div>
                    <SyvoraButton @click="openCreate">+ New Lightshow</SyvoraButton>
                </div>

                <div v-if="loading" class="loading-text">Loading lightshows...</div>

                <SyvoraEmptyState v-else-if="lightshows.length === 0" title="No lightshows yet"
                    description="Create your first lightshow to get started." />

                <SyvoraCard v-else>
                    <div class="item-list">
                        <div v-for="ls in lightshows" :key="ls.id" class="item-row" @click="openDetail(ls)">
                            <div class="item-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                            </div>
                            <div class="item-info">
                                <span class="item-name">{{ ls.title }}</span>
                                <span class="item-meta">
                                    <template v-if="ls.description">{{ ls.description }} · </template>
                                    Created {{ formatDate(ls.created_at) }}
                                    <template v-if="ls.creator_name"> by {{ ls.creator_name }}</template>
                                </span>
                            </div>
                            <div class="item-actions" @click.stop>
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(ls)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(ls)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </SyvoraCard>
            </div>
        </template>

        <!-- ── Lightshow detail / editor ─────────────────────────────────── -->
        <template v-else>
            <div class="page-inner">
                <div class="page-header">
                    <div>
                        <button class="back-btn" @click="closeDetail">&larr; Back</button>
                        <h1 class="page-title">{{ selectedLightshow.title }}</h1>
                        <p v-if="selectedLightshow.description" class="page-subtitle">{{ selectedLightshow.description }}</p>
                    </div>
                    <div class="header-actions">
                        <SyvoraButton variant="ghost" @click="openCreateMode">+ Add Mode</SyvoraButton>
                        <SyvoraButton :disabled="!selectedMode" @click="launchFullscreen">Fullscreen</SyvoraButton>
                    </div>
                </div>

                <!-- Mode list -->
                <div v-if="loadingModes" class="loading-text">Loading modes...</div>

                <div v-else-if="modes.length === 0" class="empty-modes">
                    <SyvoraEmptyState title="No modes yet" description="Add a gradient, buildup, or text mode to start designing your lightshow." />
                </div>

                <template v-else>
                    <div class="modes-and-preview">
                        <!-- Mode list sidebar -->
                        <SyvoraCard class="modes-list-card">
                            <div class="modes-list">
                                <div
                                    v-for="(mode, i) in modes"
                                    :key="mode.id"
                                    class="mode-item"
                                    :class="{ active: selectedMode?.id === mode.id }"
                                    @click="selectMode(mode)"
                                >
                                    <div class="mode-item-header">
                                        <span class="mode-type-badge" :class="`badge-${mode.type}`">{{ modeLabel(mode.type) }}</span>
                                        <div class="mode-item-actions" @click.stop>
                                            <button class="icon-btn" @click="moveModeUp(i)" :disabled="i === 0" title="Move up">&uarr;</button>
                                            <button class="icon-btn" @click="moveModeDown(i)" :disabled="i === modes.length - 1" title="Move down">&darr;</button>
                                            <button class="icon-btn" @click="openEditMode(mode)" title="Edit">&#9998;</button>
                                            <button class="icon-btn btn-danger" @click="handleDeleteMode(mode)" title="Delete">&times;</button>
                                        </div>
                                    </div>
                                    <div class="mode-preview-colors">
                                        <span
                                            v-for="(c, ci) in (mode.config as any).colors || []"
                                            :key="ci"
                                            class="color-dot"
                                            :style="{ background: c }"
                                        />
                                    </div>
                                </div>
                            </div>
                        </SyvoraCard>

                        <!-- Live preview -->
                        <div class="preview-area">
                            <canvas ref="previewCanvas" class="preview-canvas" />
                        </div>
                    </div>
                </template>

                <!-- Metadata -->
                <div class="detail-meta">
                    <span v-if="selectedLightshow.creator_name">Created by {{ selectedLightshow.creator_name }} · {{ formatDate(selectedLightshow.created_at) }}</span>
                    <span v-if="selectedLightshow.updater_name"> · Last updated by {{ selectedLightshow.updater_name }}</span>
                </div>
            </div>
        </template>
    </div>

    <!-- Fullscreen target (hidden until requestFullscreen is called) -->
    <div ref="fullscreenContainer" class="fullscreen-target" @mousemove="onFullscreenMouseMove">
        <canvas ref="fullscreenCanvas" class="fullscreen-canvas" />
        <div
            class="fullscreen-controls"
            :class="{ hidden: !showControls }"
            @mousemove="onFullscreenMouseMove"
        >
            <!-- Top row: mode switching -->
            <div class="fs-top-row">
                <div class="fs-mode-buttons">
                    <button
                        v-for="(mode, i) in modes"
                        :key="mode.id"
                        class="fs-mode-btn"
                        :class="{ active: selectedMode?.id === mode.id }"
                        @click="switchFullscreenMode(mode)"
                    >
                        <span class="fs-mode-key">{{ i + 1 }}</span>
                        {{ modeLabel(mode.type) }}
                    </button>
                </div>
                <button class="fs-exit-btn" @click="player.exitFullscreen()">Exit</button>
            </div>

            <!-- Bottom row: live performance controls -->
            <div class="fs-live-row">
                <div class="fs-live-group">
                    <button
                        class="fs-live-btn fs-btn-buildup"
                        @mousedown="player.startBuildup()"
                        @mouseup="player.stopBuildup()"
                        @mouseleave="player.stopBuildup()"
                    >
                        Hold: Build
                        <span class="fs-key-hint">Space</span>
                    </button>
                    <button class="fs-live-btn fs-btn-drop" @click="player.triggerDrop()">
                        Drop
                        <span class="fs-key-hint">Enter</span>
                    </button>
                    <button class="fs-live-btn" @click="player.triggerFlash()">
                        Flash
                        <span class="fs-key-hint">F</span>
                    </button>
                    <button class="fs-live-btn" @click="player.resetBuildup()">
                        Auto
                        <span class="fs-key-hint">R</span>
                    </button>
                </div>

                <div class="fs-live-group fs-intensity-group">
                    <span class="fs-live-label">Intensity</span>
                    <input
                        type="range" min="0" max="2" step="0.05"
                        :value="player.liveIntensity.value"
                        @input="player.setLiveIntensity(Number(($event.target as HTMLInputElement).value))"
                        class="fs-intensity-slider"
                    />
                    <span class="fs-live-value">{{ Math.round(player.liveIntensity.value * 100) }}%</span>
                </div>

                <!-- Buildup progress indicator -->
                <div class="fs-buildup-bar-wrap">
                    <div
                        class="fs-buildup-bar"
                        :style="{ width: (player.liveBuildup.value >= 0 ? player.liveBuildup.value * 100 : 0) + '%' }"
                    />
                    <span class="fs-buildup-label">
                        {{ player.liveBuildup.value >= 0 ? Math.round(player.liveBuildup.value * 100) + '%' : 'Auto' }}
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- Create / Edit Lightshow Modal -->
    <SyvoraModal v-if="showModal" :title="editingLightshow ? 'Edit Lightshow' : 'Create Lightshow'" size="sm" @close="showModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Title" for="ls-title">
                <SyvoraInput id="ls-title" v-model="form.title" placeholder="My Lightshow" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="ls-desc">
                <SyvoraTextarea id="ls-desc" v-model="form.description" placeholder="Optional description..." :rows="3" />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveLightshow">
                {{ editingLightshow ? 'Save Changes' : 'Create Lightshow' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Create / Edit Mode Modal -->
    <SyvoraModal v-if="showModeModal" :title="editingMode ? 'Edit Mode' : 'Add Mode'" size="md" @close="showModeModal = false">
        <div class="modal-form mode-editor">
            <!-- Mode type selector -->
            <SyvoraFormField label="Mode Type" for="mode-type">
                <select id="mode-type" v-model="modeType" class="native-select" @change="onModeTypeChange" :disabled="!!editingMode">
                    <option value="gradient">Gradient</option>
                    <option value="gradient_aggressive">Gradient Aggressive</option>
                    <option value="buildup">Buildup</option>
                    <option value="spotlights">Spotlights</option>
                    <option value="text">Text</option>
                </select>
            </SyvoraFormField>

            <!-- Shared: gradient colors (not for spotlights) -->
            <div v-if="modeType !== 'spotlights'" class="config-section">
                <h3 class="config-section-title">Colors</h3>
                <div class="color-list">
                    <div v-for="(color, i) in (modeConfig as any).colors" :key="i" class="color-entry">
                        <input type="color" :value="color" @input="(modeConfig as any).colors[i] = ($event.target as HTMLInputElement).value" class="color-input" />
                        <button v-if="(modeConfig as any).colors.length > 1" class="icon-btn btn-danger" @click="removeColor(Number(i))">&times;</button>
                    </div>
                    <button class="add-color-btn" @click="addColor">+ Add Color</button>
                </div>
            </div>

            <!-- Shared: gradient speed & angle (not for spotlights) -->
            <div v-if="modeType !== 'spotlights'" class="config-row">
                <SyvoraFormField label="Speed" for="grad-speed">
                    <input id="grad-speed" type="range" min="0.1" max="2" step="0.1"
                        v-model.number="(modeConfig as any).gradient_speed" class="range-input" />
                    <span class="range-value">{{ (modeConfig as any).gradient_speed }}</span>
                </SyvoraFormField>
                <SyvoraFormField label="Angle" for="grad-angle">
                    <input id="grad-angle" type="range" min="0" max="360" step="5"
                        v-model.number="(modeConfig as any).gradient_angle" class="range-input" />
                    <span class="range-value">{{ (modeConfig as any).gradient_angle }}&deg;</span>
                </SyvoraFormField>
            </div>

            <!-- Gradient mode: shape config -->
            <template v-if="modeType === 'gradient' || modeType === 'gradient_aggressive'">
                <div class="config-section">
                    <h3 class="config-section-title">Shape</h3>
                    <div class="config-row">
                        <SyvoraFormField label="Type" for="shape-type">
                            <select id="shape-type" v-model="gradientConfig.shape.type" class="native-select">
                                <option value="none">None</option>
                                <option value="circle">Circle</option>
                                <option value="square">Square</option>
                                <option value="triangle">Triangle</option>
                            </select>
                        </SyvoraFormField>
                        <SyvoraFormField label="Color" for="shape-color">
                            <input id="shape-color" type="color" v-model="gradientConfig.shape.color" class="color-input" />
                        </SyvoraFormField>
                    </div>
                    <template v-if="gradientConfig.shape.type !== 'none'">
                        <div class="config-row">
                            <SyvoraFormField label="Size" for="shape-size">
                                <input id="shape-size" type="range" min="0.05" max="0.8" step="0.05"
                                    v-model.number="gradientConfig.shape.size" class="range-input" />
                                <span class="range-value">{{ gradientConfig.shape.size }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Opacity" for="shape-opacity">
                                <input id="shape-opacity" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="gradientConfig.shape.opacity" class="range-input" />
                                <span class="range-value">{{ gradientConfig.shape.opacity }}</span>
                            </SyvoraFormField>
                        </div>
                        <div class="config-row">
                            <SyvoraFormField label="Movement" for="shape-movement">
                                <select id="shape-movement" v-model="gradientConfig.shape.movement_pattern" class="native-select">
                                    <option value="drift">Drift</option>
                                    <option value="bounce">Bounce</option>
                                    <option value="orbit">Orbit</option>
                                </select>
                            </SyvoraFormField>
                            <SyvoraFormField label="Move Speed" for="shape-speed">
                                <input id="shape-speed" type="range" min="0.1" max="2" step="0.1"
                                    v-model.number="gradientConfig.shape.movement_speed" class="range-input" />
                                <span class="range-value">{{ gradientConfig.shape.movement_speed }}</span>
                            </SyvoraFormField>
                        </div>
                        <div class="config-toggles">
                            <label class="toggle-item">
                                <input type="checkbox" v-model="gradientConfig.shape.flicker" />
                                <span>Flicker</span>
                            </label>
                            <label class="toggle-item" v-if="gradientConfig.shape.flicker">
                                <span>Intensity</span>
                                <input type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="gradientConfig.shape.flicker_intensity" class="range-input range-sm" />
                            </label>
                            <label class="toggle-item">
                                <input type="checkbox" v-model="gradientConfig.shape.shimmer" />
                                <span>Shimmer</span>
                            </label>
                            <label class="toggle-item">
                                <input type="checkbox" v-model="gradientConfig.shape.pulse" />
                                <span>Pulse</span>
                            </label>
                            <label class="toggle-item" v-if="gradientConfig.shape.pulse">
                                <span>Pulse Speed</span>
                                <input type="range" min="0.1" max="2" step="0.1"
                                    v-model.number="gradientConfig.shape.pulse_speed" class="range-input range-sm" />
                            </label>
                        </div>
                        <div class="config-row">
                            <SyvoraFormField label="Stretch" for="shape-stretch">
                                <input id="shape-stretch" type="range" min="0" max="1" step="0.1"
                                    v-model.number="gradientConfig.shape.stretch" class="range-input" />
                                <span class="range-value">{{ gradientConfig.shape.stretch }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Stretch Speed" for="shape-stretch-speed">
                                <input id="shape-stretch-speed" type="range" min="0.1" max="2" step="0.1"
                                    v-model.number="gradientConfig.shape.stretch_speed" class="range-input" />
                                <span class="range-value">{{ gradientConfig.shape.stretch_speed }}</span>
                            </SyvoraFormField>
                        </div>
                    </template>
                </div>
            </template>

            <!-- Buildup mode config -->
            <template v-if="modeType === 'buildup'">
                <div class="config-section">
                    <h3 class="config-section-title">Side Lines</h3>
                    <div class="config-row">
                        <SyvoraFormField label="Color" for="line-color">
                            <input id="line-color" type="color" v-model="buildupConfig.side_lines.color" class="color-input" />
                        </SyvoraFormField>
                        <SyvoraFormField label="Width" for="line-width">
                            <input id="line-width" type="range" min="10" max="100" step="5"
                                v-model.number="buildupConfig.side_lines.width" class="range-input" />
                            <span class="range-value">{{ buildupConfig.side_lines.width }}px</span>
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Sweep Speed" for="line-sweep">
                            <input id="line-sweep" type="range" min="0.1" max="2" step="0.1"
                                v-model.number="buildupConfig.side_lines.sweep_speed" class="range-input" />
                            <span class="range-value">{{ buildupConfig.side_lines.sweep_speed }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Brightness" for="line-bright">
                            <input id="line-bright" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="buildupConfig.side_lines.brightness" class="range-input" />
                            <span class="range-value">{{ buildupConfig.side_lines.brightness }}</span>
                        </SyvoraFormField>
                    </div>
                </div>

                <div class="config-section">
                    <h3 class="config-section-title">Buildup Shape</h3>
                    <div class="config-row">
                        <SyvoraFormField label="Type" for="bu-shape-type">
                            <select id="bu-shape-type" v-model="buildupConfig.buildup_shape.type" class="native-select">
                                <option value="circle">Circle</option>
                                <option value="square">Square</option>
                                <option value="triangle">Triangle</option>
                            </select>
                        </SyvoraFormField>
                        <SyvoraFormField label="Color" for="bu-shape-color">
                            <input id="bu-shape-color" type="color" v-model="buildupConfig.buildup_shape.color" class="color-input" />
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Max Scale" for="bu-scale">
                            <input id="bu-scale" type="range" min="1" max="5" step="0.5"
                                v-model.number="buildupConfig.buildup_shape.max_scale" class="range-input" />
                            <span class="range-value">{{ buildupConfig.buildup_shape.max_scale }}x</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Duration" for="bu-dur">
                            <input id="bu-dur" type="range" min="2" max="30" step="1"
                                v-model.number="buildupConfig.buildup_shape.buildup_duration" class="range-input" />
                            <span class="range-value">{{ buildupConfig.buildup_shape.buildup_duration }}s</span>
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Stretch" for="bu-stretch">
                            <input id="bu-stretch" type="range" min="0" max="1" step="0.1"
                                v-model.number="buildupConfig.buildup_shape.stretch" class="range-input" />
                            <span class="range-value">{{ buildupConfig.buildup_shape.stretch }}</span>
                        </SyvoraFormField>
                    </div>
                </div>

                <div class="config-section">
                    <h3 class="config-section-title">Strobes</h3>
                    <div class="config-toggles">
                        <label class="toggle-item">
                            <input type="checkbox" v-model="buildupConfig.strobes.enabled" />
                            <span>Enable Strobes</span>
                        </label>
                    </div>
                    <div v-if="buildupConfig.strobes.enabled" class="config-row">
                        <SyvoraFormField label="Intensity" for="strobe-int">
                            <input id="strobe-int" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="buildupConfig.strobes.intensity" class="range-input" />
                            <span class="range-value">{{ buildupConfig.strobes.intensity }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Frequency" for="strobe-freq">
                            <input id="strobe-freq" type="range" min="0.1" max="2" step="0.1"
                                v-model.number="buildupConfig.strobes.frequency" class="range-input" />
                            <span class="range-value">{{ buildupConfig.strobes.frequency }}</span>
                        </SyvoraFormField>
                    </div>
                </div>
            </template>

            <!-- Text mode config -->
            <template v-if="modeType === 'text'">
                <div class="config-section">
                    <h3 class="config-section-title">Text</h3>
                    <SyvoraFormField label="Content" for="text-content">
                        <SyvoraInput id="text-content" v-model="textConfig.text.content" placeholder="SYVORA" />
                    </SyvoraFormField>
                    <div class="config-row">
                        <SyvoraFormField label="Color" for="text-color">
                            <input id="text-color" type="color" v-model="textConfig.text.color" class="color-input" />
                        </SyvoraFormField>
                        <SyvoraFormField label="Size" for="text-size">
                            <input id="text-size" type="range" min="0.2" max="1.5" step="0.1"
                                v-model.number="textConfig.text.size" class="range-input" />
                            <span class="range-value">{{ textConfig.text.size }}</span>
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Opacity" for="text-opacity">
                            <input id="text-opacity" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="textConfig.text.opacity" class="range-input" />
                            <span class="range-value">{{ textConfig.text.opacity }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Animation" for="text-anim">
                            <select id="text-anim" v-model="textConfig.text.animation" class="native-select">
                                <option value="none">None</option>
                                <option value="pulse">Pulse</option>
                                <option value="flicker">Flicker</option>
                                <option value="shimmer">Shimmer</option>
                            </select>
                        </SyvoraFormField>
                    </div>
                    <template v-if="textConfig.text.animation === 'shimmer'">
                        <div class="config-row">
                            <SyvoraFormField label="Shimmer Speed" for="shim-speed">
                                <input id="shim-speed" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="textConfig.text.shimmer_speed" class="range-input" />
                                <span class="range-value">{{ textConfig.text.shimmer_speed }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Wave Width" for="shim-width">
                                <input id="shim-width" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="textConfig.text.shimmer_width" class="range-input" />
                                <span class="range-value">{{ textConfig.text.shimmer_width }}</span>
                            </SyvoraFormField>
                        </div>
                        <div class="config-row">
                            <SyvoraFormField label="Intensity" for="shim-intensity">
                                <input id="shim-intensity" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="textConfig.text.shimmer_intensity" class="range-input" />
                                <span class="range-value">{{ textConfig.text.shimmer_intensity }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Color" for="shim-color">
                                <input id="shim-color" type="color" v-model="textConfig.text.shimmer_color" class="color-input" />
                            </SyvoraFormField>
                        </div>
                    </template>
                    <template v-if="textConfig.text.animation === 'flicker'">
                        <div class="config-row">
                            <SyvoraFormField label="Speed" for="flk-speed">
                                <input id="flk-speed" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="textConfig.text.flicker_speed" class="range-input" />
                                <span class="range-value">{{ textConfig.text.flicker_speed }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Smoothness" for="flk-smooth">
                                <input id="flk-smooth" type="range" min="0" max="1" step="0.1"
                                    v-model.number="textConfig.text.flicker_smoothness" class="range-input" />
                                <span class="range-value">{{ textConfig.text.flicker_smoothness }}</span>
                            </SyvoraFormField>
                        </div>
                        <div class="config-row">
                            <SyvoraFormField label="Intensity" for="flk-intensity">
                                <input id="flk-intensity" type="range" min="0.1" max="1" step="0.1"
                                    v-model.number="textConfig.text.flicker_intensity" class="range-input" />
                                <span class="range-value">{{ textConfig.text.flicker_intensity }}</span>
                            </SyvoraFormField>
                            <SyvoraFormField label="Color Shift" for="flk-color">
                                <input id="flk-color" type="range" min="0" max="1" step="0.1"
                                    v-model.number="textConfig.text.flicker_color_shift" class="range-input" />
                                <span class="range-value">{{ textConfig.text.flicker_color_shift }}</span>
                            </SyvoraFormField>
                        </div>
                    </template>
                </div>
            </template>

            <!-- Spotlights mode config -->
            <template v-if="modeType === 'spotlights'">
                <div class="config-section">
                    <h3 class="config-section-title">Background</h3>
                    <SyvoraFormField label="Color" for="spot-bg">
                        <input id="spot-bg" type="color" v-model="spotlightsConfig.background_color" class="color-input" />
                    </SyvoraFormField>
                </div>

                <div class="config-section">
                    <h3 class="config-section-title">Beams</h3>
                    <div class="config-row">
                        <SyvoraFormField label="Count" for="spot-count">
                            <input id="spot-count" type="range" min="1" max="12" step="1"
                                v-model.number="spotlightsConfig.beam_count" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.beam_count }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Width" for="spot-width">
                            <input id="spot-width" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="spotlightsConfig.beam_width" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.beam_width }}</span>
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Speed" for="spot-speed">
                            <input id="spot-speed" type="range" min="0.1" max="2" step="0.1"
                                v-model.number="spotlightsConfig.beam_speed" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.beam_speed }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Brightness" for="spot-bright">
                            <input id="spot-bright" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="spotlightsConfig.beam_brightness" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.beam_brightness }}</span>
                        </SyvoraFormField>
                    </div>
                    <div class="config-row">
                        <SyvoraFormField label="Spread" for="spot-spread">
                            <input id="spot-spread" type="range" min="0.1" max="1" step="0.1"
                                v-model.number="spotlightsConfig.beam_spread" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.beam_spread }}</span>
                        </SyvoraFormField>
                        <SyvoraFormField label="Haze" for="spot-haze">
                            <input id="spot-haze" type="range" min="0" max="1" step="0.1"
                                v-model.number="spotlightsConfig.haze" class="range-input" />
                            <span class="range-value">{{ spotlightsConfig.haze }}</span>
                        </SyvoraFormField>
                    </div>
                </div>

                <div class="config-section">
                    <h3 class="config-section-title">Beam Colors</h3>
                    <div class="color-list">
                        <div v-for="(color, i) in spotlightsConfig.beam_colors" :key="i" class="color-entry">
                            <input type="color" :value="color" @input="spotlightsConfig.beam_colors[Number(i)] = ($event.target as HTMLInputElement).value" class="color-input" />
                            <button v-if="spotlightsConfig.beam_colors.length > 1" class="icon-btn btn-danger" @click="spotlightsConfig.beam_colors.splice(Number(i), 1)">&times;</button>
                        </div>
                        <button class="add-color-btn" @click="spotlightsConfig.beam_colors.push('#ffffff')">+ Add Color</button>
                    </div>
                </div>
            </template>

            <p v-if="modeError" class="error-msg">{{ modeError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showModeModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingMode" :disabled="savingMode" @click="saveMode">
                {{ editingMode ? 'Save Changes' : 'Add Mode' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 1100px;
    margin: 0 auto;
}

.page-inner {
    max-width: 1100px;
    margin: 0 auto;
}

.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    gap: 1rem;
}

.page-title {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 0.25rem;
}

.page-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem 0;
}

.header-actions {
    display: flex;
    gap: 0.5rem;
}

.back-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 0.5rem;
}

.back-btn:hover {
    text-decoration: underline;
}

/* ── List ─────────────────────────────────────────────────────────────── */
.item-list {
    display: flex;
    flex-direction: column;
}

.item-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: background 0.15s;
}

.item-row:last-child {
    border-bottom: none;
}

.item-row:hover {
    background: rgba(115, 195, 254, 0.04);
}

.item-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(115, 195, 254, 0.1);
    border-radius: var(--radius-sm);
    color: var(--color-accent);
}

.item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.item-name {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-meta {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Modes & Preview layout ──────────────────────────────────────────── */
.modes-and-preview {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
}

.modes-list-card {
    align-self: start;
}

.modes-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.mode-item {
    padding: 0.75rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.15s, background 0.15s;
}

.mode-item:hover {
    background: rgba(115, 195, 254, 0.04);
}

.mode-item.active {
    border-color: var(--color-accent);
    background: rgba(115, 195, 254, 0.06);
}

.mode-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.mode-type-badge {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.5rem;
    border-radius: 0.375rem;
}

.badge-gradient {
    background: linear-gradient(135deg, #ff00aa33, #00aaff33);
    color: #c060ff;
}

.badge-gradient_aggressive {
    background: linear-gradient(135deg, #ff005533, #ff660033);
    color: #ff4444;
}

.badge-spotlights {
    background: rgba(12, 26, 39, 0.12);
    color: #4a6a8a;
}

.badge-buildup {
    background: rgba(255, 200, 0, 0.15);
    color: #d97706;
}

.badge-text {
    background: rgba(115, 195, 254, 0.15);
    color: var(--color-accent);
}

.mode-item-actions {
    display: flex;
    gap: 0.25rem;
}

.mode-preview-colors {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.5rem;
}

.color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.1);
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    color: var(--color-text-muted);
    transition: background 0.15s;
}

.icon-btn:hover {
    background: rgba(0, 0, 0, 0.05);
}

.icon-btn:disabled {
    opacity: 0.3;
    cursor: default;
}

/* ── Preview ─────────────────────────────────────────────────────────── */
.preview-area {
    border-radius: var(--radius-card);
    overflow: hidden;
    background: #000;
    aspect-ratio: 16 / 9;
}

.preview-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

/* ── Detail meta ─────────────────────────────────────────────────────── */
.detail-meta {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    padding-top: 0.5rem;
}

/* ── Fullscreen ──────────────────────────────────────────────────────── */
.fullscreen-target {
    display: none;
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 10000;
}

.fullscreen-target.active,
.fullscreen-target:fullscreen {
    display: block;
}

.fullscreen-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

.fullscreen-controls {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem 1rem;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(12px);
    transition: opacity 0.3s, transform 0.3s;
    z-index: 10001;
}

.fullscreen-controls.hidden {
    opacity: 0;
    transform: translateY(100%);
    pointer-events: none;
}

.fs-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.fs-mode-buttons {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
}

.fs-mode-btn {
    padding: 0.4rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--radius-btn);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fs-mode-btn:hover {
    background: rgba(255, 255, 255, 0.15);
}

.fs-mode-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
}

.fs-mode-key {
    font-size: 0.625rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.2);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    line-height: 1;
}

.fs-exit-btn {
    padding: 0.4rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--radius-btn);
    background: rgba(255, 50, 50, 0.2);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
}

.fs-exit-btn:hover {
    background: rgba(255, 50, 50, 0.4);
}

/* ── Live performance controls ───────────────────────────────────── */
.fs-live-row {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.fs-live-group {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fs-live-btn {
    padding: 0.4rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-btn);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
    user-select: none;
}

.fs-live-btn:hover {
    background: rgba(255, 255, 255, 0.14);
}

.fs-live-btn:active {
    background: rgba(255, 255, 255, 0.25);
}

.fs-btn-buildup {
    border-color: rgba(255, 200, 0, 0.4);
    color: #ffcc00;
}

.fs-btn-buildup:hover {
    background: rgba(255, 200, 0, 0.15);
}

.fs-btn-buildup:active {
    background: rgba(255, 200, 0, 0.35);
}

.fs-btn-drop {
    border-color: rgba(255, 80, 80, 0.4);
    color: #ff6666;
}

.fs-btn-drop:hover {
    background: rgba(255, 80, 80, 0.15);
}

.fs-key-hint {
    font-size: 0.5625rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.15);
    padding: 0.1rem 0.25rem;
    border-radius: 0.15rem;
    line-height: 1;
    text-transform: uppercase;
}

.fs-intensity-group {
    gap: 0.5rem;
}

.fs-live-label {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.fs-intensity-slider {
    width: 100px;
    accent-color: var(--color-accent);
    cursor: pointer;
}

.fs-live-value {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.7);
    font-variant-numeric: tabular-nums;
    min-width: 2.5rem;
}

.fs-buildup-bar-wrap {
    flex: 1;
    min-width: 80px;
    height: 20px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 0.25rem;
    position: relative;
    overflow: hidden;
}

.fs-buildup-bar {
    position: absolute;
    inset: 0;
    right: auto;
    background: linear-gradient(90deg, rgba(255, 200, 0, 0.3), rgba(255, 80, 80, 0.6));
    border-radius: 0.25rem;
    transition: width 0.08s linear;
}

.fs-buildup-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.625rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* ── Mode editor modal ───────────────────────────────────────────────── */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.mode-editor {
    max-height: 65vh;
    overflow-y: auto;
}

.config-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border-subtle);
}

.config-section-title {
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin: 0;
}

.config-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
}

.color-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
}

.color-entry {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.color-input {
    width: 40px;
    height: 34px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: 0.375rem;
    cursor: pointer;
    background: transparent;
}

.add-color-btn {
    background: none;
    border: 1px dashed var(--color-text-muted);
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    cursor: pointer;
}

.add-color-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
}

.range-input {
    width: 100%;
    accent-color: var(--color-accent);
}

.range-sm {
    width: 100px;
}

.range-value {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-align: right;
}

.config-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
}

.toggle-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
}

.toggle-item input[type="checkbox"] {
    accent-color: var(--color-accent);
    cursor: pointer;
}

.native-select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
}

.native-select:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
}

:deep(.btn-danger) {
    color: var(--color-error);
}

.empty-modes {
    margin-bottom: 1.5rem;
}

/* ── Mobile ──────────────────────────────────────────────────────────── */
.mobile .page-header {
    flex-wrap: wrap;
}

.mobile .page-title {
    font-size: 1.375rem;
}

.mobile .modes-and-preview {
    grid-template-columns: 1fr;
}

.mobile .item-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
}

.mobile .item-actions {
    width: 100%;
}

.mobile .header-actions {
    width: 100%;
    justify-content: flex-end;
}

.mobile .config-row {
    grid-template-columns: 1fr;
}
</style>
