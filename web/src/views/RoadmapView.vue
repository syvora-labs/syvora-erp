<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
    useRoadmap,
    type Roadmap, type RoadmapCategory, type RoadmapItem, type SystemEntity,
} from '../composables/useRoadmap'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, useIsMobile,
} from '@syvora/ui'

const isMobile = useIsMobile()

const {
    roadmaps, loading, fetchRoadmaps,
    createRoadmap, updateRoadmap, deleteRoadmap,
    fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
    fetchItems, createItem, updateItem, deleteItem,
    fetchSystemEntities,
} = useRoadmap()

// ── Roadmap CRUD modal ──────────────────────────────────────────────────────
const showModal = ref(false)
const editingRoadmap = ref<Roadmap | null>(null)
const saving = ref(false)
const error = ref('')
const form = ref({ title: '', description: '', start_date: '', end_date: '' })

// ── Detail view ─────────────────────────────────────────────────────────────
const selectedRoadmap = ref<Roadmap | null>(null)
const categories = ref<RoadmapCategory[]>([])
const items = ref<RoadmapItem[]>([])

// ── Category modal ──────────────────────────────────────────────────────────
const showCategoryModal = ref(false)
const editingCategory = ref<RoadmapCategory | null>(null)
const categoryForm = ref({ name: '', color: '#73c3fe' })
const savingCategory = ref(false)
const categoryError = ref('')

// ── Item modal ──────────────────────────────────────────────────────────────
const showItemModal = ref(false)
const editingItem = ref<RoadmapItem | null>(null)
const itemMode = ref<'custom' | 'system'>('custom')
const itemForm = ref({ title: '', description: '', start_date: '', end_date: '', color: '#73c3fe', category_id: '' })
const selectedSystemEntity = ref('')
const systemEntities = ref<SystemEntity[]>([])
const savingItem = ref(false)
const itemError = ref('')

// ── Popover state ───────────────────────────────────────────────────────────
const hoveredItem = ref<RoadmapItem | null>(null)
const popoverStyle = ref<Record<string, string>>({})
let popoverTimeout: ReturnType<typeof setTimeout> | null = null

function onBarEnter(e: MouseEvent, item: RoadmapItem) {
    if (draggingItem.value) return
    const el = e.currentTarget as HTMLElement
    popoverTimeout = setTimeout(() => {
        hoveredItem.value = item
        const rect = el.getBoundingClientRect()
        const spaceAbove = rect.top
        if (spaceAbove > 160) {
            popoverStyle.value = {
                left: `${rect.left}px`,
                top: `${rect.top - 8}px`,
                transform: 'translateY(-100%)',
            }
        } else {
            popoverStyle.value = {
                left: `${rect.left}px`,
                top: `${rect.bottom + 8}px`,
                transform: 'none',
            }
        }
    }, 300)
}

function onBarLeave() {
    if (popoverTimeout) { clearTimeout(popoverTimeout); popoverTimeout = null }
    hoveredItem.value = null
}

// ── Drag state ──────────────────────────────────────────────────────────────
const draggingItem = ref<RoadmapItem | null>(null)
const dragStartX = ref(0)
const dragMode = ref<'move' | 'resize-left' | 'resize-right'>('move')
const dragOrigStart = ref('')
const dragOrigEnd = ref('')

onMounted(async () => {
    await fetchRoadmaps()
})

// ── Timeline helpers ────────────────────────────────────────────────────────
function getMonths(roadmap: Roadmap): { key: string; label: string; date: Date }[] {
    const months: { key: string; label: string; date: Date }[] = []
    const start = new Date(roadmap.start_date + 'T00:00:00')
    const end = new Date(roadmap.end_date + 'T00:00:00')
    const current = new Date(start.getFullYear(), start.getMonth(), 1)
    while (current <= end) {
        months.push({
            key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
            label: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            date: new Date(current),
        })
        current.setMonth(current.getMonth() + 1)
    }
    return months
}

const months = computed(() => selectedRoadmap.value ? getMonths(selectedRoadmap.value) : [])

const MONTH_WIDTH = 120

function getBarStyle(item: RoadmapItem) {
    if (!selectedRoadmap.value || months.value.length === 0) return {}
    const timelineStart = months.value[0]!.date.getTime()
    const lastMonth = months.value[months.value.length - 1]!.date
    const timelineEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getTime()
    const totalDuration = timelineEnd - timelineStart

    const itemStart = new Date(item.start_date + 'T00:00:00').getTime()
    const itemEnd = new Date(item.end_date + 'T00:00:00').getTime()

    const totalWidth = months.value.length * MONTH_WIDTH
    const left = Math.max(0, ((itemStart - timelineStart) / totalDuration) * totalWidth)
    const right = Math.min(totalWidth, ((itemEnd - timelineStart) / totalDuration) * totalWidth)
    const width = Math.max(right - left, 80)

    return {
        left: `${left}px`,
        width: `${width}px`,
        top: `${getBarTop(item)}px`,
        height: `${BAR_HEIGHT}px`,
        background: item.color || '#73c3fe',
    }
}

