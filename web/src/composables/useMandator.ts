import { ref, computed, readonly, watch } from 'vue'
import { supabase } from '../lib/supabase'

export interface Mandator {
    id: string
    name: string
    module_artists: boolean
    module_releases: boolean
    module_events: boolean
    module_radios: boolean
    module_financials: boolean
    module_associations: boolean
    module_meetings: boolean
    module_roadmap: boolean
    module_lights: boolean
    module_contracts: boolean
    module_email: boolean
    module_team: boolean
    module_sales: boolean
    stripe_secret_key: string | null
    stripe_webhook_secret: string | null
    contract_logo_url: string | null
    label_address: string | null
    label_uid: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
}

export type ModuleKey = 'module_artists' | 'module_releases' | 'module_events' | 'module_radios' | 'module_financials' | 'module_associations' | 'module_meetings' | 'module_roadmap' | 'module_lights' | 'module_contracts' | 'module_email' | 'module_team' | 'module_sales'
export type ModuleRoute = 'artists' | 'releases' | 'events' | 'radios' | 'financials' | 'associations' | 'meetings' | 'roadmap' | 'lights' | 'contracts' | 'email' | 'team' | 'sales'

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
    { route: 'associations', column: 'module_associations', label: 'Associations' },
    { route: 'meetings', column: 'module_meetings', label: 'Meetings' },
    { route: 'roadmap', column: 'module_roadmap', label: 'Roadmap' },
    { route: 'lights', column: 'module_lights', label: 'Lights' },
    { route: 'contracts', column: 'module_contracts', label: 'Contracts' },
    { route: 'email', column: 'module_email', label: 'Email' },
    { route: 'team', column: 'module_team', label: 'Team' },
    { route: 'sales', column: 'module_sales', label: 'Sales' },
]

export type MandatorFormData = Pick<Mandator, 'name' | ModuleKey>

const DEFAULT_FORM: MandatorFormData = {
    name: '',
    module_artists: true,
    module_releases: true,
    module_events: true,
    module_radios: true,
    module_financials: true,
    module_associations: true,
    module_meetings: true,
    module_roadmap: true,
    module_lights: true,
    module_contracts: true,
    module_email: false,
    module_team: true,
    module_sales: true,
}

// ── Current user's mandator (singleton state) ───────────────────────────────
const mandator = ref<Mandator | null>(null)
const loading = ref(false)
const ready = ref(false)

const artistsEnabled = computed(() => mandator.value?.module_artists ?? true)
const releasesEnabled = computed(() => mandator.value?.module_releases ?? true)
const eventsEnabled = computed(() => mandator.value?.module_events ?? true)
const radiosEnabled = computed(() => mandator.value?.module_radios ?? true)
const financialsEnabled = computed(() => mandator.value?.module_financials ?? true)
const associationsEnabled = computed(() => mandator.value?.module_associations ?? true)
const meetingsEnabled = computed(() => mandator.value?.module_meetings ?? true)
const roadmapEnabled = computed(() => mandator.value?.module_roadmap ?? true)
const lightsEnabled = computed(() => mandator.value?.module_lights ?? true)
const contractsEnabled = computed(() => mandator.value?.module_contracts ?? true)
const emailEnabled = computed(() => mandator.value?.module_email ?? false)
const teamEnabled = computed(() => mandator.value?.module_team ?? true)
const salesEnabled = computed(() => mandator.value?.module_sales ?? true)
const contractLogoUrl = computed(() => mandator.value?.contract_logo_url ?? null)
const labelAddress = computed(() => mandator.value?.label_address ?? null)
const labelUid = computed(() => mandator.value?.label_uid ?? null)

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
        ready.value = true
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
        ready.value = true
    }
}

function waitUntilReady(): Promise<void> {
    if (ready.value) return Promise.resolve()
    return new Promise((resolve) => {
        const stop = watch(ready, (val) => {
            if (val) { stop(); resolve() }
        })
    })
}

async function refreshMandator() {
    if (mandator.value) {
        await loadMandator(mandator.value.id)
    }
}

function clearMandator() {
    mandator.value = null
    ready.value = false
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
            module_associations: from.module_associations,
            module_meetings: from.module_meetings,
            module_roadmap: from.module_roadmap,
            module_lights: from.module_lights,
            module_contracts: from.module_contracts,
            module_email: from.module_email,
            module_team: from.module_team,
            module_sales: from.module_sales,
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
        associationsEnabled,
        meetingsEnabled,
        roadmapEnabled,
        lightsEnabled,
        contractsEnabled,
        emailEnabled,
        teamEnabled,
        salesEnabled,
        contractLogoUrl,
        labelAddress,
        labelUid,
        enabledModules,
        isModuleEnabled,
        loadMandator,
        refreshMandator,
        clearMandator,
        waitUntilReady,
        mandators: readonly(mandators),
        fetchMandators,
        createMandator,
        updateMandator,
        deleteMandator,
        getDefaultForm,
        getMandatorName,
    }
}
