import jsPDF from 'jspdf'
import type { Lightshow, LightshowMode, LightshowModeType } from './useLights'

// A5 dimensions in mm
const A5_W = 148
const A5_H = 210

const MARGIN = 12
const CONTENT_W = A5_W - MARGIN * 2

function modeLabel(type: LightshowModeType): string {
    const map: Record<LightshowModeType, string> = {
        gradient: 'Gradient',
        gradient_aggressive: 'Aggressive',
        buildup: 'Buildup',
        drop: 'Drop',
        after_drop: 'After Drop',
        text: 'Text',
        spotlights: 'Spotlights',
        vivid: 'Vivid',
    }
    return map[type] ?? type
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ]
}

function getModeColors(mode: LightshowMode): string[] {
    const cfg = mode.config as any
    if (cfg.colors) return cfg.colors
    if (cfg.beam_colors) return cfg.beam_colors
    return []
}

function getModeDescription(mode: LightshowMode): string {
    const cfg = mode.config as any
    const parts: string[] = []

    switch (mode.type) {
        case 'gradient':
        case 'gradient_aggressive': {
            if (cfg.gradient_speed) parts.push(`Speed ${cfg.gradient_speed}`)
            if (cfg.gradient_angle) parts.push(`Angle ${cfg.gradient_angle}°`)
            if (cfg.shape?.type && cfg.shape.type !== 'none') {
                parts.push(`Shape: ${cfg.shape.type}`)
                if (cfg.shape.movement_pattern) parts.push(`Movement: ${cfg.shape.movement_pattern}`)
                const effects: string[] = []
                if (cfg.shape.flicker) effects.push('flicker')
                if (cfg.shape.shimmer) effects.push('shimmer')
                if (cfg.shape.pulse) effects.push('pulse')
                if (effects.length) parts.push(`Effects: ${effects.join(', ')}`)
            }
            break
        }
        case 'buildup': {
            if (cfg.buildup_shape?.buildup_duration) parts.push(`Duration ${cfg.buildup_shape.buildup_duration}s`)
            if (cfg.buildup_shape?.type) parts.push(`Shape: ${cfg.buildup_shape.type}`)
            if (cfg.strobes?.enabled) parts.push('Strobes ON')
            if (cfg.side_lines?.color) parts.push('Side lines')
            break
        }
        case 'drop':
        case 'after_drop': {
            if (cfg.speed) parts.push(`Speed ${cfg.speed}`)
            if (cfg.energy) parts.push(`Energy ${cfg.energy}`)
            if (cfg.shape_type) parts.push(`Shape: ${cfg.shape_type}`)
            if (cfg.strobes_enabled) parts.push('Strobes ON')
            if (cfg.stretch) parts.push(`Stretch ${cfg.stretch}`)
            break
        }
        case 'text': {
            if (cfg.text?.content) parts.push(`"${cfg.text.content}"`)
            if (cfg.text?.animation && cfg.text.animation !== 'none') parts.push(`Anim: ${cfg.text.animation}`)
            if (cfg.side_lines?.enabled) parts.push('Side lines')
            break
        }
        case 'spotlights': {
            if (cfg.beam_count) parts.push(`${cfg.beam_count} beams`)
            if (cfg.beam_speed) parts.push(`Speed ${cfg.beam_speed}`)
            if (cfg.haze) parts.push(`Haze ${cfg.haze}`)
            if (cfg.shape?.type && cfg.shape.type !== 'none') parts.push(`Shape: ${cfg.shape.type}`)
            break
        }
        case 'vivid': {
            if (cfg.speed) parts.push(`Speed ${cfg.speed}`)
            if (cfg.bloom) parts.push(`Bloom ${cfg.bloom}`)
            if (cfg.depth) parts.push(`Depth ${cfg.depth}`)
            if (cfg.strobe_enabled) parts.push('Strobe ON')
            break
        }
    }

    return parts.join(' · ')
}

