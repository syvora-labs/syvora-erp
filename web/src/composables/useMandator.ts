import { ref, computed, readonly } from 'vue'
import { supabase } from '../lib/supabase'

export interface Mandator {
    id: string
    name: string
    module_artists: boolean
    module_releases: boolean
    module_events: boolean
    module_radios: boolean
    module_financials: boolean
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
}

export type ModuleKey = 'module_artists' | 'module_releases' | 'module_events' | 'module_radios' | 'module_financials'
export type ModuleRoute = 'artists' | 'releases' | 'events' | 'radios' | 'financials'

export interface ModuleDefinition {
    route: ModuleRoute
    column: ModuleKey
    label: string
}

export const MODULES: ModuleDefinition[] = [
    { route: 'releases', column: 'module_releases', label: 'Releases' },
    { route: 'events', column: 'module_events', label: 'Events' },
    { route: 'radios', column: 'module_radios', label: 'Radios' },
    { route: 'artists', column: 'module_artists', label: 'Artists' },
    { route: 'financials', column: 'module_financials', label: 'Financials' },
]

export type MandatorFormData = Pick<Mandator, 'name' | ModuleKey>

const DEFAULT_FORM: MandatorFormData = {
    name: '',
    module_artists: true,
    module_releases: true,
    module_events: true,
    module_radios: true,
    module_financials: true,
}

// ── Current user's mandator (singleton state) ───────────────────────────────
const mandator = ref<Mandator | null>(null)
const loading = ref(false)

const artistsEnabled = computed(() => mandator.value?.module_artists ?? true)
const releasesEnabled = computed(() => mandator.value?.module_releases ?? true)
const eventsEnabled = computed(() => mandator.value?.module_events ?? true)
const radiosEnabled = computed(() => mandator.value?.module_radios ?? true)
const financialsEnabled = computed(() => mandator.value?.module_financials ?? true)

const enabledModules = computed(() =>
    MODULES.filter((m) => mandator.value?.[m.column] ?? true).map((m) => m.route)
)

function isModuleEnabled(route: string): boolean {
    const mod = MODULES.find((m) => m.route === route)
    return mod ? (mandator.value?.[mod.column] ?? true) : true
}

async function loadMandator(mandatorId: string | null | undefined) {
    if (!mandatorId) {
        mandator.value = null
        return
    }
    loading.value = true
    try {
        const { data, error } = await supabase
            .from('mandators')
            .select('*')
            .eq('id', mandatorId)
            .maybeSingle()
        if (error) throw error
        mandator.value = data as Mandator | null
    } finally {
        loading.value = false
    }
}

async function refreshMandator() {
    if (mandator.value) {
        await loadMandator(mandator.value.id)
    }
}

function clearMandator() {
    mandator.value = null
}

// ── Mandator CRUD (all-mandators list) ──────────────────────────────────────
const mandators = ref<Mandator[]>([])

async function fetchMandators() {
    const { data, error } = await supabase
        .from('mandators')
        .select('*')
        .order('name')
    if (error) throw error
    mandators.value = (data ?? []) as Mandator[]
}

async function createMandator(form: MandatorFormData, userId: string | undefined) {
    const { error } = await supabase
        .from('mandators')
        .insert({ ...form, created_by: userId, updated_by: userId })
    if (error) throw error
    await fetchMandators()
}

async function updateMandator(id: string, form: MandatorFormData, userId: string | undefined) {
    const { error } = await supabase
        .from('mandators')
        .update({ ...form, updated_by: userId })
        .eq('id', id)
    if (error) throw error
    await fetchMandators()
    // Refresh current session if this is the user's own mandator
    if (mandator.value?.id === id) {
        await refreshMandator()
    }
}

async function deleteMandator(id: string) {
    const { error } = await supabase
        .from('mandators')
        .delete()
        .eq('id', id)
    if (error) throw error
    await fetchMandators()
}

function getDefaultForm(from?: Mandator): MandatorFormData {
    if (from) {
        return {
            name: from.name,
            module_artists: from.module_artists,
            module_releases: from.module_releases,
            module_events: from.module_events,
            module_radios: from.module_radios,
            module_financials: from.module_financials,
        }
    }
    return { ...DEFAULT_FORM }
}

function getMandatorName(id: string | null): string {
    if (!id) return '—'
    return mandators.value.find((m) => m.id === id)?.name ?? '—'
}

export function useMandator() {
    return {
        mandator: readonly(mandator),
        loading: readonly(loading),
        artistsEnabled,
        releasesEnabled,
        eventsEnabled,
        radiosEnabled,
        financialsEnabled,
        enabledModules,
        isModuleEnabled,
        loadMandator,
        refreshMandator,
        clearMandator,
        mandators: readonly(mandators),
        fetchMandators,
        createMandator,
        updateMandator,
        deleteMandator,
        getDefaultForm,
        getMandatorName,
    }
}
