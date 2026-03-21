import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface Lightshow {
    id: string
    title: string
    description: string | null
    mandator_id: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export type LightshowModeType = 'gradient' | 'gradient_aggressive' | 'buildup' | 'text' | 'spotlights'

export interface GradientShapeConfig {
    type: 'circle' | 'square' | 'triangle' | 'none'
    size: number
    color: string
    opacity: number
    movement_speed: number
    movement_pattern: 'drift' | 'bounce' | 'orbit'
    flicker: boolean
    flicker_intensity: number
    shimmer: boolean
    pulse: boolean
    pulse_speed: number
    stretch: number
    stretch_speed: number
}

export interface GradientConfig {
    colors: string[]
    gradient_speed: number
    gradient_angle: number
    shape: GradientShapeConfig
}

export interface BuildupConfig {
    colors: string[]
    gradient_speed: number
    gradient_angle: number
    side_lines: {
        color: string
        width: number
        sweep_speed: number
        brightness: number
    }
    buildup_shape: {
        type: 'circle' | 'square' | 'triangle'
        color: string
        max_scale: number
        buildup_duration: number
        stretch: number
    }
    strobes: {
        enabled: boolean
        intensity: number
        frequency: number
    }
}

export interface TextConfig {
    colors: string[]
    gradient_speed: number
    gradient_angle: number
    text: {
        content: string
        color: string
        size: number
        opacity: number
        animation: 'none' | 'pulse' | 'flicker' | 'shimmer'
        shimmer_speed: number
        shimmer_width: number
        shimmer_intensity: number
        shimmer_color: string
        flicker_speed: number
        flicker_smoothness: number
        flicker_intensity: number
        flicker_color_shift: number
    }
}

export interface SpotlightsConfig {
    background_color: string
    beam_count: number
    beam_colors: string[]
    beam_width: number
    beam_speed: number
    beam_brightness: number
    beam_spread: number
    haze: number
}

export type ModeConfig = GradientConfig | BuildupConfig | TextConfig | SpotlightsConfig
// gradient_aggressive uses the same GradientConfig — just rendered differently

export interface LightshowMode {
    id: string
    lightshow_id: string
    type: LightshowModeType
    sort_order: number
    config: ModeConfig
    created_at: string
    updated_at: string
}

export function getDefaultGradientConfig(): GradientConfig {
    return {
        colors: ['#ff00aa', '#00aaff', '#aa00ff'],
        gradient_speed: 0.5,
        gradient_angle: 45,
        shape: {
            type: 'circle',
            size: 0.3,
            color: '#ffffff',
            opacity: 0.6,
            movement_speed: 0.4,
            movement_pattern: 'drift',
            flicker: true,
            flicker_intensity: 0.5,
            shimmer: false,
            pulse: true,
            pulse_speed: 0.3,
            stretch: 0.5,
            stretch_speed: 0.5,
        },
    }
}

export function getDefaultBuildupConfig(): BuildupConfig {
    return {
        colors: ['#ff00aa', '#00aaff'],
        gradient_speed: 0.5,
        gradient_angle: 45,
        side_lines: {
            color: '#ffffff',
            width: 40,
            sweep_speed: 0.6,
            brightness: 1.0,
        },
        buildup_shape: {
            type: 'circle',
            color: '#ffffff',
            max_scale: 2.0,
            buildup_duration: 8.0,
            stretch: 0.5,
        },
        strobes: {
            enabled: true,
            intensity: 0.7,
            frequency: 0.5,
        },
    }
}

export function getDefaultTextConfig(): TextConfig {
    return {
        colors: ['#ff00aa', '#00aaff'],
        gradient_speed: 0.5,
        gradient_angle: 45,
        text: {
            content: 'SYVORA',
            color: '#ffffff',
            size: 0.8,
            opacity: 1.0,
            animation: 'none',
            shimmer_speed: 0.5,
            shimmer_width: 0.5,
            shimmer_intensity: 0.7,
            shimmer_color: '#ffffff',
            flicker_speed: 0.5,
            flicker_smoothness: 0.5,
            flicker_intensity: 0.7,
            flicker_color_shift: 0.3,
        },
    }
}

export function getDefaultGradientAggressiveConfig(): GradientConfig {
    return {
        colors: ['#ff0055', '#ff6600', '#ffdd00', '#00ffaa'],
        gradient_speed: 1.0,
        gradient_angle: 30,
        shape: {
            type: 'circle',
            size: 0.5,
            color: '#ffffff',
            opacity: 0.9,
            movement_speed: 0.8,
            movement_pattern: 'bounce',
            flicker: true,
            flicker_intensity: 0.9,
            shimmer: true,
            pulse: true,
            pulse_speed: 0.8,
            stretch: 0.8,
            stretch_speed: 1.0,
        },
    }
}

export function getDefaultSpotlightsConfig(): SpotlightsConfig {
    return {
        background_color: '#0a0a1a',
        beam_count: 6,
        beam_colors: ['#ffffff', '#73c3fe', '#ff00aa', '#00ffaa'],
        beam_width: 0.4,
        beam_speed: 0.5,
        beam_brightness: 0.8,
        beam_spread: 0.6,
        haze: 0.5,
    }
}

export function getDefaultConfigForType(type: LightshowModeType): ModeConfig {
    switch (type) {
        case 'gradient': return getDefaultGradientConfig()
        case 'gradient_aggressive': return getDefaultGradientAggressiveConfig()
        case 'buildup': return getDefaultBuildupConfig()
        case 'text': return getDefaultTextConfig()
        case 'spotlights': return getDefaultSpotlightsConfig()
    }
}

const lightshows = ref<Lightshow[]>([])
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

export function useLights() {
    const { mandator } = useMandator()

    // ── Lightshows ──────────────────────────────────────────────────────────
    async function fetchLightshows() {
        loading.value = true
        const { data, error } = await supabase
            .from('lightshows')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) throw error
        lightshows.value = await enrichWithNames(data ?? [])
        loading.value = false
    }

    async function createLightshow(payload: { title: string; description?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('lightshows')
            .insert({
                ...payload,
                mandator_id: mandator.value?.id,
                created_by: user?.id,
                updated_by: user?.id,
            })
        if (error) throw error
        await fetchLightshows()
    }

    async function updateLightshow(id: string, payload: { title?: string; description?: string | null }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('lightshows')
            .update({ ...payload, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchLightshows()
    }

    async function deleteLightshow(id: string) {
        const { error } = await supabase.from('lightshows').delete().eq('id', id)
        if (error) throw error
        lightshows.value = lightshows.value.filter(l => l.id !== id)
    }

    // ── Modes ───────────────────────────────────────────────────────────────
    async function fetchModes(lightshowId: string): Promise<LightshowMode[]> {
        const { data, error } = await supabase
            .from('lightshow_modes')
            .select('*')
            .eq('lightshow_id', lightshowId)
            .order('sort_order', { ascending: true })
        if (error) throw error
        return (data ?? []) as LightshowMode[]
    }

    async function createMode(lightshowId: string, payload: { type: LightshowModeType; config: ModeConfig; sort_order?: number }) {
        const { error } = await supabase
            .from('lightshow_modes')
            .insert({ lightshow_id: lightshowId, ...payload })
        if (error) throw error
    }

    async function updateMode(modeId: string, payload: { type?: LightshowModeType; config?: ModeConfig; sort_order?: number }) {
        const { error } = await supabase
            .from('lightshow_modes')
            .update(payload)
            .eq('id', modeId)
        if (error) throw error
    }

    async function deleteMode(modeId: string) {
        const { error } = await supabase
            .from('lightshow_modes')
            .delete()
            .eq('id', modeId)
        if (error) throw error
    }

    async function reorderModes(_lightshowId: string, orderedIds: string[]) {
        const updates = orderedIds.map((id, index) =>
            supabase.from('lightshow_modes').update({ sort_order: index }).eq('id', id)
        )
        await Promise.all(updates)
    }

    return {
        lightshows,
        loading,
        fetchLightshows,
        createLightshow,
        updateLightshow,
        deleteLightshow,
        fetchModes,
        createMode,
        updateMode,
        deleteMode,
        reorderModes,
    }
}