function getTodayPosition(): number | null {
    if (!selectedRoadmap.value || months.value.length === 0) return null
    const today = new Date()
    const timelineStart = months.value[0]!.date.getTime()
    const lastMonth = months.value[months.value.length - 1]!.date
    const timelineEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getTime()
    const todayTime = today.getTime()
    if (todayTime < timelineStart || todayTime > timelineEnd) return null
    const totalWidth = months.value.length * MONTH_WIDTH
    return ((todayTime - timelineStart) / (timelineEnd - timelineStart)) * totalWidth
}

const todayLeft = computed(() => getTodayPosition())

function categoryItems(categoryId: string): RoadmapItem[] {
    return items.value.filter(i => i.category_id === categoryId)
}

function getCategoryName(categoryId: string): string {
    return categories.value.find(c => c.id === categoryId)?.name ?? '—'
}

// ── Lane computation for overlapping bars ────────────────────────────────────
const BAR_HEIGHT = 32
const BAR_GAP = 4
const ROW_PADDING = 8

interface LaneAssignment {
    [itemId: string]: number
}

function computeLanes(catItems: RoadmapItem[]): LaneAssignment {
    const sorted = [...catItems].sort((a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )
    const lanes: { end: number }[] = []
    const assignment: LaneAssignment = {}
    for (const item of sorted) {
        const start = new Date(item.start_date + 'T00:00:00').getTime()
        let placed = false
        for (let i = 0; i < lanes.length; i++) {
            if (start >= lanes[i]!.end) {
                lanes[i]!.end = new Date(item.end_date + 'T00:00:00').getTime() + 86400000
                assignment[item.id] = i
                placed = true
                break
            }
        }
        if (!placed) {
            assignment[item.id] = lanes.length
            lanes.push({ end: new Date(item.end_date + 'T00:00:00').getTime() + 86400000 })
        }
    }
    return assignment
}

const laneData = computed(() => {
    const result: Record<string, { lanes: LaneAssignment; count: number }> = {}
    for (const cat of categories.value) {
        const catItems = categoryItems(cat.id)
        const lanes = computeLanes(catItems)
        const count = Math.max(1, ...Object.values(lanes).map(l => l + 1), 1)
        result[cat.id] = { lanes, count }
    }
    return result
})

function getRowHeight(categoryId: string): number {
    const data = laneData.value[categoryId]
    if (!data) return ROW_PADDING * 2 + BAR_HEIGHT
    return ROW_PADDING * 2 + data.count * (BAR_HEIGHT + BAR_GAP) - BAR_GAP
}

function getBarTop(item: RoadmapItem): number {
    const data = laneData.value[item.category_id]
    const lane = data?.lanes[item.id] ?? 0
    return ROW_PADDING + lane * (BAR_HEIGHT + BAR_GAP)
}

// ── Roadmap CRUD ────────────────────────────────────────────────────────────
function openCreate() {
    editingRoadmap.value = null
    const now = new Date()
    const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 1)
    const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`
    form.value = { title: '', description: '', start_date: startMonth, end_date: endMonth }
    error.value = ''
    showModal.value = true
}

function openEdit(roadmap: Roadmap) {
    editingRoadmap.value = roadmap
    form.value = {
        title: roadmap.title,
        description: roadmap.description ?? '',
        start_date: roadmap.start_date,
        end_date: roadmap.end_date,
    }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingRoadmap.value = null
}

async function saveRoadmap() {
    if (!form.value.title.trim()) { error.value = 'Title is required.'; return }
    if (!form.value.start_date) { error.value = 'Start date is required.'; return }
    if (!form.value.end_date) { error.value = 'End date is required.'; return }
    if (form.value.end_date <= form.value.start_date) { error.value = 'End date must be after start date.'; return }
    saving.value = true
    error.value = ''
    try {
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description.trim() || null,
            start_date: form.value.start_date,
            end_date: form.value.end_date,
        }
        if (editingRoadmap.value) {
            await updateRoadmap(editingRoadmap.value.id, payload)
            if (selectedRoadmap.value?.id === editingRoadmap.value.id) {
                selectedRoadmap.value = roadmaps.value.find(r => r.id === editingRoadmap.value!.id) ?? null
            }
        } else {
            await createRoadmap(payload)
        }
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save roadmap.'
    } finally {
        saving.value = false
    }
}

async function handleDelete(roadmap: Roadmap) {
    if (!confirm(`Delete "${roadmap.title}"? This will delete all categories and items. This cannot be undone.`)) return
    try {
        await deleteRoadmap(roadmap.id)
        if (selectedRoadmap.value?.id === roadmap.id) selectedRoadmap.value = null
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete roadmap.')
    }
}

// ── Detail ──────────────────────────────────────────────────────────────────
async function openDetail(roadmap: Roadmap) {
    selectedRoadmap.value = roadmap
    await loadRoadmapData(roadmap.id)
}

function closeDetail() {
    selectedRoadmap.value = null
}

async function loadRoadmapData(roadmapId: string) {
    const [cats, itms] = await Promise.all([
        fetchCategories(roadmapId),
        fetchItems(roadmapId),
    ])
    categories.value = cats
    items.value = itms
}

// ── Categories ──────────────────────────────────────────────────────────────
function openCreateCategory() {
    editingCategory.value = null
    categoryForm.value = { name: '', color: '#73c3fe' }
    categoryError.value = ''
    showCategoryModal.value = true
}

function openEditCategory(cat: RoadmapCategory) {
    editingCategory.value = cat
    categoryForm.value = { name: cat.name, color: cat.color || '#73c3fe' }
    categoryError.value = ''
    showCategoryModal.value = true
}

async function saveCategory() {
    if (!categoryForm.value.name.trim()) { categoryError.value = 'Name is required.'; return }
    if (!selectedRoadmap.value) return
    savingCategory.value = true
    categoryError.value = ''
    try {
        if (editingCategory.value) {
            await updateCategory(editingCategory.value.id, {
                name: categoryForm.value.name.trim(),
                color: categoryForm.value.color || null,
            })
        } else {
            await createCategory(selectedRoadmap.value.id, {
                name: categoryForm.value.name.trim(),
                color: categoryForm.value.color || null,
                sort_order: categories.value.length,
            })
        }
        await loadRoadmapData(selectedRoadmap.value.id)
        showCategoryModal.value = false
    } catch (e: any) {
        categoryError.value = e.message ?? 'Failed to save category.'
    } finally {
        savingCategory.value = false
    }
}

async function handleDeleteCategory(cat: RoadmapCategory) {
    if (!confirm(`Delete category "${cat.name}" and all its items?`)) return
    if (!selectedRoadmap.value) return
    try {
        await deleteCategory(cat.id)
        await loadRoadmapData(selectedRoadmap.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete category.')
    }
}

async function moveCategoryUp(index: number) {
    if (index <= 0 || !selectedRoadmap.value) return
    const newOrder = [...categories.value]
    ;[newOrder[index - 1], newOrder[index]] = [newOrder[index]!, newOrder[index - 1]!]
    const orderedIds = newOrder.map(c => c.id)
    await reorderCategories(selectedRoadmap.value.id, orderedIds)
    await loadRoadmapData(selectedRoadmap.value.id)
}

async function moveCategoryDown(index: number) {
    if (index >= categories.value.length - 1 || !selectedRoadmap.value) return
    const newOrder = [...categories.value]
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1]!, newOrder[index]!]
    const orderedIds = newOrder.map(c => c.id)
    await reorderCategories(selectedRoadmap.value.id, orderedIds)
    await loadRoadmapData(selectedRoadmap.value.id)
}

// ── Items ───────────────────────────────────────────────────────────────────
async function openCreateItem(categoryId: string, monthDate?: Date) {
    editingItem.value = null
    itemMode.value = 'custom'
    selectedSystemEntity.value = ''
    const startDate = monthDate
        ? toDateStr(monthDate)
        : (selectedRoadmap.value?.start_date ?? '')
    const endDate = monthDate
        ? toDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0))
        : (selectedRoadmap.value?.start_date ?? '')
    itemForm.value = {
        title: '',
        description: '',
        start_date: startDate,
        end_date: endDate,
        color: '#73c3fe',
        category_id: categoryId,
    }
    itemError.value = ''
    // Pre-fetch system entities so the list is ready if user switches mode
    if (systemEntities.value.length === 0) {
        systemEntities.value = await fetchSystemEntities()
    }
    showItemModal.value = true
}

function openEditItem(item: RoadmapItem) {
    editingItem.value = item
    itemMode.value = (item.linked_event_id || item.linked_release_id) ? 'system' : 'custom'
    selectedSystemEntity.value = item.linked_event_id
        ? `event:${item.linked_event_id}`
        : item.linked_release_id
            ? `release:${item.linked_release_id}`
            : ''
    itemForm.value = {
        title: item.title,
        description: item.description ?? '',
        start_date: item.start_date,
        end_date: item.end_date,
        color: item.color || '#73c3fe',
        category_id: item.category_id,
    }
    itemError.value = ''
    showItemModal.value = true
}

function onSystemEntityChange() {
    if (!selectedSystemEntity.value) return
    const [type, id] = selectedSystemEntity.value.split(':')
    const entity = systemEntities.value.find(e => e.id === id && e.type === type)
    if (!entity) return
    itemForm.value.title = entity.title
    if (entity.date) {
        const d = new Date(entity.date)
        if (!isNaN(d.getTime())) {
            itemForm.value.start_date = toDateStr(d)
            itemForm.value.end_date = toDateStr(d)
        }
    }
}

async function saveItem() {
    if (!itemForm.value.title.trim()) { itemError.value = 'Title is required.'; return }
    if (!itemForm.value.start_date) { itemError.value = 'Start date is required.'; return }
    if (!itemForm.value.end_date) { itemError.value = 'End date is required.'; return }
    if (itemForm.value.end_date < itemForm.value.start_date) { itemError.value = 'End date must be on or after start date.'; return }
    if (!itemForm.value.category_id) { itemError.value = 'Category is required.'; return }
    if (!selectedRoadmap.value) return
    savingItem.value = true
    itemError.value = ''
    try {
        let linkedEventId: string | null = null
        let linkedReleaseId: string | null = null
        if (itemMode.value === 'system' && selectedSystemEntity.value) {
            const [type, id] = selectedSystemEntity.value.split(':')
            if (type === 'event') linkedEventId = id ?? null
            else if (type === 'release') linkedReleaseId = id ?? null
        }
        const payload = {
            title: itemForm.value.title.trim(),
            description: itemForm.value.description.trim() || null,
            start_date: itemForm.value.start_date,
            end_date: itemForm.value.end_date,
            color: itemForm.value.color || null,
            linked_event_id: linkedEventId,
            linked_release_id: linkedReleaseId,
        }
        if (editingItem.value) {
            await updateItem(editingItem.value.id, {
                ...payload,
                category_id: itemForm.value.category_id,
            })
        } else {
            await createItem(itemForm.value.category_id, payload)
        }
        await loadRoadmapData(selectedRoadmap.value.id)
        showItemModal.value = false
    } catch (e: any) {
        itemError.value = e.message ?? 'Failed to save item.'
    } finally {
        savingItem.value = false
    }
}

async function handleDeleteItem(item: RoadmapItem) {
    if (!confirm(`Delete "${item.title}"?`)) return
    if (!selectedRoadmap.value) return
    try {
        await deleteItem(item.id)
        await loadRoadmapData(selectedRoadmap.value.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete item.')
    }
}

// ── Drag to resize/move ─────────────────────────────────────────────────────
function onBarMouseDown(e: MouseEvent, item: RoadmapItem, mode: 'move' | 'resize-left' | 'resize-right') {
    e.preventDefault()
    e.stopPropagation()
    hoveredItem.value = null
    if (popoverTimeout) { clearTimeout(popoverTimeout); popoverTimeout = null }
    draggingItem.value = item
    dragStartX.value = e.clientX
    dragMode.value = mode
    dragOrigStart.value = item.start_date
    dragOrigEnd.value = item.end_date
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
    if (!draggingItem.value || !selectedRoadmap.value || months.value.length === 0) return
    const dx = e.clientX - dragStartX.value
    const totalWidth = months.value.length * MONTH_WIDTH
    const timelineStart = months.value[0]!.date.getTime()
    const lastMonth = months.value[months.value.length - 1]!.date
    const timelineEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getTime()
    const totalDuration = timelineEnd - timelineStart
    const daysDelta = Math.round((dx / totalWidth) * totalDuration / (1000 * 60 * 60 * 24))

    const origStart = new Date(dragOrigStart.value + 'T00:00:00')
    const origEnd = new Date(dragOrigEnd.value + 'T00:00:00')

    if (dragMode.value === 'move') {
        const newStart = new Date(origStart.getTime() + daysDelta * 86400000)
        const newEnd = new Date(origEnd.getTime() + daysDelta * 86400000)
        draggingItem.value.start_date = toDateStr(newStart)
        draggingItem.value.end_date = toDateStr(newEnd)
    } else if (dragMode.value === 'resize-left') {
        const newStart = new Date(origStart.getTime() + daysDelta * 86400000)
        if (newStart <= origEnd) {
            draggingItem.value.start_date = toDateStr(newStart)
        }
    } else if (dragMode.value === 'resize-right') {
        const newEnd = new Date(origEnd.getTime() + daysDelta * 86400000)
        if (newEnd >= origStart) {
            draggingItem.value.end_date = toDateStr(newEnd)
        }
    }
}

async function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
    if (!draggingItem.value || !selectedRoadmap.value) return
    const item = draggingItem.value
    const changed = item.start_date !== dragOrigStart.value || item.end_date !== dragOrigEnd.value
    if (changed) {
        try {
            await updateItem(item.id, { start_date: item.start_date, end_date: item.end_date })
            await loadRoadmapData(selectedRoadmap.value.id)
        } catch (e: any) {
            item.start_date = dragOrigStart.value
            item.end_date = dragOrigEnd.value
            alert(e.message ?? 'Failed to update item.')
        }
    }
    draggingItem.value = null
}

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateRange(start: string, end: string) {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    const sm = s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const em = e.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `${sm} — ${em}`
}
</script>

<template>
    <div class="page" :class="{ mobile: isMobile }">
        <!-- ── Roadmap list ──────────────────────────────────────────────── -->
        <template v-if="!selectedRoadmap">
            <div class="page-inner">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Roadmap</h1>
                    <p class="page-subtitle">Plan and visualise timelines with horizontal bar charts</p>
                </div>
                <SyvoraButton @click="openCreate">+ New Roadmap</SyvoraButton>
            </div>

            <div v-if="loading" class="loading-text">Loading roadmaps...</div>

            <SyvoraEmptyState v-else-if="roadmaps.length === 0" title="No roadmaps yet"
                description="Create your first roadmap to start planning." />

            <SyvoraCard v-else>
                <div class="roadmap-list">
                    <div v-for="roadmap in roadmaps" :key="roadmap.id" class="roadmap-row">
                        <div class="roadmap-avatar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="4" y1="9" x2="20" y2="9" />
                                <line x1="4" y1="15" x2="14" y2="15" />
                                <line x1="8" y1="5" x2="18" y2="5" />
                            </svg>
                        </div>
                        <div class="roadmap-info" @click="openDetail(roadmap)" style="cursor: pointer;">
                            <span class="roadmap-name">{{ roadmap.title }}</span>
                            <div class="roadmap-details">
                                <span class="roadmap-detail">{{ formatDateRange(roadmap.start_date, roadmap.end_date) }}</span>
                                <span v-if="roadmap.description" class="roadmap-detail">{{ roadmap.description }}</span>
                            </div>
                        </div>
                        <div class="roadmap-row-end">
                            <div class="roadmap-meta">
                                <span>Created by {{ roadmap.creator_name ?? 'Unknown' }} · {{ formatDate(roadmap.created_at) }}</span>
                            </div>
                            <div class="roadmap-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openDetail(roadmap)">Open</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(roadmap)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(roadmap)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
            </div>
        </template>

        <!-- ── Roadmap detail / timeline view ────────────────────────────── -->
        <template v-else>
            <div class="page-header">
                <div>
                    <button class="back-btn" @click="closeDetail">&larr; Back to roadmaps</button>
                    <h1 class="page-title">{{ selectedRoadmap.title }}</h1>
                    <p class="page-subtitle">
                        {{ formatDateRange(selectedRoadmap.start_date, selectedRoadmap.end_date) }}
                        <span v-if="selectedRoadmap.description"> &mdash; {{ selectedRoadmap.description }}</span>
                    </p>
                </div>
                <div class="header-actions">
                    <SyvoraButton variant="ghost" size="sm" @click="openEdit(selectedRoadmap)">Edit Roadmap</SyvoraButton>
                </div>
            </div>

            <!-- Timeline -->
            <div class="timeline-wrapper">
                <div class="timeline-container">
                    <!-- Category labels column -->
                    <div class="timeline-sidebar">
                        <div class="timeline-sidebar-header">Categories</div>
                        <div v-for="(cat, idx) in categories" :key="cat.id" class="timeline-sidebar-row" :style="{ height: getRowHeight(cat.id) + 'px' }">
                            <div class="category-color" :style="{ background: cat.color || '#73c3fe' }"></div>
                            <span class="category-name">{{ cat.name }}</span>
                            <div class="category-actions">
                                <button class="icon-btn" @click="moveCategoryUp(idx)" :disabled="idx === 0" title="Move up">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                                </button>
                                <button class="icon-btn" @click="moveCategoryDown(idx)" :disabled="idx === categories.length - 1" title="Move down">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                                <button class="icon-btn" @click="openEditCategory(cat)" title="Edit">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="icon-btn btn-danger" @click="handleDeleteCategory(cat)" title="Delete">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                        <button class="add-category-btn" @click="openCreateCategory">+ Add Category</button>
                    </div>

                    <!-- Timeline grid -->
                    <div class="timeline-grid" :style="{ width: months.length * MONTH_WIDTH + 'px' }">
                        <!-- Month headers -->
                        <div class="timeline-header">
                            <div v-for="m in months" :key="m.key" class="month-header" :style="{ width: MONTH_WIDTH + 'px' }">
                                {{ m.label }}
                            </div>
                        </div>

                        <!-- Category rows with items -->
                        <div v-for="cat in categories" :key="cat.id" class="timeline-row" :style="{ height: getRowHeight(cat.id) + 'px' }">
                            <!-- Grid lines -->
                            <div v-for="m in months" :key="m.key" class="month-cell" :style="{ width: MONTH_WIDTH + 'px' }"
                                @click="openCreateItem(cat.id, m.date)">
                                <span class="month-cell-add">+</span>
                            </div>

                            <!-- Item bars -->
                            <div v-for="item in categoryItems(cat.id)" :key="item.id"
                                class="timeline-bar"
                                :style="getBarStyle(item)"
                                @click.stop="openEditItem(item)"
                                @mousedown="onBarMouseDown($event, item, 'move')"
                                @mouseenter="onBarEnter($event, item)"
                                @mouseleave="onBarLeave">
                                <div class="bar-handle bar-handle-left" @mousedown.stop="onBarMouseDown($event, item, 'resize-left')"></div>
                                <span class="bar-label">
                                    <span v-if="item.linked_event_id" class="bar-type-badge">E</span>
                                    <span v-else-if="item.linked_release_id" class="bar-type-badge">R</span>
                                    {{ item.title }}
                                </span>
                                <div class="bar-handle bar-handle-right" @mousedown.stop="onBarMouseDown($event, item, 'resize-right')"></div>
                            </div>

                            <!-- Today marker -->
                            <div v-if="todayLeft !== null" class="today-line" :style="{ left: todayLeft + 'px' }"></div>
                        </div>

                        <!-- Empty state for no categories -->
                        <div v-if="categories.length === 0" class="timeline-empty">
                            Add categories to start building your timeline
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>

    <!-- ── Create/Edit Roadmap Modal ─────────────────────────────────────── -->
    <SyvoraModal v-if="showModal" :title="editingRoadmap ? 'Edit Roadmap' : 'New Roadmap'" size="sm" @close="closeModal">
        <div class="modal-form">
            <SyvoraFormField label="Title" for="rm-title">
                <SyvoraInput id="rm-title" v-model="form.title" placeholder="Roadmap title" />
            </SyvoraFormField>
            <SyvoraFormField label="Description" for="rm-desc">
                <SyvoraInput id="rm-desc" v-model="form.description" placeholder="Optional description" />
            </SyvoraFormField>
            <SyvoraFormField label="Start Month" for="rm-start">
                <input id="rm-start" type="date" v-model="form.start_date" class="native-input" />
            </SyvoraFormField>
            <SyvoraFormField label="End Month" for="rm-end">
                <input id="rm-end" type="date" v-model="form.end_date" class="native-input" />
            </SyvoraFormField>
            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" :disabled="saving" @click="saveRoadmap">
                {{ editingRoadmap ? 'Save Changes' : 'Create Roadmap' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Category Modal ────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showCategoryModal" :title="editingCategory ? 'Edit Category' : 'Add Category'" size="sm" @close="showCategoryModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Name" for="cat-name">
                <SyvoraInput id="cat-name" v-model="categoryForm.name" placeholder="Category name" />
            </SyvoraFormField>
            <SyvoraFormField label="Color" for="cat-color">
                <div class="color-field">
                    <input id="cat-color" type="color" v-model="categoryForm.color" class="color-picker" />
                    <span class="color-value">{{ categoryForm.color }}</span>
                </div>
            </SyvoraFormField>
            <p v-if="categoryError" class="error-msg">{{ categoryError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showCategoryModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingCategory" :disabled="savingCategory" @click="saveCategory">
                {{ editingCategory ? 'Save Changes' : 'Add Category' }}
            </SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Item Modal ────────────────────────────────────────────────────── -->
    <SyvoraModal v-if="showItemModal" :title="editingItem ? 'Edit Item' : 'Add Item'" size="sm" @close="showItemModal = false">
        <div class="modal-form">
            <!-- Mode toggle (only for new items) -->
            <div v-if="!editingItem" class="mode-toggle">
                <button class="mode-btn" :class="{ active: itemMode === 'custom' }" @click="itemMode = 'custom'">Custom</button>
                <button class="mode-btn" :class="{ active: itemMode === 'system' }" @click="itemMode = 'system'">From System</button>
            </div>

            <!-- System entity picker -->
            <template v-if="itemMode === 'system'">
                <SyvoraFormField label="Event or Release" for="item-entity">
                    <select id="item-entity" v-model="selectedSystemEntity" class="native-select" @change="onSystemEntityChange">
                        <option value="" disabled>Select an event or release...</option>
                        <optgroup label="Events">
                            <option v-for="e in systemEntities.filter(s => s.type === 'event')" :key="e.id" :value="'event:' + e.id">
                                {{ e.title }}{{ e.date ? ' — ' + formatDate(e.date) : '' }}
                            </option>
                        </optgroup>
                        <optgroup label="Releases">
                            <option v-for="r in systemEntities.filter(s => s.type === 'release')" :key="r.id" :value="'release:' + r.id">
                                {{ r.title }}{{ r.date ? ' — ' + formatDate(r.date) : '' }}
                            </option>
                        </optgroup>
                    </select>
                </SyvoraFormField>
            </template>

            <SyvoraFormField label="Title" for="item-title">
                <SyvoraInput id="item-title" v-model="itemForm.title" placeholder="Item title" />
            </SyvoraFormField>
            <SyvoraFormField label="Description" for="item-desc">
                <SyvoraInput id="item-desc" v-model="itemForm.description" placeholder="Optional description" />
            </SyvoraFormField>
            <SyvoraFormField label="Category" for="item-cat">
                <select id="item-cat" v-model="itemForm.category_id" class="native-select">
                    <option value="" disabled>Select a category...</option>
                    <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                </select>
            </SyvoraFormField>
            <SyvoraFormField label="Start Date" for="item-start">
                <input id="item-start" type="date" v-model="itemForm.start_date" class="native-input" />
            </SyvoraFormField>
            <SyvoraFormField label="End Date" for="item-end">
                <input id="item-end" type="date" v-model="itemForm.end_date" class="native-input" />
            </SyvoraFormField>
            <SyvoraFormField label="Color" for="item-color">
                <div class="color-field">
                    <input id="item-color" type="color" v-model="itemForm.color" class="color-picker" />
                    <span class="color-value">{{ itemForm.color }}</span>
                </div>
            </SyvoraFormField>
            <p v-if="itemError" class="error-msg">{{ itemError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showItemModal = false">Cancel</SyvoraButton>
            <div v-if="editingItem" style="display: flex; gap: 0.5rem;">
                <SyvoraButton variant="ghost" class="btn-danger" @click="handleDeleteItem(editingItem!)">Delete</SyvoraButton>
                <SyvoraButton :loading="savingItem" :disabled="savingItem" @click="saveItem">Save Changes</SyvoraButton>
            </div>
            <SyvoraButton v-else :loading="savingItem" :disabled="savingItem" @click="saveItem">Add Item</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ── Item hover popover (teleported to body to avoid overflow clipping) ── -->
    <Teleport to="body">
        <div v-if="hoveredItem" class="bar-popover" :style="popoverStyle">
            <div class="bar-popover-title">{{ hoveredItem.title }}</div>
            <div class="bar-popover-row">
                <span class="bar-popover-label">Date</span>
                <span>{{ formatDate(hoveredItem.start_date) }} — {{ formatDate(hoveredItem.end_date) }}</span>
            </div>
            <div class="bar-popover-row">
                <span class="bar-popover-label">Category</span>
                <span>{{ getCategoryName(hoveredItem.category_id) }}</span>
            </div>
            <div v-if="hoveredItem.description" class="bar-popover-row">
                <span class="bar-popover-label">Note</span>
                <span class="bar-popover-desc">{{ hoveredItem.description }}</span>
            </div>
            <div v-if="hoveredItem.linked_event_id" class="bar-popover-badge">Event</div>
            <div v-else-if="hoveredItem.linked_release_id" class="bar-popover-badge">Release</div>
        </div>
    </Teleport>
</template>

<style scoped>
.page {
    max-width: 100%;
    margin: 0 auto;
}

.page-inner {
    max-width: 960px;
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

.back-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 0.5rem;
    display: inline-block;
}

.back-btn:hover {
    text-decoration: underline;
}

.header-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
}

/* ── Roadmap list ──────────────────────────────────────────────────────── */
.roadmap-list {
    display: flex;
    flex-direction: column;
}

.roadmap-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.roadmap-row:last-child {
    border-bottom: none;
}

.roadmap-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.roadmap-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.roadmap-name {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.roadmap-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.roadmap-detail {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.roadmap-detail+.roadmap-detail::before {
    content: '\00b7';
    margin-right: 0.5rem;
}

.roadmap-row-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.roadmap-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
}

.roadmap-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* ── Timeline ──────────────────────────────────────────────────────────── */
.timeline-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
}

.timeline-container {
    display: flex;
    min-width: fit-content;
}

.timeline-sidebar {
    width: 200px;
    min-width: 200px;
    border-right: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
}

.timeline-sidebar-header {
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-subtle);
}

.timeline-sidebar-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
}

.timeline-sidebar-row:last-of-type {
    border-bottom: 1px solid var(--color-border-subtle);
}

.category-color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.category-name {
    font-size: 0.8125rem;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.category-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
}

.timeline-sidebar-row:hover .category-actions {
    opacity: 1;
}

.icon-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon-btn:hover {
    color: var(--color-text);
    background: rgba(115, 195, 254, 0.1);
}

.icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.icon-btn.btn-danger:hover {
    color: var(--color-error, #f87171);
    background: rgba(248, 113, 113, 0.1);
}

.add-category-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0.75rem;
    width: 100%;
    text-align: left;
}

.add-category-btn:hover {
    background: rgba(115, 195, 254, 0.06);
}

.timeline-grid {
    position: relative;
    flex: 1;
}

.timeline-header {
    display: flex;
    height: 40px;
    border-bottom: 1px solid var(--color-border-subtle);
}

.month-header {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    border-right: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
}

.month-header:last-child {
    border-right: none;
}

.timeline-row {
    position: relative;
    display: flex;
    border-bottom: 1px solid var(--color-border-subtle);
}

.month-cell {
    height: 100%;
    border-right: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.month-cell:last-child {
    border-right: none;
}

.month-cell:hover {
    background: rgba(115, 195, 254, 0.06);
}

.month-cell-add {
    display: none;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-accent);
    opacity: 0.6;
    pointer-events: none;
}

.month-cell:hover .month-cell-add {
    display: block;
}

.timeline-bar {
    position: absolute;
    border-radius: 6px;
    display: flex;
    align-items: center;
    cursor: grab;
    z-index: 1;
    transition: box-shadow 0.15s;
    user-select: none;
    min-width: 20px;
}

.timeline-bar:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 2;
}

.timeline-bar:active {
    cursor: grabbing;
}

.bar-label {
    padding: 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.bar-type-badge {
    font-size: 0.625rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
    line-height: 1;
}

.bar-handle {
    width: 6px;
    height: 100%;
    cursor: col-resize;
    flex-shrink: 0;
    border-radius: 6px;
}

.bar-handle-left {
    border-radius: 6px 0 0 6px;
}

.bar-handle-right {
    border-radius: 0 6px 6px 0;
}

.bar-handle:hover {
    background: rgba(255, 255, 255, 0.25);
}

.today-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--color-error, #f87171);
    z-index: 3;
    pointer-events: none;
}

.today-line::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-error, #f87171);
}

.timeline-empty {
    padding: 3rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

/* ── Modals / Forms ────────────────────────────────────────────────────── */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.native-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
}

.native-input:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
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

.color-field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.color-picker {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 0;
    background: none;
}

.color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
}

.color-picker::-webkit-color-swatch {
    border: 2px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
}

.color-value {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.mode-toggle {
    display: flex;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.mode-btn {
    flex: 1;
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.mode-btn:first-child {
    border-right: 1px solid var(--color-border-subtle);
}

.mode-btn.active {
    background: rgba(115, 195, 254, 0.12);
    color: var(--color-accent);
}

.mode-btn:hover:not(.active) {
    background: rgba(115, 195, 254, 0.04);
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}

/* ── Mobile ────────────────────────────────────────────────────────────── */
.mobile .page-header {
    flex-wrap: wrap;
}

.mobile .page-title {
    font-size: 1.375rem;
}

.mobile .roadmap-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 1rem 0;
}

.mobile .roadmap-avatar {
    display: none;
}

.mobile .roadmap-info {
    width: 100%;
}

.mobile .roadmap-name {
    white-space: normal;
    word-break: break-word;
}

.mobile .roadmap-row-end {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
}

.mobile .roadmap-meta {
    text-align: left;
    white-space: normal;
    word-break: break-word;
}

.mobile .roadmap-actions {
    width: 100%;
    flex-wrap: wrap;
}

.mobile .timeline-sidebar {
    width: 140px;
    min-width: 140px;
}

.mobile .header-actions {
    flex-wrap: wrap;
}

.mobile .native-input,
.mobile .native-select {
    font-size: 0.9375rem;
    padding: 0.625rem 0.75rem;
}
</style>

<style>
/* Popover is teleported to body — needs global styles */
.bar-popover {
    position: fixed;
    min-width: 220px;
    max-width: 280px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.bar-popover-title {
    font-size: 0.875rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    color: var(--color-text);
    line-height: 1.3;
}

.bar-popover-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 0.25rem;
    line-height: 1.4;
}

.bar-popover-label {
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    min-width: 56px;
}

.bar-popover-desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.bar-popover-badge {
    display: inline-block;
    margin-top: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-accent);
    background: rgba(115, 195, 254, 0.12);
    padding: 2px 8px;
    border-radius: 4px;
}
</style>