export function exportLightshowPdf(lightshow: Lightshow, modes: LightshowMode[]) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })

    let y = MARGIN

    // ── Header ──────────────────────────────────────────────────────────
    doc.setFillColor(15, 15, 20)
    doc.rect(0, 0, A5_W, 38, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(lightshow.title, MARGIN, y + 12)

    if (lightshow.description) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(180, 180, 190)
        doc.text(lightshow.description, MARGIN, y + 18, { maxWidth: CONTENT_W })
    }

    doc.setFontSize(7)
    doc.setTextColor(120, 120, 140)
    doc.text(`Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, MARGIN, y + 25)

    y = 44

    // ── Modes section ───────────────────────────────────────────────────
    doc.setTextColor(40, 40, 50)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('MODES', MARGIN, y)
    y += 2

    // Thin accent line
    doc.setDrawColor(115, 195, 254)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, MARGIN + 20, y)
    y += 5

    for (let i = 0; i < modes.length; i++) {
        const mode = modes[i]!
        const colors = getModeColors(mode)
        const desc = getModeDescription(mode)

        // Check if we need a new page
        if (y > A5_H - 30) {
            doc.addPage('a5', 'portrait')
            y = MARGIN
        }

        // Mode row background
        const rowH = desc ? 16 : 12
        if (i % 2 === 0) {
            doc.setFillColor(245, 248, 252)
            doc.roundedRect(MARGIN - 2, y - 3, CONTENT_W + 4, rowH, 1.5, 1.5, 'F')
        }

        // Hotkey badge
        const hotkey = i < 9 ? String(i + 1) : ''
        if (hotkey) {
            doc.setFillColor(115, 195, 254)
            doc.roundedRect(MARGIN, y - 2.5, 7, 7, 1, 1, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text(hotkey, MARGIN + 3.5, y + 2.5, { align: 'center' })
        }

        // Mode label
        doc.setTextColor(30, 30, 40)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(modeLabel(mode.type), MARGIN + 10, y + 2)

        // Color swatches
        const swatchX = MARGIN + 10 + doc.getTextWidth(modeLabel(mode.type)) + 3
        for (let ci = 0; ci < Math.min(colors.length, 8); ci++) {
            const [r, g, b] = hexToRgb(colors[ci]!)
            doc.setFillColor(r, g, b)
            doc.circle(swatchX + ci * 4.5 + 1.5, y + 0.5, 1.5, 'F')
            // Thin outline for light colors
            doc.setDrawColor(180, 180, 180)
            doc.setLineWidth(0.15)
            doc.circle(swatchX + ci * 4.5 + 1.5, y + 0.5, 1.5, 'S')
        }

        // Description line
        if (desc) {
            doc.setTextColor(100, 100, 120)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6.5)
            doc.text(desc, MARGIN + 10, y + 7.5, { maxWidth: CONTENT_W - 12 })
        }

        y += rowH + 2
    }

    // ── Hotkeys reference ───────────────────────────────────────────────
    if (y > A5_H - 55) {
        doc.addPage('a5', 'portrait')
        y = MARGIN
    }

    y += 4
    doc.setTextColor(40, 40, 50)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('KEYBOARD SHORTCUTS', MARGIN, y)
    y += 2

    doc.setDrawColor(115, 195, 254)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, MARGIN + 20, y)
    y += 6

    const shortcuts: [string, string][] = [
        ['1 – 9', 'Switch to mode 1–9'],
        ['Space (hold)', 'Build up intensity'],
        ['Space (release)', 'Coast / freeze buildup'],
        ['Enter', 'Trigger drop'],
        ['F', 'Flash white'],
        ['Arrow Up', 'Increase intensity (+10%)'],
        ['Arrow Down', 'Decrease intensity (-10%)'],
        ['R', 'Reset to auto / default intensity'],
    ]

    for (const [key, action] of shortcuts) {
        if (y > A5_H - 12) {
            doc.addPage('a5', 'portrait')
            y = MARGIN
        }

        // Key badge
        const keyW = Math.max(doc.getTextWidth(key) + 4, 18)
        doc.setFillColor(35, 35, 45)
        doc.roundedRect(MARGIN, y - 3, keyW, 6.5, 1, 1, 'F')
        doc.setTextColor(230, 230, 240)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.text(key, MARGIN + keyW / 2, y + 1.5, { align: 'center' })

        // Action text
        doc.setTextColor(60, 60, 70)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text(action, MARGIN + keyW + 4, y + 1.5)

        y += 9
    }

    // ── Footer ──────────────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        doc.setTextColor(160, 160, 175)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.text('Syvora Lights', MARGIN, A5_H - 6)
        doc.text(`${p} / ${pageCount}`, A5_W - MARGIN, A5_H - 6, { align: 'right' })
    }

    // ── Save ────────────────────────────────────────────────────────────
    const safeTitle = lightshow.title.replace(/[^a-zA-Z0-9_-]/g, '_')
    doc.save(`${safeTitle}_lightshow.pdf`)
}
