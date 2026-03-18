import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface Roadmap {
    id: string
    title: string
    description: string | null
    start_date: string
    end_date: string
    mandator_id: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface RoadmapCategory {
    id: string
    roadmap_id: string
    name: string
    color: string | null
    sort_order: number
    created_at: string
    updated_at: string
}

export interface RoadmapItem {
    id: string
    category_id: string
    title: string
    description: string | null
    start_date: string
    end_date: string
    color: string | null
    linked_event_id: string | null
    linked_release_id: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface SystemEntity {
    id: string
    title: string
    date: string | null
    type: 'event' | 'release'
}

const roadmaps = ref<Roadmap[]>([])
const loading = ref(false)

async function enrichWithNames<T extends { created_by: string | null; updated_by?: string | null }>(
    rows: T[]
): Promise<(T & { creator_name: string | null; updater_name?: string | null })[]> {
    const userIds = [...new Set(
        rows.flatMap(r => [r.created_by, (r as any).updated_by]).filter((id): id is string => !!id)
    )]
    let profileMap: Record<string, string | null> = {}
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
    }
    return rows.map(r => ({
        ...r,
        creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
        updater_name: (r as any).updated_by ? (profileMap[(r as any).updated_by] ?? null) : null,
    }))
}

export function useRoadmap() {
    const { mandator } = useMandator()

    // ── Roadmaps ─────────────────────────────────────────────────────────────
    async function fetchRoadmaps() {
        loading.value = true
        const { data, error } = await supabase
            .from('roadmaps')
            .select('*')
            .order('start_date', { ascending: true })
        if (error) throw error
        roadmaps.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createRoadmap(payload: { title: string; description?: string | null; start_date: string; end_date: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('roadmaps')
            .insert({
                ...payload,
                mandator_id: mandator.value?.id,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
        await fetchRoadmaps()
    }

    async function updateRoadmap(id: string, payload: { title?: string; description?: string | null; start_date?: string; end_date?: string }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('roadmaps')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchRoadmaps()
    }

    async function deleteRoadmap(id: string) {
        const { error } = await supabase.from('roadmaps').delete().eq('id', id)
        if (error) throw error
        roadmaps.value = roadmaps.value.filter(r => r.id !== id)
    }

    // ── Categories ───────────────────────────────────────────────────────────
    async function fetchCategories(roadmapId: string): Promise<RoadmapCategory[]> {
        const { data, error } = await supabase
            .from('roadmap_categories')
            .select('*')
            .eq('roadmap_id', roadmapId)
            .order('sort_order', { ascending: true })
        if (error) throw error
        return (data ?? []) as RoadmapCategory[]
    }

    async function createCategory(roadmapId: string, payload: { name: string; color?: string | null; sort_order?: number }) {
        const { error } = await supabase
            .from('roadmap_categories')
            .insert({ roadmap_id: roadmapId, ...payload })
        if (error) throw error
    }

    async function updateCategory(categoryId: string, payload: { name?: string; color?: string | null; sort_order?: number }) {
        const { error } = await supabase
            .from('roadmap_categories')
            .update(payload)
            .eq('id', categoryId)
        if (error) throw error
    }

    async function deleteCategory(categoryId: string) {
        const { error } = await supabase
            .from('roadmap_categories')
            .delete()
            .eq('id', categoryId)
        if (error) throw error
    }

    async function reorderCategories(_roadmapId: string, orderedIds: string[]) {
        const updates = orderedIds.map((id, index) =>
            supabase.from('roadmap_categories').update({ sort_order: index }).eq('id', id)
        )
        await Promise.all(updates)
    }

    // ── Items ────────────────────────────────────────────────────────────────
    async function fetchItems(roadmapId: string): Promise<RoadmapItem[]> {
        const { data, error } = await supabase
            .from('roadmap_items')
            .select('*, roadmap_categories!inner(roadmap_id)')
            .eq('roadmap_categories.roadmap_id', roadmapId)
            .order('start_date', { ascending: true })
        if (error) throw error
        const enriched = await enrichWithNames(data ?? [])
        return enriched as RoadmapItem[]
    }

    async function createItem(categoryId: string, payload: { title: string; description?: string | null; start_date: string; end_date: string; color?: string | null; linked_event_id?: string | null; linked_release_id?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('roadmap_items')
            .insert({
                category_id: categoryId,
                ...payload,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
    }

    async function updateItem(itemId: string, payload: { title?: string; description?: string | null; start_date?: string; end_date?: string; color?: string | null; category_id?: string; linked_event_id?: string | null; linked_release_id?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('roadmap_items')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', itemId)
        if (error) throw error
    }

    async function deleteItem(itemId: string) {
        const { error } = await supabase
            .from('roadmap_items')
            .delete()
            .eq('id', itemId)
        if (error) throw error
    }

    // ── System entities (events + releases for linking) ─────────────────────
    async function fetchSystemEntities(): Promise<SystemEntity[]> {
        const [eventsRes, releasesRes] = await Promise.all([
            supabase.from('events').select('id, title, event_date').order('event_date', { ascending: false }),
            supabase.from('releases').select('id, title, release_date').order('release_date', { ascending: false }),
        ])
        const events: SystemEntity[] = (eventsRes.data ?? []).map(e => ({
            id: e.id,
            title: e.title,
            date: e.event_date,
            type: 'event' as const,
        }))
        const releases: SystemEntity[] = (releasesRes.data ?? []).map(r => ({
            id: r.id,
            title: r.title,
            date: r.release_date,
            type: 'release' as const,
        }))
        return [...events, ...releases]
    }

    return {
        roadmaps,
        loading,
        fetchRoadmaps,
        createRoadmap,
        updateRoadmap,
        deleteRoadmap,
        fetchCategories,
        createCategory,
        updateCategory,
        deleteCategory,
        reorderCategories,
        fetchItems,
        createItem,
        updateItem,
        deleteItem,
        fetchSystemEntities,
    }
}
