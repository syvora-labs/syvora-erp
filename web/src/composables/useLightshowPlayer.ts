import { ref, onUnmounted } from 'vue'
import type { LightshowMode, GradientConfig, BuildupConfig, TextConfig, SpotlightsConfig, DropConfig, AfterDropConfig, VividConfig } from './useLights'

let matterHeavyFont: FontFace | null = null
let fontLoaded = false

async function ensureFont() {
    if (fontLoaded) return
    if (!matterHeavyFont) {
        matterHeavyFont = new FontFace('Matter-Regular', 'url(/fonts/Matter-Regular.otf)')
        document.fonts.add(matterHeavyFont)
    }
    try {
        await matterHeavyFont.load()
        fontLoaded = true
    } catch {
        // Font load failed — fallback will be used
    }
}

function hexToRgb(hex: string): [number, number, number] {
    if (!hex || hex.length < 4) return [0, 0, 0]
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ]
}

export function useLightshowPlayer() {
    const activeMode = ref<LightshowMode | null>(null)
    const isFullscreen = ref(false)
    const isPlaying = ref(false)

    let canvas: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    let animFrameId = 0
    let startTime = 0
    let lastFrameTime = 0

    // ── Live performance controls ───────────────────────────────────────
    // These allow the operator to override automatic behavior in real time.
    const liveIntensity = ref(1)        // 0..2 — global brightness multiplier
    const liveBuildup = ref(-1)         // -1 = auto, 0..1 = manual override
    const liveFlash = ref(false)        // true = white flash this frame
    let liveFlashDecay = 0              // decaying flash brightness
    let liveBuildupHolding = false      // is the operator holding the buildup key/button
    let liveBuildupVelocity = 0         // how fast buildup is rising (accelerates while held)
    let liveBuildupMomentum = 0         // residual momentum after release — decays smoothly
    let liveBuildupDrift = 0            // very slow continuous drift to keep visuals alive when held
    let onDropCallback: (() => void) | null = null  // called when drop is triggered, set by the view

    function setLiveIntensity(v: number) { liveIntensity.value = Math.max(0, Math.min(2, v)) }

    /** Register a callback to be called when drop is triggered (for auto-switching to drop mode) */
    function onDrop(cb: () => void) { onDropCallback = cb }

    /** Start building up — hold to increase, release to coast smoothly */
    function startBuildup() {
        if (liveBuildup.value < 0) liveBuildup.value = 0
        liveBuildupHolding = true
        liveBuildupMomentum = 0
    }

    /** Stop building — momentum carries the buildup forward and decays gradually */
    function stopBuildup() {
        if (liveBuildupHolding) {
            // Transfer current velocity into momentum so it coasts smoothly
            liveBuildupMomentum = liveBuildupVelocity
        }
        liveBuildupHolding = false
    }

    /** Trigger the drop — flash + reset buildup + auto-switch to drop mode */
    function triggerDrop() {
        liveFlash.value = true
        liveFlashDecay = 1
        liveBuildup.value = 0
        liveBuildupHolding = false
        liveBuildupVelocity = 0
        liveBuildupMomentum = 0
        liveBuildupDrift = 0
        if (onDropCallback) onDropCallback()
    }

    /** Return to automatic buildup cycling */
    function resetBuildup() {
        liveBuildup.value = -1
        liveBuildupHolding = false
        liveBuildupVelocity = 0
        liveBuildupMomentum = 0
        liveBuildupDrift = 0
    }

    /** Trigger a manual white flash */
    function triggerFlash() {
        liveFlash.value = true
        liveFlashDecay = 1
    }

    /** Update live state each frame (called from render loop) */
    function updateLiveState(dt: number) {
        if (liveBuildup.value >= 0) {
            if (liveBuildupHolding) {
                // Actively holding: accelerate
                liveBuildupVelocity = Math.min(liveBuildupVelocity + dt * 0.8, 2.0)
                liveBuildup.value = Math.min(liveBuildup.value + liveBuildupVelocity * dt, 1)
                // Track a slow drift baseline
                liveBuildupDrift = liveBuildupVelocity * 0.04
            } else if (liveBuildupMomentum > 0.001) {
                // Released: momentum carries forward and decays smoothly
                // Exponential decay feels natural — like a wheel spinning down
                liveBuildupMomentum *= Math.pow(0.15, dt) // ~85% decay per second
                liveBuildup.value = Math.min(liveBuildup.value + liveBuildupMomentum * dt, 1)
                liveBuildupVelocity = liveBuildupMomentum
            } else {
                // Fully coasted to a stop — keep a tiny organic drift so it
                // doesn't feel frozen. The visuals subtly breathe even when held.
                liveBuildupMomentum = 0
                liveBuildupVelocity = 0
                const breathe = Math.sin(performance.now() * 0.001) * 0.002
                liveBuildupDrift = liveBuildupDrift * 0.98 + breathe * 0.02
                liveBuildup.value = Math.max(0, Math.min(1, liveBuildup.value + liveBuildupDrift * dt))
            }
        }

        // Flash decay
        if (liveFlashDecay > 0) {
            liveFlashDecay = Math.max(0, liveFlashDecay - dt * 4)
        } else {
            liveFlash.value = false
        }
    }

    // ── Crossfade transition state ───────────────────────────────────────
    const CROSSFADE_DURATION = 1.0 // seconds
    let transitionSnapshot: ImageData | null = null
    let transitionStart = 0
    let transitionActive = false
    // Offscreen canvas for compositing the snapshot during crossfade
    let offscreenCanvas: HTMLCanvasElement | null = null
    let offscreenCtx: CanvasRenderingContext2D | null = null

    function setCanvas(el: HTMLCanvasElement) {
        canvas = el
        ctx = el.getContext('2d')!
    }

    // ── Fullscreen API ──────────────────────────────────────────────────────
    async function enterFullscreen(el: HTMLElement) {
        try {
            await el.requestFullscreen()
            isFullscreen.value = true
        } catch { /* user denied */ }
    }

    function exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        }
        isFullscreen.value = false
    }

    function onFullscreenChange() {
        isFullscreen.value = !!document.fullscreenElement
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)

    // ── Mode switching with crossfade ───────────────────────────────────────
    function switchMode(mode: LightshowMode) {
        // Snapshot the current frame before switching
        if (canvas && ctx && activeMode.value && isPlaying.value && canvas.width > 0 && canvas.height > 0) {
            try {
                transitionSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
                transitionStart = performance.now()
                transitionActive = true
            } catch {
                transitionSnapshot = null
                transitionActive = false
            }
        }
        activeMode.value = mode
    }

    // ── Render loop ─────────────────────────────────────────────────────────
    function startRendering() {
        if (isPlaying.value) return
        isPlaying.value = true
        startTime = performance.now()
        lastFrameTime = startTime
        ensureFont()
        loop()
    }

    function stopRendering() {
        isPlaying.value = false
        if (animFrameId) {
            cancelAnimationFrame(animFrameId)
            animFrameId = 0
        }
    }

    function loop() {
        if (!isPlaying.value) return
        render()
        animFrameId = requestAnimationFrame(loop)
    }

    function render() {
        if (!canvas || !ctx || !activeMode.value) return
        try { renderInner() } catch { /* skip frame on transient config error */ }
    }

    function renderInner() {
        if (!canvas || !ctx || !activeMode.value) return

        // Resize canvas to display size
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr
            canvas.height = h * dpr
            ctx.scale(dpr, dpr)
            // Invalidate snapshot on resize — dimensions won't match
            transitionActive = false
            transitionSnapshot = null
        }

        const now = performance.now()
        const dt = (now - lastFrameTime) / 1000
        lastFrameTime = now
        const t = (now - startTime) / 1000
        const config = activeMode.value.config

        // Update live performance state
        updateLiveState(dt)

        // Render the current mode
        switch (activeMode.value.type) {
            case 'gradient':
                renderGradient(ctx, w, h, t, config as GradientConfig)
                break
            case 'gradient_aggressive':
                renderGradientAggressive(ctx, w, h, t, config as GradientConfig)
                break
            case 'buildup':
                renderBuildup(ctx, w, h, t, config as BuildupConfig)
                break
            case 'text':
                renderText(ctx, w, h, t, config as TextConfig)
                break
            case 'spotlights':
                renderSpotlights(ctx, w, h, t, config as SpotlightsConfig)
                break
            case 'drop':
                renderDrop(ctx, w, h, t, config as DropConfig)
                break
            case 'after_drop':
                renderAfterDrop(ctx, w, h, t, config as AfterDropConfig)
                break
            case 'vivid':
                renderVivid(ctx, w, h, t, config as VividConfig)
                break
        }

        // Live intensity overlay (darken if < 1, brighten if > 1)
        const intensity = liveIntensity.value
        if (intensity < 1) {
            ctx.save()
            ctx.globalAlpha = 1 - intensity
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        } else if (intensity > 1) {
            ctx.save()
            ctx.globalAlpha = (intensity - 1) * 0.3
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // Live flash overlay
        if (liveFlashDecay > 0) {
            ctx.save()
            ctx.globalAlpha = liveFlashDecay * 0.9
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // Crossfade: overlay the old snapshot fading out
        if (transitionActive && transitionSnapshot) {
            const elapsed = (performance.now() - transitionStart) / 1000
            const progress = Math.min(elapsed / CROSSFADE_DURATION, 1)

            if (progress >= 1) {
                // Transition complete
                transitionActive = false
                transitionSnapshot = null
            } else {
                // Smooth ease-out for the fade
                const alpha = 1 - easeInOutSine(progress)

                // Paint the snapshot onto an offscreen canvas, then draw it
                // over the current frame with fading opacity
                if (!offscreenCanvas) {
                    offscreenCanvas = document.createElement('canvas')
                    offscreenCtx = offscreenCanvas.getContext('2d')
                }
                if (offscreenCtx) {
                    offscreenCanvas!.width = transitionSnapshot.width
                    offscreenCanvas!.height = transitionSnapshot.height
                    offscreenCtx.putImageData(transitionSnapshot, 0, 0)

                    ctx.save()
                    // Reset transform so we draw in raw pixel space
                    ctx.setTransform(1, 0, 0, 1, 0, 0)
                    ctx.globalAlpha = alpha
                    ctx.drawImage(offscreenCanvas!, 0, 0)
                    ctx.restore()
                }
            }
        }
    }

    // ── Smooth easing helper ───────────────────────────────────────────────
    function easeInOutSine(x: number): number { return -(Math.cos(Math.PI * x) - 1) / 2 }

    // ── Gradient base rendering ─────────────────────────────────────────────
    // Creates a dynamic "energy field": colors blend seamlessly and shift over
    // time with gentle brightness pulsing for depth and movement.
    //
    // The key to smooth gradients: instead of placing N color stops (which
    // creates visible bands), we sample a continuous color function at many
    // evenly-spaced points. The color function uses cosine interpolation
    // between palette colors with time-based shifting, so the transitions
    // are always buttery smooth with no hard lines.

    /** Sample the palette as a continuous loop at position 0..1, with cosine interpolation */
    function samplePalette(rgbColors: [number, number, number][], pos: number): [number, number, number] {
        const n = rgbColors.length
        if (n === 0) return [0, 0, 0]
        if (n === 1) return rgbColors[0]!
        // Wrap position into 0..1
        const p = ((pos % 1) + 1) % 1
        const scaled = p * n
        const idx = Math.floor(scaled)
        const frac = scaled - idx
        const c0 = rgbColors[idx % n]!
        const c1 = rgbColors[(idx + 1) % n]!
        // Cosine interpolation for ultra-smooth blending
        const mu = (1 - Math.cos(frac * Math.PI)) / 2
        return lerpColor(c0, c1, mu)
    }

    function renderGradientBase(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, colors: string[], speed: number, angle: number) {
        const validColors = (colors || []).filter(c => c && c.length >= 4)
        if (validColors.length === 0) {
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            return
        }

        const rgbColors = validColors.map(hexToRgb)
        const cx = w / 2
        const cy = h / 2

        // Slow, fluid angle rotation — feels organic, not mechanical
        const angleDeg = angle + Math.sin(t * speed * 0.15) * 20 + Math.cos(t * speed * 0.09) * 10
        const angleRad = (angleDeg * Math.PI) / 180
        const len = Math.max(w, h) * 0.8

        const x0 = cx - Math.cos(angleRad) * len
        const y0 = cy - Math.sin(angleRad) * len
        const x1 = cx + Math.cos(angleRad) * len
        const y1 = cy + Math.sin(angleRad) * len

        // Time-based shift: the palette "rotates" smoothly over time
        const shift = t * speed * 0.06

        // Primary gradient: sample the palette at many points for seamless blending.
        // 24 stops is enough to eliminate all visible banding on any screen.
        const STOPS = 24
        const grad = ctx.createLinearGradient(x0, y0, x1, y1)
        for (let i = 0; i <= STOPS; i++) {
            const frac = i / STOPS
            const c = samplePalette(rgbColors, frac + shift)
            grad.addColorStop(frac, `rgb(${c[0]},${c[1]},${c[2]})`)
        }

        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)

        // Layer 2: perpendicular secondary gradient for depth (also smooth-sampled)
        const angle2Rad = angleRad + Math.PI / 2
        const grad2 = ctx.createLinearGradient(
            cx - Math.cos(angle2Rad) * len,
            cy - Math.sin(angle2Rad) * len,
            cx + Math.cos(angle2Rad) * len,
            cy + Math.sin(angle2Rad) * len,
        )
        const shift2 = shift * 0.7 + 0.33
        for (let i = 0; i <= STOPS; i++) {
            const frac = i / STOPS
            const c = samplePalette(rgbColors, frac + shift2)
            grad2.addColorStop(frac, `rgba(${c[0]},${c[1]},${c[2]},0.3)`)
        }

        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = grad2
        ctx.fillRect(0, 0, w, h)
        ctx.restore()

        // Gentle global brightness pulse — "breathing" that gives the field life
        const breathe = Math.sin(t * speed * 0.6) * 0.04 + Math.sin(t * speed * 0.25) * 0.025
        if (breathe > 0) {
            ctx.save()
            ctx.globalAlpha = breathe
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        } else {
            ctx.save()
            ctx.globalAlpha = -breathe
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // Subtle radial warmth from center — adds depth perception
        const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6)
        const warmth = easeInOutSine((Math.sin(t * speed * 0.35) + 1) / 2)
        const centerColor = lerpColor(rgbColors[0]!, rgbColors[rgbColors.length > 1 ? 1 : 0]!, warmth)
        radGrad.addColorStop(0, `rgba(${centerColor[0]},${centerColor[1]},${centerColor[2]},0.12)`)
        radGrad.addColorStop(0.6, 'transparent')
        radGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = radGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Shape rendering (Gradient mode) ─────────────────────────────────────
    // Shapes stay clean geometric forms but are transformed via canvas
    // scale/rotate to create stretching, squeezing, and wing-like motion.
    // They pick up colors from the gradient palette and use additive glow.

    /** Draw a clean shape path centered at origin (0,0) */
    function drawShapePath(ctx: CanvasRenderingContext2D, type: string, size: number) {
        const r = size / 2
        ctx.beginPath()
        switch (type) {
            case 'square': {
                const cr = size * 0.12 // corner radius
                ctx.moveTo(-r + cr, -r)
                ctx.arcTo(r, -r, r, r, cr)
                ctx.arcTo(r, r, -r, r, cr)
                ctx.arcTo(-r, r, -r, -r, cr)
                ctx.arcTo(-r, -r, r, -r, cr)
                ctx.closePath()
                break
            }
            case 'triangle': {
                ctx.moveTo(0, -r)
                ctx.lineTo(r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6))
                ctx.lineTo(-r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6))
                ctx.closePath()
                break
            }
            default: // circle
                ctx.arc(0, 0, r, 0, Math.PI * 2)
        }
    }

    function renderShape(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, shape: GradientConfig['shape'], gradientColors: string[]) {
        if (shape.type === 'none') return

        const cx = w / 2
        const cy = h / 2
        const baseSize = Math.min(w, h) * shape.size
        const speed = shape.movement_speed

        // Slow, fluid movement using layered sine waves with easing
        let x: number, y: number
        switch (shape.movement_pattern) {
            case 'bounce': {
                const bx = easeInOutSine((Math.sin(t * speed * 0.6) + 1) / 2)
                const by = easeInOutSine((Math.cos(t * speed * 0.45) + 1) / 2)
                x = cx + (bx - 0.5) * w * 0.5
                y = cy + (by - 0.5) * h * 0.5
                break
            }
            case 'orbit': {
                const orbitR = 0.2 + Math.sin(t * speed * 0.15) * 0.08
                x = cx + Math.cos(t * speed * 0.4) * w * orbitR
                y = cy + Math.sin(t * speed * 0.4) * h * orbitR * 0.7
                break
            }
            default: { // drift
                const d1 = easeInOutSine((Math.sin(t * speed * 0.25) + 1) / 2)
                const d2 = easeInOutSine((Math.cos(t * speed * 0.18) + 1) / 2)
                const d3 = easeInOutSine((Math.sin(t * speed * 0.12 + 1.5) + 1) / 2)
                x = cx + (d1 - 0.5) * w * 0.25 + (d3 - 0.5) * w * 0.1
                y = cy + (d2 - 0.5) * h * 0.25 + (d3 - 0.5) * h * 0.08
            }
        }

        // ── Pulse: gradual eased scale and brightness modulation ─────────
        let size = baseSize
        let brightnessBoost = 0
        if (shape.pulse) {
            const pulseWave = easeInOutSine((Math.sin(t * shape.pulse_speed * 1.5) + 1) / 2)
            size *= 0.9 + pulseWave * 0.2
            brightnessBoost = pulseWave * 0.15
        }

        // ── Shimmer: internal light variation with white highlight peaks ─
        let shimmerMod = 1
        let shimmerWhite = 0 // 0..1 — how much white highlight to add
        if (shape.shimmer) {
            const s1 = Math.sin(t * 5.3 + x * 0.01)
            const s2 = Math.sin(t * 7.7 + y * 0.01)
            shimmerMod = 0.8 + s1 * 0.12 + s2 * 0.08
            // When both waves peak together, flash white to highlight the shape
            const peak = (s1 + 1) / 2 * (s2 + 1) / 2 // 0..1, high when both peak
            shimmerWhite = Math.pow(peak, 3) * 0.7 // cubic so only the sharpest peaks trigger
        }

        // ── Flicker: brightness fluctuation with occasional white flashes ─
        let flickerMod = 1
        let flickerWhite = 0 // 0..1 — white highlight intensity
        if (shape.flicker) {
            const intensity = shape.flicker_intensity
            const f1 = Math.sin(t * 12.7) * 0.5 + 0.5
            const f2 = Math.sin(t * 8.3 + 2.1) * 0.5 + 0.5
            const combined = f1 * 0.6 + f2 * 0.4
            flickerMod = 1 - intensity * 0.35 * (1 - combined)
            // Sharp white flashes when the flicker wave peaks high
            const flashWave = Math.sin(t * 4.1) * Math.sin(t * 6.7)
            flickerWhite = flashWave > 0.6 ? (flashWave - 0.6) / 0.4 * intensity * 0.9 : 0
        }

        // ── Stretch: configurable horizontal elongation / vertical squeeze ─
        // stretch 0 = no deformation, 1 = maximum wing-like stretching
        const stretchAmount = shape.stretch ?? 0
        const stretchSpd = shape.stretch_speed ?? 0.5
        let stretchX = 1
        let stretchY = 1
        if (stretchAmount > 0) {
            const stretchWave = easeInOutSine((Math.sin(t * stretchSpd * 3) + 1) / 2)
            stretchX = 1 + stretchAmount * stretchWave * 1.2
            stretchY = 1 - stretchAmount * stretchWave * 0.3
        }

        const baseOpacity = shape.opacity * shimmerMod * flickerMod
        const whiteAmount = Math.max(shimmerWhite, flickerWhite) // combined white highlight

        // ── Resolve shape color from gradient palette ────────────────────
        // Lean heavily toward the gradient color; white highlights shift it
        const validColors = (gradientColors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.map(hexToRgb)
        const palettePos = t * 0.08 + x / w * 0.3 + y / h * 0.2
        const sampledRgb = rgbPalette.length > 0 ? samplePalette(rgbPalette, palettePos) : hexToRgb(shape.color)
        const shapeBaseRgb = hexToRgb(shape.color)
        const gradBlend = lerpColor(shapeBaseRgb, sampledRgb, 0.85)
        // Mix toward white during highlight peaks
        const finalRgb = lerpColor(gradBlend, [255, 255, 255], whiteAmount)

        // ── Render as a wide, soft radial glow — no hard shape edges ─────
        const maxStretch = Math.max(stretchX, stretchY)
        const glowRadius = size * maxStretch * 1.8

        // Large ambient glow — the main visible presence of the shape
        const ambientGrad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
        const aAlpha = baseOpacity * (0.14 + brightnessBoost * 0.15 + whiteAmount * 0.2)
        ambientGrad.addColorStop(0, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha})`)
        ambientGrad.addColorStop(0.3, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha * 0.6})`)
        ambientGrad.addColorStop(0.7, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha * 0.15})`)
        ambientGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = ambientGrad
        ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2)
        ctx.restore()

        // Mid-layer shaped glow — diffuse but a touch more visible
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = Math.min(baseOpacity * (0.12 + brightnessBoost * 0.08 + whiteAmount * 0.15), 0.35)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = `rgb(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]})`
        ctx.shadowColor = `rgb(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]})`
        ctx.shadowBlur = size * 1.2
        drawShapePath(ctx, shape.type, size * 1.5)
        ctx.fill()
        ctx.restore()

        // Inner core — a bit more present so the shape is subtly recognisable
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = Math.min(baseOpacity * (0.15 + brightnessBoost * 0.1 + whiteAmount * 0.25), 0.45)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = `rgb(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]})`
        ctx.shadowColor = `rgb(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]})`
        ctx.shadowBlur = size * 0.6
        drawShapePath(ctx, shape.type, size)
        ctx.fill()
        ctx.restore()

        // ── White highlight flash layer ──────────────────────────────────
        // During shimmer/flicker peaks, a bright white shape briefly appears,
        // making the shape pop out of the gradient for a moment
        if (whiteAmount > 0.05) {
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(stretchX, stretchY)
            ctx.globalAlpha = whiteAmount * baseOpacity * 0.5
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = '#fff'
            ctx.shadowColor = '#fff'
            ctx.shadowBlur = size * 0.4
            drawShapePath(ctx, shape.type, size * 0.9)
            ctx.fill()
            ctx.restore()
        }
    }

    function renderGradient(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: GradientConfig) {
        renderGradientBase(ctx, w, h, t, config.colors, config.gradient_speed, config.gradient_angle)
        renderShape(ctx, w, h, t, config.shape, config.colors)

        // Subtle vignette for depth framing
        const vCx = w / 2
        const vCy = h / 2
        const vGrad = ctx.createRadialGradient(vCx, vCy, Math.min(w, h) * 0.35, vCx, vCy, Math.max(w, h) * 0.72)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, 'rgba(0,0,0,0.18)')
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Gradient Aggressive rendering ───────────────────────────────────────
    // Same config as Gradient but everything is cranked up: the shape is bold
    // and clearly visible, white flashes are frequent and intense, contrast is
    // high, and the gradient itself shifts faster with stronger color saturation.

    function renderShapeAggressive(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, shape: GradientConfig['shape'], gradientColors: string[]) {
        if (shape.type === 'none') return

        const cx = w / 2
        const cy = h / 2
        const baseSize = Math.min(w, h) * shape.size
        const speed = shape.movement_speed

        let x: number, y: number
        switch (shape.movement_pattern) {
            case 'bounce': {
                const bx = easeInOutSine((Math.sin(t * speed * 0.6) + 1) / 2)
                const by = easeInOutSine((Math.cos(t * speed * 0.45) + 1) / 2)
                x = cx + (bx - 0.5) * w * 0.5
                y = cy + (by - 0.5) * h * 0.5
                break
            }
            case 'orbit': {
                const orbitR = 0.2 + Math.sin(t * speed * 0.15) * 0.08
                x = cx + Math.cos(t * speed * 0.4) * w * orbitR
                y = cy + Math.sin(t * speed * 0.4) * h * orbitR * 0.7
                break
            }
            default: {
                const d1 = easeInOutSine((Math.sin(t * speed * 0.25) + 1) / 2)
                const d2 = easeInOutSine((Math.cos(t * speed * 0.18) + 1) / 2)
                const d3 = easeInOutSine((Math.sin(t * speed * 0.12 + 1.5) + 1) / 2)
                x = cx + (d1 - 0.5) * w * 0.25 + (d3 - 0.5) * w * 0.1
                y = cy + (d2 - 0.5) * h * 0.25 + (d3 - 0.5) * h * 0.08
            }
        }

        let size = baseSize
        let brightnessBoost = 0
        if (shape.pulse) {
            const pulseWave = easeInOutSine((Math.sin(t * shape.pulse_speed * 1.5) + 1) / 2)
            size *= 0.85 + pulseWave * 0.3
            brightnessBoost = pulseWave * 0.3
        }

        // Shimmer — more intense, brighter white peaks
        let shimmerMod = 1
        let shimmerWhite = 0
        if (shape.shimmer) {
            const s1 = Math.sin(t * 5.3 + x * 0.01)
            const s2 = Math.sin(t * 7.7 + y * 0.01)
            shimmerMod = 0.7 + s1 * 0.18 + s2 * 0.12
            const peak = (s1 + 1) / 2 * (s2 + 1) / 2
            shimmerWhite = Math.pow(peak, 2) * 0.9 // quadratic = triggers more often
        }

        // Flicker — stronger, more frequent white bursts
        let flickerMod = 1
        let flickerWhite = 0
        if (shape.flicker) {
            const intensity = shape.flicker_intensity
            const f1 = Math.sin(t * 12.7) * 0.5 + 0.5
            const f2 = Math.sin(t * 8.3 + 2.1) * 0.5 + 0.5
            const combined = f1 * 0.6 + f2 * 0.4
            flickerMod = 1 - intensity * 0.4 * (1 - combined)
            const flashWave = Math.sin(t * 4.1) * Math.sin(t * 6.7)
            flickerWhite = flashWave > 0.35 ? (flashWave - 0.35) / 0.65 * intensity : 0
        }

        const stretchAmount = shape.stretch ?? 0
        const stretchSpd = shape.stretch_speed ?? 0.5
        let stretchX = 1
        let stretchY = 1
        if (stretchAmount > 0) {
            const stretchWave = easeInOutSine((Math.sin(t * stretchSpd * 3) + 1) / 2)
            stretchX = 1 + stretchAmount * stretchWave * 1.2
            stretchY = 1 - stretchAmount * stretchWave * 0.3
        }

        const baseOpacity = shape.opacity * shimmerMod * flickerMod
        const whiteAmount = Math.max(shimmerWhite, flickerWhite)

        // Color — less gradient blending (65%), shape's own color punches through more
        const validColors = (gradientColors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.map(hexToRgb)
        const palettePos = t * 0.12 + x / w * 0.3 + y / h * 0.2
        const sampledRgb = rgbPalette.length > 0 ? samplePalette(rgbPalette, palettePos) : hexToRgb(shape.color)
        const shapeBaseRgb = hexToRgb(shape.color)
        const gradBlend = lerpColor(shapeBaseRgb, sampledRgb, 0.65)
        const finalRgb = lerpColor(gradBlend, [255, 255, 255], whiteAmount)
        const colorStr = `rgb(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]})`

        const maxStretch = Math.max(stretchX, stretchY)

        // Bold ambient glow — much stronger than normal gradient
        const glowRadius = size * maxStretch * 2.0
        const ambientGrad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
        const aAlpha = baseOpacity * (0.25 + brightnessBoost * 0.2 + whiteAmount * 0.3)
        ambientGrad.addColorStop(0, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha})`)
        ambientGrad.addColorStop(0.25, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha * 0.7})`)
        ambientGrad.addColorStop(0.6, `rgba(${finalRgb[0]},${finalRgb[1]},${finalRgb[2]},${aAlpha * 0.2})`)
        ambientGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = ambientGrad
        ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2)
        ctx.restore()

        // Outer glow shape — visible but soft
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = Math.min(baseOpacity * (0.2 + brightnessBoost * 0.12 + whiteAmount * 0.2), 0.55)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = colorStr
        ctx.shadowColor = colorStr
        ctx.shadowBlur = size * 0.8
        drawShapePath(ctx, shape.type, size * 1.4)
        ctx.fill()
        ctx.restore()

        // Mid shape — clearly recognisable
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = Math.min(baseOpacity * (0.3 + brightnessBoost * 0.15 + whiteAmount * 0.3), 0.7)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = colorStr
        ctx.shadowColor = colorStr
        ctx.shadowBlur = size * 0.4
        drawShapePath(ctx, shape.type, size * 1.1)
        ctx.fill()
        ctx.restore()

        // Core shape — bright, defined
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = Math.min(baseOpacity * (0.4 + brightnessBoost * 0.2 + whiteAmount * 0.35), 0.85)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = colorStr
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = size * 0.2
        drawShapePath(ctx, shape.type, size)
        ctx.fill()
        ctx.restore()

        // White highlight flash — frequent, intense
        if (whiteAmount > 0.03) {
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(stretchX, stretchY)
            ctx.globalAlpha = Math.min(whiteAmount * baseOpacity * 0.8, 0.9)
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = '#fff'
            ctx.shadowColor = '#fff'
            ctx.shadowBlur = size * 0.5
            drawShapePath(ctx, shape.type, size * 0.95)
            ctx.fill()
            ctx.restore()
        }
    }

    function renderGradientAggressive(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: GradientConfig) {
        // Faster, more saturated gradient base
        renderGradientBase(ctx, w, h, t, config.colors, config.gradient_speed, config.gradient_angle)

        // Extra contrast punch — stronger brightness oscillation
        const punch = Math.sin(t * config.gradient_speed * 1.2) * 0.06
        if (punch > 0) {
            ctx.save()
            ctx.globalAlpha = punch
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // Color saturation boost — overlay a vivid version of the dominant color
        const validColors = (config.colors || []).filter(c => c && c.length >= 4)
        if (validColors.length > 0) {
            const rgbPalette = validColors.map(hexToRgb)
            const dominant = samplePalette(rgbPalette, t * 0.05)
            const satGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5)
            satGrad.addColorStop(0, `rgba(${dominant[0]},${dominant[1]},${dominant[2]},0.08)`)
            satGrad.addColorStop(1, 'transparent')
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = satGrad
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        renderShapeAggressive(ctx, w, h, t, config.shape, config.colors)

        // Harder vignette for dramatic contrast
        const vGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.65)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, 'rgba(0,0,0,0.3)')
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Buildup rendering ───────────────────────────────────────────────────
    // Designed for musical tension: all visual elements progressively intensify
    // over the buildup_duration, then reset — creating a "drop-ready" climax.
    //
    // Progress curve uses easeInQuad so escalation feels subtle at first and
    // aggressive toward the peak, matching how musical buildups feel.

    function easeInQuad(x: number): number { return x * x }
    function easeInCubic(x: number): number { return x * x * x }

    function renderBuildup(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: BuildupConfig) {
        const { side_lines, buildup_shape, strobes } = config

        // ── Global buildup progress ──────────────────────────────────────
        // If liveBuildup >= 0, the operator is driving the progression manually.
        // Otherwise fall back to the automatic timer-based cycle.
        const rawProgress = liveBuildup.value >= 0
            ? liveBuildup.value
            : (t / buildup_shape.buildup_duration) % 1
        const p = easeInQuad(rawProgress)        // accelerating curve for most elements

        // ── 1. Vertical gradient base with subtle pulse tied to progress ─
        // The gradient speed increases slightly as we approach the peak
        const dynamicSpeed = config.gradient_speed * (1 + p * 0.6)
        renderGradientBase(ctx, w, h, t, config.colors, dynamicSpeed, config.gradient_angle)

        // Atmospheric pulse overlay — darkens/lightens rhythmically, stronger near peak
        const pulseAmount = 0.03 + p * 0.07
        const pulse = Math.sin(t * (2 + p * 6)) * pulseAmount
        if (pulse > 0) {
            ctx.save()
            ctx.globalAlpha = pulse
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        } else {
            ctx.save()
            ctx.globalAlpha = -pulse
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // ── 2. Side lines — bright lines that travel upward ─────────────
        const baseSweepSpeed = side_lines.sweep_speed * 0.4
        const sweepSpeed = baseSweepSpeed + p * baseSweepSpeed * 2.5
        const beamHeight = h * (0.55 + p * 0.35)
        const beamWidth = side_lines.width * (1.5 + p * 0.8)

        const rgb = hexToRgb(side_lines.color)
        const br = side_lines.brightness

        // Persistent edge glow — always visible, pulses with progress.
        // This anchors the lines even between sweeps.
        const edgeGlowWidth = beamWidth * (1.5 + p * 1)
        const edgeAlpha = br * (0.06 + p * 0.12)
        const edgePulse = 1 + Math.sin(t * 3 + p * 4) * 0.3

        const leftEdge = ctx.createLinearGradient(0, 0, edgeGlowWidth, 0)
        leftEdge.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${edgeAlpha * edgePulse})`)
        leftEdge.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${edgeAlpha * edgePulse * 0.3})`)
        leftEdge.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = leftEdge
        ctx.fillRect(0, 0, edgeGlowWidth, h)
        ctx.restore()

        const rightEdge = ctx.createLinearGradient(w, 0, w - edgeGlowWidth, 0)
        rightEdge.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${edgeAlpha * edgePulse})`)
        rightEdge.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${edgeAlpha * edgePulse * 0.3})`)
        rightEdge.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = rightEdge
        ctx.fillRect(w - edgeGlowWidth, 0, edgeGlowWidth, h)
        ctx.restore()

        // Sweeping line layers — primary, secondary, and a faint third
        const lineLayers = [
            { offset: 0, alpha: br * (0.8 + p * 0.2) },
            { offset: 0.35, alpha: br * (0.3 + p * 0.25) },
            { offset: 0.65, alpha: br * (0.1 + p * 0.15) },
        ]

        for (const layer of lineLayers) {
            const sweepPhase = ((t * sweepSpeed) + layer.offset) % 1
            const yPos = h - sweepPhase * (h + beamHeight)

            ctx.save()
            ctx.globalCompositeOperation = 'screen'

            // White-hot core line
            const coreWidth = Math.max(beamWidth * 0.2, 3)
            const coreGrad = ctx.createLinearGradient(0, yPos + beamHeight, 0, yPos)
            const coreAlpha = Math.min(layer.alpha * 1.5, 1)
            coreGrad.addColorStop(0, 'transparent')
            coreGrad.addColorStop(0.15, `rgba(255,255,255,${coreAlpha * 0.5})`)
            coreGrad.addColorStop(0.4, `rgba(255,255,255,${coreAlpha})`)
            coreGrad.addColorStop(0.6, `rgba(255,255,255,${coreAlpha})`)
            coreGrad.addColorStop(0.85, `rgba(255,255,255,${coreAlpha * 0.5})`)
            coreGrad.addColorStop(1, 'transparent')
            ctx.fillStyle = coreGrad
            ctx.fillRect(beamWidth * 0.5 - coreWidth * 0.5, yPos, coreWidth, beamHeight)
            ctx.fillRect(w - beamWidth * 0.5 - coreWidth * 0.5, yPos, coreWidth, beamHeight)

            // Colored glow around the core — boosted
            const glowGrad = ctx.createLinearGradient(0, yPos + beamHeight, 0, yPos)
            const glowAlpha = Math.min(layer.alpha * 1.2, 1)
            glowGrad.addColorStop(0, 'transparent')
            glowGrad.addColorStop(0.1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha * 0.4})`)
            glowGrad.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha})`)
            glowGrad.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha})`)
            glowGrad.addColorStop(0.9, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glowAlpha * 0.4})`)
            glowGrad.addColorStop(1, 'transparent')
            ctx.fillStyle = glowGrad
            ctx.fillRect(0, yPos, beamWidth, beamHeight)
            ctx.fillRect(w - beamWidth, yPos, beamWidth, beamHeight)

            // Wider halo — boosted
            const haloGrad = ctx.createLinearGradient(0, yPos + beamHeight, 0, yPos)
            haloGrad.addColorStop(0, 'transparent')
            haloGrad.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${layer.alpha * 0.2})`)
            haloGrad.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${layer.alpha * 0.2})`)
            haloGrad.addColorStop(1, 'transparent')
            ctx.fillStyle = haloGrad
            ctx.fillRect(0, yPos, beamWidth * 3, beamHeight)
            ctx.fillRect(w - beamWidth * 3, yPos, beamWidth * 3, beamHeight)

            ctx.restore()
        }

        // ── 3. Central core shape — organic blob that grows with pressure ──
        const scaleProgress = easeInQuad(rawProgress)
        const minScale = 0.08
        const scale = minScale + scaleProgress * (buildup_shape.max_scale - minScale)
        const shapeSize = Math.min(w, h) * 0.12 * scale
        const cx = w / 2
        const cy = h / 2

        // Shape picks up gradient colors blended with its configured color
        const buValidColors = (config.colors || []).filter(c => c && c.length >= 4)
        const buPalette = buValidColors.map(hexToRgb)
        const buSampled = buPalette.length > 0 ? samplePalette(buPalette, t * 0.1) : hexToRgb(buildup_shape.color)
        const buBaseRgb = hexToRgb(buildup_shape.color)
        const buFinalRgb = lerpColor(buBaseRgb, buSampled, 0.45)
        const buColorStr = `rgb(${buFinalRgb[0]},${buFinalRgb[1]},${buFinalRgb[2]})`

        // Stretch increases with progress, scaled by configurable stretch amount
        const buStretchAmt = buildup_shape.stretch ?? 0.5
        const buStretchX = 1 + p * buStretchAmt * 0.6
        const buStretchY = 1 - p * buStretchAmt * 0.2

        // Additive glow layers using clean shapes + canvas transforms
        const glowLayers = [
            { sizeMultiplier: 2.8, alpha: 0.06 + p * 0.08 },
            { sizeMultiplier: 2.0, alpha: 0.1 + p * 0.12 },
            { sizeMultiplier: 1.4, alpha: 0.2 + p * 0.2 },
            { sizeMultiplier: 1.0, alpha: 0.5 + p * 0.45 },
        ]

        for (const layer of glowLayers) {
            const s = shapeSize * layer.sizeMultiplier
            ctx.save()
            ctx.translate(cx, cy)
            ctx.scale(buStretchX, buStretchY)
            ctx.globalAlpha = layer.alpha
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = buColorStr
            ctx.shadowColor = buColorStr
            ctx.shadowBlur = s * 0.6
            drawShapePath(ctx, buildup_shape.type, s)
            ctx.fill()
            ctx.restore()
        }

        // Core shape pulsation — heartbeat that speeds up with progress
        const coreBreathRate = 3 + p * 12
        const coreBreathe = 1 + Math.sin(t * coreBreathRate) * (0.02 + p * 0.06)
        const coreSize = shapeSize * coreBreathe

        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(buStretchX, buStretchY)
        ctx.globalAlpha = 0.7 + p * 0.3
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = buColorStr
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = coreSize * 0.3
        drawShapePath(ctx, buildup_shape.type, coreSize)
        ctx.fill()
        ctx.restore()

        // ── 4. Strobe flashes — escalating from subtle to aggressive ─────
        if (strobes.enabled) {
            // Strobes only start appearing after ~20% progress
            const strobeOnset = Math.max(0, (rawProgress - 0.2) / 0.8)
            if (strobeOnset > 0) {
                const strobeP = easeInCubic(strobeOnset) // cubic for very aggressive ramp

                // Frequency: starts slow and spaced out, becomes rapid near peak
                const baseFreq = strobes.frequency * 2
                const freq = baseFreq + strobeP * 18

                // Use a sharp sine threshold — higher threshold = more sporadic
                // As progress increases the threshold drops = more frequent flashes
                const threshold = 0.95 - strobeP * 0.55
                const flash = Math.sin(t * freq * Math.PI * 2)

                if (flash > threshold) {
                    // Intensity grows: subtle early on, blinding near peak
                    const flashAlpha = strobes.intensity * (0.15 + strobeP * 0.85)

                    // Near the peak (>80% progress) add rapid-fire double/triple flashes
                    const isNearPeak = rawProgress > 0.8
                    const rapidFlash = isNearPeak ? Math.sin(t * freq * 3 * Math.PI * 2) > 0.3 : false

                    ctx.save()
                    ctx.globalCompositeOperation = 'screen'
                    ctx.globalAlpha = rapidFlash ? Math.min(flashAlpha * 1.3, 1) : flashAlpha
                    ctx.fillStyle = '#fff'
                    ctx.fillRect(0, 0, w, h)
                    ctx.restore()

                    // Contrast recovery — brief dark frame after bright flash for sharpness
                    if (flashAlpha > 0.5) {
                        ctx.save()
                        ctx.globalAlpha = flashAlpha * 0.1
                        ctx.fillStyle = '#000'
                        ctx.fillRect(0, 0, w, h)
                        ctx.restore()
                    }
                }
            }
        }

        // ── 5. Vignette that recedes as energy builds ────────────────────
        // Dark edges at the start give tunnel-vision atmosphere; they open up at peak
        const vignetteStrength = 0.35 - p * 0.25
        if (vignetteStrength > 0.01) {
            const vGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.75)
            vGrad.addColorStop(0, 'transparent')
            vGrad.addColorStop(1, `rgba(0,0,0,${vignetteStrength})`)
            ctx.save()
            ctx.fillStyle = vGrad
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }
    }

    // ── Text rendering ──────────────────────────────────────────────────────
    function renderText(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: TextConfig) {
        renderGradientBase(ctx, w, h, t, config.colors, config.gradient_speed, config.gradient_angle)

        // Side lines
        const sl = config.side_lines
        if (sl?.enabled !== false) {
            const slRgb = hexToRgb(sl?.color || '#ffffff')
            const slWidth = w * (0.02 + (sl?.width ?? 0.5) * 0.06)
            const slBright = sl?.brightness ?? 0.5
            const slAnim = sl?.animation ?? 'pulse'

            if (slAnim === 'upbeam') {
                // Up-beam: lines travel from bottom to top, like buildup but simpler
                const beamSpd = sl?.beam_speed ?? 0.5
                const sweepSpeed = 0.2 + beamSpd * 0.8
                const beamH = h * 0.5
                const slAlpha = slBright * 0.8

                const layers = [
                    { offset: 0, alpha: slAlpha },
                    { offset: 0.4, alpha: slAlpha * 0.35 },
                ]

                for (const layer of layers) {
                    const phase = ((t * sweepSpeed) + layer.offset) % 1
                    const yPos = h - phase * (h + beamH)

                    ctx.save()
                    ctx.globalCompositeOperation = 'screen'

                    // Colored glow
                    const glowGrad = ctx.createLinearGradient(0, yPos + beamH, 0, yPos)
                    glowGrad.addColorStop(0, 'transparent')
                    glowGrad.addColorStop(0.2, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${layer.alpha * 0.4})`)
                    glowGrad.addColorStop(0.5, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${layer.alpha})`)
                    glowGrad.addColorStop(0.8, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${layer.alpha * 0.4})`)
                    glowGrad.addColorStop(1, 'transparent')
                    ctx.fillStyle = glowGrad
                    ctx.fillRect(0, yPos, slWidth, beamH)
                    ctx.fillRect(w - slWidth, yPos, slWidth, beamH)

                    // White core
                    const coreW = Math.max(slWidth * 0.2, 2)
                    const coreGrad = ctx.createLinearGradient(0, yPos + beamH, 0, yPos)
                    coreGrad.addColorStop(0, 'transparent')
                    coreGrad.addColorStop(0.3, `rgba(255,255,255,${layer.alpha * 0.5})`)
                    coreGrad.addColorStop(0.5, `rgba(255,255,255,${layer.alpha * 0.9})`)
                    coreGrad.addColorStop(0.7, `rgba(255,255,255,${layer.alpha * 0.5})`)
                    coreGrad.addColorStop(1, 'transparent')
                    ctx.fillStyle = coreGrad
                    ctx.fillRect(slWidth * 0.5 - coreW * 0.5, yPos, coreW, beamH)
                    ctx.fillRect(w - slWidth * 0.5 - coreW * 0.5, yPos, coreW, beamH)

                    ctx.restore()
                }
            } else {
                // Pulse: static glow that pulses in brightness
                const slPulseSpd = sl?.pulse_speed ?? 0.5
                const slPulse = 0.7 + Math.sin(t * (0.5 + slPulseSpd * 2.5)) * 0.3
                const slAlpha = slBright * 0.8 * slPulse

                const leftGrad = ctx.createLinearGradient(0, 0, slWidth * 2.5, 0)
                leftGrad.addColorStop(0, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${slAlpha})`)
                leftGrad.addColorStop(0.3, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${slAlpha * 0.4})`)
                leftGrad.addColorStop(1, 'transparent')
                ctx.save()
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = leftGrad
                ctx.fillRect(0, 0, slWidth * 2.5, h)
                ctx.restore()

                const rightGrad = ctx.createLinearGradient(w, 0, w - slWidth * 2.5, 0)
                rightGrad.addColorStop(0, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${slAlpha})`)
                rightGrad.addColorStop(0.3, `rgba(${slRgb[0]},${slRgb[1]},${slRgb[2]},${slAlpha * 0.4})`)
                rightGrad.addColorStop(1, 'transparent')
                ctx.save()
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = rightGrad
                ctx.fillRect(w - slWidth * 2.5, 0, slWidth * 2.5, h)
                ctx.restore()
            }
        }

        const { text } = config
        if (!text.content) return

        const fontSize = Math.min(w, h) * text.size * 0.5
        const fontStr = `400 ${fontSize}px "Matter-Regular", "Inter", sans-serif`
        const tx = w / 2
        const ty = h / 2

        let opacity = text.opacity
        if (text.animation === 'pulse') {
            opacity *= 0.5 + Math.sin(t * 2) * 0.5
        }

        const textRgb = hexToRgb(text.color)
        const isShimmer = text.animation === 'shimmer'
        const isFlicker = text.animation === 'flicker'

        if (!isShimmer && !isFlicker) {
            // Standard text rendering (none / pulse)
            ctx.save()
            ctx.globalAlpha = opacity
            ctx.fillStyle = text.color
            ctx.font = fontStr
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.shadowColor = text.color
            ctx.shadowBlur = fontSize * 0.15
            ctx.fillText(text.content, tx, ty)
            ctx.restore()
            return
        }

        // ── Flicker text rendering ───────────────────────────────────────
        // Multi-layered flicker: the text breathes between dim and bright,
        // with occasional white flashes, color shifts through the palette,
        // and a pulsing glow. Smoothness controls how gradual vs. snappy
        // the transitions feel.
        if (isFlicker) {
            const fSpeed = text.flicker_speed ?? 0.5
            const fSmooth = text.flicker_smoothness ?? 0.5
            const fIntensity = text.flicker_intensity ?? 0.7
            const fColorShift = text.flicker_color_shift ?? 0.3

            const validColors = (config.colors || []).filter(c => c && c.length >= 4)
            const rgbPalette = validColors.length > 0 ? validColors.map(hexToRgb) : [textRgb]

            // Multiple overlapping sine waves at different frequencies create
            // an organic, non-repeating flicker pattern. Smoothness blends
            // between sharp (near-square-wave) and gentle (pure sine).
            const rate = 3 + fSpeed * 15
            const raw1 = Math.sin(t * rate)
            const raw2 = Math.sin(t * rate * 1.73 + 1.3)
            const raw3 = Math.sin(t * rate * 0.67 + 2.7)
            const combined = raw1 * 0.5 + raw2 * 0.3 + raw3 * 0.2 // -1..1

            // Smoothness: lerp between the raw sine and a sharpened version
            const sharp = combined > 0 ? 1 : -1
            const shaped = sharp * (1 - fSmooth) + combined * fSmooth // -1..1
            const normalized = (shaped + 1) / 2 // 0..1

            // Brightness oscillation: text dims and brightens
            const minBright = 0.25 - fIntensity * 0.15
            const flickerBright = minBright + normalized * (1 - minBright)

            // Color shift: drift through the palette over time
            const paletteSample = samplePalette(rgbPalette, t * fSpeed * 0.3)
            const shiftedColor = lerpColor(textRgb, paletteSample, fColorShift * normalized)

            // Glow size pulses with the flicker
            const glowSize = fontSize * (0.1 + normalized * 0.25)

            // Layer 1: Main text with flickering brightness and color
            ctx.save()
            ctx.globalAlpha = opacity * flickerBright
            ctx.fillStyle = `rgb(${shiftedColor[0]},${shiftedColor[1]},${shiftedColor[2]})`
            ctx.font = fontStr
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.shadowColor = `rgb(${shiftedColor[0]},${shiftedColor[1]},${shiftedColor[2]})`
            ctx.shadowBlur = glowSize
            ctx.fillText(text.content, tx, ty)
            ctx.restore()

            // Layer 2: White flash peaks — when the combined wave is very high
            const flashThreshold = 0.75
            if (normalized > flashThreshold) {
                const flashStrength = (normalized - flashThreshold) / (1 - flashThreshold)
                const eFlash = flashStrength * flashStrength // quadratic for snappy pop

                // White text overlay
                ctx.save()
                ctx.globalAlpha = opacity * eFlash * fIntensity * 0.7
                ctx.fillStyle = '#fff'
                ctx.font = fontStr
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.shadowColor = '#fff'
                ctx.shadowBlur = fontSize * 0.3
                ctx.fillText(text.content, tx, ty)
                ctx.restore()

                // Background glow burst
                const burstRadius = fontSize * 1.2
                const burstGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, burstRadius)
                burstGrad.addColorStop(0, `rgba(${shiftedColor[0]},${shiftedColor[1]},${shiftedColor[2]},${eFlash * fIntensity * 0.12})`)
                burstGrad.addColorStop(0.5, `rgba(${shiftedColor[0]},${shiftedColor[1]},${shiftedColor[2]},${eFlash * fIntensity * 0.04})`)
                burstGrad.addColorStop(1, 'transparent')
                ctx.save()
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = burstGrad
                ctx.fillRect(tx - burstRadius, ty - burstRadius, burstRadius * 2, burstRadius * 2)
                ctx.restore()
            }

            // Layer 3: Subtle ambient glow that's always present
            const ambientRadius = fontSize * 0.7
            const ambientGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, ambientRadius)
            ambientGrad.addColorStop(0, `rgba(${shiftedColor[0]},${shiftedColor[1]},${shiftedColor[2]},${flickerBright * 0.06})`)
            ambientGrad.addColorStop(1, 'transparent')
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = ambientGrad
            ctx.fillRect(tx - ambientRadius, ty - ambientRadius, ambientRadius * 2, ambientRadius * 2)
            ctx.restore()

            return
        }

        // ── Shimmer text rendering below ─────────────────────────────────
        const shimSpeed = text.shimmer_speed ?? 0.5
        const shimWidth = text.shimmer_width ?? 0.5
        const shimIntensity = text.shimmer_intensity ?? 0.7
        const shimColorHex = text.shimmer_color ?? '#ffffff'

        // ── Shimmer text rendering ───────────────────────────────────────
        // The text is filled with a gradient that samples the palette colors
        // and shifts over time. A bright wave sweeps across, and the areas
        // outside the wave show a muted version of the gradient. The wave
        // itself blazes bright with the shimmer color + a white-hot core.

        const shimRgb = hexToRgb(shimColorHex)
        const validColors = (config.colors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.length > 0 ? validColors.map(hexToRgb) : [textRgb]

        ctx.save()
        ctx.font = fontStr
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const metrics = ctx.measureText(text.content)
        const textW = metrics.width
        const textLeft = tx - textW / 2
        ctx.restore()

        // Wave position
        const waveW = textW * (0.2 + shimWidth * 0.6)
        const totalTravel = textW + waveW * 3
        const cycle = 2 + (1 - shimSpeed) * 4
        const phase = ((t / cycle) % 1)
        const eased = easeInOutSine(phase)
        const waveCenter = textLeft - waveW * 1.5 + eased * totalTravel

        // ── Layer 1: Muted base text with animated gradient fill ─────
        // The text has a soft gradient from the palette that shifts over time,
        // giving it color even outside the shimmer wave
        const baseGrad = ctx.createLinearGradient(textLeft, 0, textLeft + textW, 0)
        const shift = t * 0.15
        const STOPS = 8
        for (let i = 0; i <= STOPS; i++) {
            const frac = i / STOPS
            const c = samplePalette(rgbPalette, frac + shift)
            // Muted: mix toward darker version
            const muted: [number, number, number] = [
                Math.round(c[0] * 0.5),
                Math.round(c[1] * 0.5),
                Math.round(c[2] * 0.5),
            ]
            baseGrad.addColorStop(frac, `rgb(${muted[0]},${muted[1]},${muted[2]})`)
        }

        ctx.save()
        ctx.globalAlpha = opacity * 0.6
        ctx.fillStyle = baseGrad
        ctx.font = fontStr
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = `rgba(${textRgb[0]},${textRgb[1]},${textRgb[2]},0.4)`
        ctx.shadowBlur = fontSize * 0.2
        ctx.fillText(text.content, tx, ty)
        ctx.restore()

        // ── Layer 2: Shimmer wave — bright colored sweep ─────────────
        // A gradient that's transparent outside the wave, and bright inside
        const waveGrad = ctx.createLinearGradient(
            waveCenter - waveW * 1.2, 0,
            waveCenter + waveW * 1.2, 0,
        )
        waveGrad.addColorStop(0, 'transparent')
        waveGrad.addColorStop(0.15, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.1})`)
        waveGrad.addColorStop(0.35, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.6})`)
        waveGrad.addColorStop(0.5, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity})`)
        waveGrad.addColorStop(0.65, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.6})`)
        waveGrad.addColorStop(0.85, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.1})`)
        waveGrad.addColorStop(1, 'transparent')

        ctx.save()
        ctx.globalAlpha = opacity
        ctx.fillStyle = waveGrad
        ctx.font = fontStr
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text.content, tx, ty)
        ctx.restore()

        // ── Layer 3: White-hot core at the wave center ───────────────
        // A very narrow, intense white highlight at the peak of the wave
        const coreW = waveW * 0.35
        const coreGrad = ctx.createLinearGradient(
            waveCenter - coreW, 0,
            waveCenter + coreW, 0,
        )
        coreGrad.addColorStop(0, 'transparent')
        coreGrad.addColorStop(0.3, `rgba(255,255,255,${shimIntensity * 0.3})`)
        coreGrad.addColorStop(0.5, `rgba(255,255,255,${shimIntensity * 0.9})`)
        coreGrad.addColorStop(0.7, `rgba(255,255,255,${shimIntensity * 0.3})`)
        coreGrad.addColorStop(1, 'transparent')

        ctx.save()
        ctx.globalAlpha = opacity
        ctx.fillStyle = coreGrad
        ctx.font = fontStr
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text.content, tx, ty)
        ctx.restore()

        // ── Layer 4: Glow halo around the wave ───────────────────────
        // A soft, wide glow behind the text near the wave position,
        // creating a sense of light spilling out
        const glowRadius = fontSize * 0.8
        const glowGrad = ctx.createRadialGradient(
            waveCenter, ty, 0,
            waveCenter, ty, glowRadius,
        )
        glowGrad.addColorStop(0, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.15})`)
        glowGrad.addColorStop(0.5, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.05})`)
        glowGrad.addColorStop(1, 'transparent')

        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = glowGrad
        ctx.fillRect(waveCenter - glowRadius, ty - glowRadius, glowRadius * 2, glowRadius * 2)
        ctx.restore()

        // ── Layer 5: Trailing sparkle — a faint secondary wave ───────
        const trail1Center = waveCenter - waveW * 1.5
        const trail1Grad = ctx.createLinearGradient(
            trail1Center - waveW * 0.4, 0,
            trail1Center + waveW * 0.4, 0,
        )
        trail1Grad.addColorStop(0, 'transparent')
        trail1Grad.addColorStop(0.5, `rgba(${shimRgb[0]},${shimRgb[1]},${shimRgb[2]},${shimIntensity * 0.2})`)
        trail1Grad.addColorStop(1, 'transparent')

        ctx.save()
        ctx.globalAlpha = opacity * 0.4
        ctx.fillStyle = trail1Grad
        ctx.font = fontStr
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text.content, tx, ty)
        ctx.restore()
    }

    // ── Spotlights rendering ────────────────────────────────────────────────
    // Beams of light originating from the bottom of the screen, pointing
    // upward like stage headlights / sky searchlights. Each beam sweeps
    // independently, with volumetric haze glow and color variety.

    function renderSpotlights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: SpotlightsConfig) {
        // Dark background
        const bg = hexToRgb(config.background_color || '#0a0a1a')
        ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`
        ctx.fillRect(0, 0, w, h)

        // Background shape (behind the beams)
        if (config.shape?.type && config.shape.type !== 'none') {
            renderShape(ctx, w, h, t, config.shape, config.beam_colors || [])
        }

        const count = config.beam_count || 4
        const validColors = (config.beam_colors || []).filter(c => c && c.length >= 4)
        const rgbColors = validColors.length > 0 ? validColors.map(hexToRgb) : [[255, 255, 255] as [number, number, number]]
        const speed = config.beam_speed || 0.5
        const brightness = config.beam_brightness || 0.8
        const beamWidth = config.beam_width || 0.4
        const spread = config.beam_spread || 0.6
        const haze = config.haze || 0.5

        // Each beam has a unique origin at the bottom and sweeps at its own rate
        for (let i = 0; i < count; i++) {
            const seed = i * 2.39996 + 0.5 // golden-ratio-ish offset for even distribution

            // Origin — spread along the bottom edge
            const originX = w * (0.15 + 0.7 * (i / Math.max(count - 1, 1)))
            const originY = h + h * 0.05 // slightly below bottom edge

            // Beam angle — sweeps side to side with unique phase
            const baseAngle = -Math.PI / 2 // pointing straight up
            const sweepRange = spread * Math.PI * 0.4
            const sweepPhase = Math.sin(t * speed * 0.7 + seed * 3.1) * Math.cos(t * speed * 0.4 + seed * 1.7)
            const angle = baseAngle + sweepPhase * sweepRange

            // Beam color — cycle through palette
            const colorIdx = i % rgbColors.length
            const beamRgb = rgbColors[colorIdx]!
            // Slight color shift over time
            const shift = Math.sin(t * 0.3 + seed) * 0.15
            const nextColorIdx = (colorIdx + 1) % rgbColors.length
            const shiftedRgb = lerpColor(beamRgb, rgbColors[nextColorIdx]!, Math.abs(shift))

            // Beam geometry — a triangle from origin fanning out
            const beamLen = Math.max(w, h) * 1.4
            const halfWidth = beamWidth * 0.5 * beamLen * 0.15 // width at the far end
            const tipX = originX + Math.cos(angle) * beamLen
            const tipY = originY + Math.sin(angle) * beamLen
            const perpX = -Math.sin(angle)
            const perpY = Math.cos(angle)

            // Volumetric beam — gradient from origin (bright) to tip (transparent)
            const beamGrad = ctx.createLinearGradient(originX, originY, tipX, tipY)
            const alpha = brightness * (0.15 + Math.sin(t * 1.3 + seed * 2) * 0.04)
            beamGrad.addColorStop(0, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${alpha})`)
            beamGrad.addColorStop(0.3, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${alpha * 0.7})`)
            beamGrad.addColorStop(0.7, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${alpha * 0.2})`)
            beamGrad.addColorStop(1, 'transparent')

            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = beamGrad
            ctx.beginPath()
            ctx.moveTo(originX, originY)
            ctx.lineTo(tipX + perpX * halfWidth, tipY + perpY * halfWidth)
            ctx.lineTo(tipX - perpX * halfWidth, tipY - perpY * halfWidth)
            ctx.closePath()
            ctx.fill()
            ctx.restore()

            // Wider soft haze around the beam — atmospheric scattering
            if (haze > 0) {
                const hazeGrad = ctx.createLinearGradient(originX, originY, tipX, tipY)
                const hazeAlpha = haze * brightness * 0.06
                hazeGrad.addColorStop(0, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${hazeAlpha})`)
                hazeGrad.addColorStop(0.5, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${hazeAlpha * 0.4})`)
                hazeGrad.addColorStop(1, 'transparent')

                ctx.save()
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = hazeGrad
                ctx.beginPath()
                ctx.moveTo(originX, originY)
                ctx.lineTo(tipX + perpX * halfWidth * 3, tipY + perpY * halfWidth * 3)
                ctx.lineTo(tipX - perpX * halfWidth * 3, tipY - perpY * halfWidth * 3)
                ctx.closePath()
                ctx.fill()
                ctx.restore()
            }

            // Bright hotspot at origin — the "lamp" source
            const hotspotSize = Math.min(w, h) * 0.04
            const hotGrad = ctx.createRadialGradient(originX, originY, 0, originX, originY, hotspotSize)
            hotGrad.addColorStop(0, `rgba(255,255,255,${brightness * 0.5})`)
            hotGrad.addColorStop(0.3, `rgba(${shiftedRgb[0]},${shiftedRgb[1]},${shiftedRgb[2]},${brightness * 0.3})`)
            hotGrad.addColorStop(1, 'transparent')
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = hotGrad
            ctx.fillRect(originX - hotspotSize, originY - hotspotSize, hotspotSize * 2, hotspotSize * 2)
            ctx.restore()
        }

        // Global atmospheric haze — subtle fog that catches the light
        if (haze > 0.2) {
            const fogAlpha = (haze - 0.2) * 0.04
            ctx.save()
            ctx.globalAlpha = fogAlpha
            ctx.fillStyle = '#8899aa'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // Subtle vignette
        const vGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, 'rgba(0,0,0,0.25)')
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Drop rendering ─────────────────────────────────────────────────────
    // Maximum energy: fast-moving shapes flash across the screen with strobes,
    // rapid color changes, and intense visual chaos. This is the payoff after
    // the buildup — pure release.

    function renderDrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: DropConfig) {
        const validColors = (config.colors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.length > 0 ? validColors.map(hexToRgb) : [[255, 0, 100] as [number, number, number]]
        const speed = config.speed || 0.7
        const energy = config.energy || 0.8
        const shapeType = config.shape_type || 'circle'
        const shapeSize = config.shape_size || 0.6

        // ── Gradient background that cycles through colors fast ──────────
        renderGradientBase(ctx, w, h, t, config.colors, speed * 2, t * 30)

        // Energy pulse — background flashes brighter on the beat
        const beatRate = speed * 6
        const beat = Math.pow(Math.max(0, Math.sin(t * beatRate)), 4) * energy
        if (beat > 0.01) {
            ctx.save()
            ctx.globalAlpha = beat * 0.2
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // ── One big central shape that flashes and pulses ────────────────
        const cx = w / 2
        const cy = h / 2
        const baseS = Math.min(w, h) * shapeSize

        // Size pulses hard with the beat
        const sizePulse = 1 + beat * 0.5 + Math.sin(t * speed * 4) * 0.15
        const s = baseS * sizePulse

        // Color cycles through palette rapidly
        const shapeColor = samplePalette(rgbPalette, t * speed * 1.5)
        const colorStr = `rgb(${shapeColor[0]},${shapeColor[1]},${shapeColor[2]})`

        // The shape flashes between its color and white on the beat
        const whiteness = beat * 0.7
        const flashedColor = lerpColor(shapeColor, [255, 255, 255], whiteness)
        const flashedStr = `rgb(${flashedColor[0]},${flashedColor[1]},${flashedColor[2]})`

        // Outer glow — large, soft, colored
        ctx.save()
        ctx.translate(cx, cy)
        ctx.globalAlpha = (0.15 + energy * 0.15 + beat * 0.2)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = colorStr
        ctx.shadowColor = colorStr
        ctx.shadowBlur = s * 0.8
        drawShapePath(ctx, shapeType, s * 2.2)
        ctx.fill()
        ctx.restore()

        // Mid layer
        ctx.save()
        ctx.translate(cx, cy)
        ctx.globalAlpha = (0.25 + energy * 0.2 + beat * 0.3)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = flashedStr
        ctx.shadowColor = flashedStr
        ctx.shadowBlur = s * 0.4
        drawShapePath(ctx, shapeType, s * 1.4)
        ctx.fill()
        ctx.restore()

        // Core — bright, sharp
        ctx.save()
        ctx.translate(cx, cy)
        ctx.globalAlpha = (0.4 + energy * 0.3 + beat * 0.3)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = flashedStr
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = s * 0.2
        drawShapePath(ctx, shapeType, s)
        ctx.fill()
        ctx.restore()

        // White flash on beat peaks
        if (beat > 0.3) {
            const flashAlpha = (beat - 0.3) / 0.7 * energy * 0.7
            ctx.save()
            ctx.translate(cx, cy)
            ctx.globalAlpha = flashAlpha
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = '#fff'
            ctx.shadowColor = '#fff'
            ctx.shadowBlur = s * 0.6
            drawShapePath(ctx, shapeType, s * 0.9)
            ctx.fill()
            ctx.restore()
        }

        // ── Optional strobes ─────────────────────────────────────────────
        if (config.strobes_enabled) {
            const strobeRate = config.strobe_rate || 0.6
            const strobeIntensity = config.strobe_intensity || 0.7
            const strobeFreq = 4 + strobeRate * 12
            const strobe = Math.sin(t * strobeFreq * Math.PI * 2)
            const threshold = 0.7 - strobeIntensity * 0.3
            if (strobe > threshold) {
                const flashAlpha = (strobe - threshold) / (1 - threshold) * strobeIntensity * 0.4
                ctx.save()
                ctx.globalAlpha = flashAlpha
                ctx.fillStyle = '#fff'
                ctx.fillRect(0, 0, w, h)
                ctx.restore()
            }
        }

        // Vignette
        const vGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.7)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, 'rgba(0,0,0,0.25)')
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── After-Drop rendering ───────────────────────────────────────────────
    // Same energy as Drop but the shape stretches instead of pulsing —
    // wing-like horizontal elongation driven by configurable stretch params.

    function renderAfterDrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: AfterDropConfig) {
        const validColors = (config.colors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.length > 0 ? validColors.map(hexToRgb) : [[255, 0, 100] as [number, number, number]]
        const speed = config.speed || 0.7
        const energy = config.energy || 0.8
        const shapeType = config.shape_type || 'circle'
        const shapeSize = config.shape_size || 0.6
        const stretchAmount = config.stretch ?? 0.6
        const stretchSpd = config.stretch_speed ?? 0.7

        // Gradient background — same as drop
        renderGradientBase(ctx, w, h, t, config.colors, speed * 2, t * 30)

        // Energy pulse on beat
        const beatRate = speed * 6
        const beat = Math.pow(Math.max(0, Math.sin(t * beatRate)), 4) * energy
        if (beat > 0.01) {
            ctx.save()
            ctx.globalAlpha = beat * 0.2
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // ── Central shape with stretch instead of pulse ──────────────────
        const cx = w / 2
        const cy = h / 2
        const s = Math.min(w, h) * shapeSize

        // Stretch: same system as gradient mode shapes
        let stretchX = 1
        let stretchY = 1
        if (stretchAmount > 0) {
            const stretchWave = easeInOutSine((Math.sin(t * stretchSpd * 3) + 1) / 2)
            stretchX = 1 + stretchAmount * stretchWave * 1.2
            stretchY = 1 - stretchAmount * stretchWave * 0.3
        }

        // Color cycles through palette
        const shapeColor = samplePalette(rgbPalette, t * speed * 1.5)
        const whiteness = beat * 0.5
        const flashedColor = lerpColor(shapeColor, [255, 255, 255], whiteness)
        const colorStr = `rgb(${shapeColor[0]},${shapeColor[1]},${shapeColor[2]})`
        const flashedStr = `rgb(${flashedColor[0]},${flashedColor[1]},${flashedColor[2]})`

        // Outer glow
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = (0.15 + energy * 0.15 + beat * 0.15)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = colorStr
        ctx.shadowColor = colorStr
        ctx.shadowBlur = s * 0.8
        drawShapePath(ctx, shapeType, s * 2.2)
        ctx.fill()
        ctx.restore()

        // Mid layer
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = (0.25 + energy * 0.2 + beat * 0.2)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = flashedStr
        ctx.shadowColor = flashedStr
        ctx.shadowBlur = s * 0.4
        drawShapePath(ctx, shapeType, s * 1.4)
        ctx.fill()
        ctx.restore()

        // Core
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(stretchX, stretchY)
        ctx.globalAlpha = (0.4 + energy * 0.3 + beat * 0.2)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = flashedStr
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = s * 0.2
        drawShapePath(ctx, shapeType, s)
        ctx.fill()
        ctx.restore()

        // White flash on beat peaks
        if (beat > 0.3) {
            const flashAlpha = (beat - 0.3) / 0.7 * energy * 0.5
            ctx.save()
            ctx.translate(cx, cy)
            ctx.scale(stretchX, stretchY)
            ctx.globalAlpha = flashAlpha
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = '#fff'
            ctx.shadowColor = '#fff'
            ctx.shadowBlur = s * 0.6
            drawShapePath(ctx, shapeType, s * 0.9)
            ctx.fill()
            ctx.restore()
        }

        // Optional strobes
        if (config.strobes_enabled) {
            const strobeRate = config.strobe_rate || 0.6
            const strobeIntensity = config.strobe_intensity || 0.7
            const strobeFreq = 4 + strobeRate * 12
            const strobe = Math.sin(t * strobeFreq * Math.PI * 2)
            const threshold = 0.7 - strobeIntensity * 0.3
            if (strobe > threshold) {
                const flashAlpha = (strobe - threshold) / (1 - threshold) * strobeIntensity * 0.4
                ctx.save()
                ctx.globalAlpha = flashAlpha
                ctx.fillStyle = '#fff'
                ctx.fillRect(0, 0, w, h)
                ctx.restore()
            }
        }

        // Vignette
        const vGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.7)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, 'rgba(0,0,0,0.25)')
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Vivid rendering ────────────────────────────────────────────────────
    // A dynamic canvas of light: soft fluid gradient mesh with no hard edges,
    // a central glowing hotspot, and heavy bloom. Simulates Perlin-noise-like
    // organic movement using overlapping radial gradients that drift slowly.

    function renderVivid(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, config: VividConfig) {
        const validColors = (config.colors || []).filter(c => c && c.length >= 4)
        const rgbPalette = validColors.length > 0 ? validColors.map(hexToRgb) : [
            [26, 10, 62] as [number, number, number],
            [204, 0, 255] as [number, number, number],
            [255, 102, 0] as [number, number, number],
        ]
        const speed = config.speed || 0.4
        const morphScale = config.morph_scale ?? 0.5
        const hotspotSize = config.hotspot_size ?? 0.4
        const hotspotColor = hexToRgb(config.hotspot_color || '#ffccdd')
        const hotspotIntensity = config.hotspot_intensity ?? 0.8
        const bloom = config.bloom ?? 0.7
        const depth = config.depth ?? 0.6

        // ── 1. Deep base fill ────────────────────────────────────────────
        // Use the darkest palette color as the base
        const darkest = rgbPalette[0]!
        ctx.fillStyle = `rgb(${darkest[0]},${darkest[1]},${darkest[2]})`
        ctx.fillRect(0, 0, w, h)

        // ── 2. Gradient mesh — multiple large radial blobs that drift ────
        // Each blob is a soft radial gradient positioned at a point that
        // moves slowly via layered sine waves (Lissajous-like paths).
        // Overlapping blobs with screen blending create the organic mesh.
        const blobCount = 5 + Math.round(depth * 4)
        const blobBaseSize = Math.max(w, h) * (0.4 + morphScale * 0.4)

        for (let i = 0; i < blobCount; i++) {
            const seed = i * 2.718 + 0.3

            // Position: slow drifting via multiple sine layers
            const rate = speed * 0.3
            const bx = w * 0.5
                + Math.sin(t * rate * 0.7 + seed * 2.3) * w * 0.35
                + Math.cos(t * rate * 0.4 + seed * 4.1) * w * 0.15
            const by = h * 0.5
                + Math.cos(t * rate * 0.6 + seed * 1.7) * h * 0.3
                + Math.sin(t * rate * 0.35 + seed * 3.3) * h * 0.12

            // Size breathes slowly
            const sizeBreathe = 1 + Math.sin(t * rate * 0.5 + seed * 5) * 0.2
            const bSize = blobBaseSize * sizeBreathe * (0.6 + (i % 3) * 0.2)

            // Color: each blob picks from the palette, shifting over time
            const colorPos = i / blobCount + t * speed * 0.08
            const blobColor = samplePalette(rgbPalette, colorPos)

            // Alpha varies per blob — creates depth layers
            const baseAlpha = 0.12 + depth * 0.1 + Math.sin(t * rate * 0.3 + seed) * 0.03

            const grad = ctx.createRadialGradient(bx, by, 0, bx, by, bSize)
            grad.addColorStop(0, `rgba(${blobColor[0]},${blobColor[1]},${blobColor[2]},${baseAlpha * 1.5})`)
            grad.addColorStop(0.3, `rgba(${blobColor[0]},${blobColor[1]},${blobColor[2]},${baseAlpha})`)
            grad.addColorStop(0.7, `rgba(${blobColor[0]},${blobColor[1]},${blobColor[2]},${baseAlpha * 0.3})`)
            grad.addColorStop(1, 'transparent')

            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = grad
            ctx.fillRect(bx - bSize, by - bSize, bSize * 2, bSize * 2)
            ctx.restore()
        }

        // ── 3. Secondary mesh layer — smaller, brighter accents ──────────
        // Adds chromatic variety and prevents the mesh from looking uniform
        const accentCount = 3 + Math.round(depth * 2)
        for (let i = 0; i < accentCount; i++) {
            const seed = i * 3.14 + 7.7
            const rate = speed * 0.5
            const ax = w * 0.5
                + Math.sin(t * rate * 0.9 + seed * 1.5) * w * 0.3
                + Math.cos(t * rate * 0.6 + seed * 2.8) * w * 0.1
            const ay = h * 0.5
                + Math.cos(t * rate * 0.7 + seed * 2.1) * h * 0.25
            const aSize = Math.max(w, h) * (0.15 + morphScale * 0.15)
            const accentColor = samplePalette(rgbPalette, i / accentCount + t * speed * 0.12 + 0.5)
            const aAlpha = 0.08 + depth * 0.06

            const aGrad = ctx.createRadialGradient(ax, ay, 0, ax, ay, aSize)
            aGrad.addColorStop(0, `rgba(${accentColor[0]},${accentColor[1]},${accentColor[2]},${aAlpha * 2})`)
            aGrad.addColorStop(0.5, `rgba(${accentColor[0]},${accentColor[1]},${accentColor[2]},${aAlpha})`)
            aGrad.addColorStop(1, 'transparent')

            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = aGrad
            ctx.fillRect(ax - aSize, ay - aSize, aSize * 2, aSize * 2)
            ctx.restore()
        }

        // ── 4. Central hotspot + smooth pulse ────────────────────────────
        // The hotspot is the focal point — a bright faux-sun. The "strobe"
        // is not a sharp flash but a smooth breathing animation: the hotspot
        // gently expands, brightens, shifts toward white, then contracts
        // back. Multiple layered sine waves at different speeds create an
        // organic, continuous rhythm. Everything radiates FROM the center.
        const cx = w / 2
        const cy = h / 2
        const hotR = Math.min(w, h) * hotspotSize

        // Smooth pulse — layered eased sine waves, never sharp
        const strobeEnabled = config.strobe_enabled ?? false
        const strobeFreq = config.strobe_frequency ?? 0.5
        const strobeInt = config.strobe_intensity ?? 0.6

        let pulse = 0 // 0..1 smooth breathing value
        if (strobeEnabled) {
            // Frequency modulation: the rate itself changes over time,
            // so sometimes it breathes slowly, sometimes quickly
            const baseRate = 0.3 + strobeFreq * 1.5
            const fmSlow = Math.sin(t * 0.13) * 0.4  // slow wander
            const fmMed = Math.sin(t * 0.37 + 1.7) * 0.25
            const rate = baseRate * (1 + fmSlow + fmMed) // rate varies 35%–165% of base
            const w1 = (Math.sin(t * rate * Math.PI * 2) + 1) / 2
            const w2 = (Math.sin(t * rate * 0.67 * Math.PI * 2 + 1.2) + 1) / 2
            const w3 = (Math.sin(t * rate * 1.5 * Math.PI * 2 + 2.8) + 1) / 2
            const raw = w1 * 0.5 + w2 * 0.3 + w3 * 0.2
            pulse = easeInOutSine(raw) * strobeInt
        }

        // Slow background breathing independent of strobe
        const breathe = easeInOutSine((Math.sin(t * speed * 0.5) + 1) / 2) * 0.12

        // Combined: the hotspot continuously breathes, with the pulse adding
        // extra expansion and brightness on top
        const hotScale = 1 + breathe + pulse * 0.5
        const hotAlphaBoost = 1 + pulse * 1.5

        // Outer bloom — massive soft bleed, swells with the pulse
        const bloomR = hotR * hotScale * (2.5 + bloom * 2 + pulse * 1)
        const bloomAlpha = Math.min(hotspotIntensity * bloom * 0.2 * hotAlphaBoost, 0.7)
        const bloomGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR)
        bloomGrad.addColorStop(0, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${bloomAlpha})`)
        bloomGrad.addColorStop(0.15, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${bloomAlpha * 0.8})`)
        bloomGrad.addColorStop(0.4, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${bloomAlpha * 0.25})`)
        bloomGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = bloomGrad
        ctx.fillRect(cx - bloomR, cy - bloomR, bloomR * 2, bloomR * 2)
        ctx.restore()

        // Mid glow — visible hotspot body
        const midR = hotR * hotScale * 1.8
        const midAlpha = Math.min(hotspotIntensity * 0.4 * hotAlphaBoost, 0.85)
        const midGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, midR)
        midGrad.addColorStop(0, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${midAlpha})`)
        midGrad.addColorStop(0.3, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${midAlpha * 0.6})`)
        midGrad.addColorStop(0.7, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${midAlpha * 0.15})`)
        midGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = midGrad
        ctx.fillRect(cx - midR, cy - midR, midR * 2, midR * 2)
        ctx.restore()

        // Bright core — shifts toward white as pulse rises
        const coreR = hotR * hotScale * 0.7
        const coreAlpha = Math.min(hotspotIntensity * (0.6 + pulse * 0.35), 1)
        const coreWhite = pulse * 0.7
        const coreC = lerpColor(hotspotColor, [255, 255, 255], coreWhite)
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
        coreGrad.addColorStop(0, `rgba(255,255,255,${coreAlpha})`)
        coreGrad.addColorStop(0.25, `rgba(${coreC[0]},${coreC[1]},${coreC[2]},${coreAlpha * 0.85})`)
        coreGrad.addColorStop(0.6, `rgba(${coreC[0]},${coreC[1]},${coreC[2]},${coreAlpha * 0.3})`)
        coreGrad.addColorStop(1, 'transparent')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = coreGrad
        ctx.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2)
        ctx.restore()

        // Shape that unfolds from the hotspot with organic, fluttering motion.
        // It never sits still — it drifts, tilts, stretches asymmetrically,
        // and breathes like wings trying to take flight.
        const strobeShape = config.strobe_shape ?? 'rectangle'
        if (pulse > 0.02) {
            const unfold = easeInOutSine(pulse)
            const spillC = lerpColor(hotspotColor, [255, 255, 255], unfold * 0.5)
            const spillAlpha = unfold * strobeInt * 0.35

            // Chaotic organic motion — frequencies themselves are modulated
            // by slow wandering LFOs so the shape sometimes moves fast,
            // sometimes drifts slowly, never repeating the same pattern.

            // Speed modulation: a slow meta-oscillator varies how fast
            // everything moves. Sometimes frantic, sometimes lazy.
            const tempoMod = 1 + Math.sin(t * 0.17) * 0.5 + Math.sin(t * 0.071 + 3) * 0.3
            const d = speed * 0.8 * tempoMod

            // Position drift — large, wandering, unpredictable
            const driftX = Math.sin(t * d * 1.1 + Math.sin(t * 0.23) * 2) * w * 0.05
                + Math.cos(t * d * 0.41 + 2.1) * w * 0.03
                + Math.sin(t * d * 0.19 + Math.cos(t * 0.11) * 3) * w * 0.02
            const driftY = Math.cos(t * d * 0.83 + Math.sin(t * 0.19) * 1.5) * h * 0.04
                + Math.sin(t * d * 0.29 + 4.5) * h * 0.025

            // Tilt — swings wider sometimes, barely moves other times
            const tiltMod = 0.5 + Math.sin(t * 0.13 + 1) * 0.5
            const tilt = Math.sin(t * d * 0.6 + 1.3) * 0.1 * tiltMod
                + Math.sin(t * d * 0.23 + 3.7) * 0.05 * tiltMod

            // Asymmetric wing stretch — each side has its own tempo
            // that drifts independently, creating flapping
            const wingTempoL = d * (0.7 + Math.sin(t * 0.11) * 0.3)
            const wingTempoR = d * (0.7 + Math.sin(t * 0.11 + 2.5) * 0.3)
            const stretchL = 1 + Math.sin(t * wingTempoL + 0.5) * 0.25 * unfold
                + Math.sin(t * wingTempoL * 2.3 + 1.1) * 0.1 * unfold
            const stretchR = 1 + Math.sin(t * wingTempoR + 0.5) * 0.25 * unfold
                + Math.sin(t * wingTempoR * 2.3 + 4.2) * 0.1 * unfold

            // Vertical stretch — top and bottom expand independently
            const vTempoT = d * (0.6 + Math.sin(t * 0.14 + 1.9) * 0.35)
            const vTempoB = d * (0.6 + Math.sin(t * 0.14 + 4.4) * 0.35)
            const stretchT = 1 + Math.sin(t * vTempoT + 2.3) * 0.3 * unfold
                + Math.sin(t * vTempoT * 1.9 + 0.7) * 0.12 * unfold
            const stretchB = 1 + Math.sin(t * vTempoB + 5.1) * 0.3 * unfold
                + Math.sin(t * vTempoB * 1.9 + 3.3) * 0.12 * unfold

            // Shape deformation: corners warp wildly, each on its own
            // chaotic path with frequency modulation
            const warpSpeed = d * (0.4 + Math.sin(t * 0.07) * 0.3)
            const warpTL = 1 + Math.sin(t * warpSpeed * 0.53 + 0.3) * 0.6 * unfold
                + Math.sin(t * warpSpeed * 1.17 + 3.1) * 0.3 * unfold
            const warpTR = 1 + Math.sin(t * warpSpeed * 0.61 + 2.1) * 0.6 * unfold
                + Math.sin(t * warpSpeed * 0.89 + 5.3) * 0.3 * unfold
            const warpBL = 1 + Math.sin(t * warpSpeed * 0.47 + 4.0) * 0.6 * unfold
                + Math.sin(t * warpSpeed * 1.31 + 1.7) * 0.3 * unfold
            const warpBR = 1 + Math.sin(t * warpSpeed * 0.71 + 5.8) * 0.6 * unfold
                + Math.sin(t * warpSpeed * 0.97 + 0.9) * 0.3 * unfold

            if (strobeShape === 'rectangle') {
                const maxW = w * 0.6
                const maxH = h * 0.4
                const barW = hotR * hotScale * 0.5 + unfold * (maxW - hotR * hotScale * 0.5)
                const baseBarH = hotR * hotScale * 0.3 + unfold * (maxH - hotR * hotScale * 0.3)

                // Asymmetric: left/right width, top/bottom height
                const leftW = barW * 0.5 * stretchL
                const rightW = barW * 0.5 * stretchR
                const topH = baseBarH * 0.5 * stretchT
                const botH = baseBarH * 0.5 * stretchB
                const totalH = topH + botH

                // Warped corners
                const baseCorner = totalH * 0.4 * (1 - unfold * 0.6)
                const crTL = baseCorner * warpTL
                const crTR = baseCorner * warpTR
                const crBL = baseCorner * warpBL
                const crBR = baseCorner * warpBR

                ctx.save()
                ctx.translate(cx + driftX, cy + driftY)
                ctx.rotate(tilt)
                ctx.globalCompositeOperation = 'screen'

                // Soft outer glow
                ctx.globalAlpha = spillAlpha * 0.35
                ctx.fillStyle = `rgb(${spillC[0]},${spillC[1]},${spillC[2]})`
                ctx.beginPath()
                ctx.roundRect(-leftW * 1.3, -topH * 1.3, (leftW + rightW) * 1.3, (totalH) * 1.3, [crTL * 2, crTR * 2, crBR * 2, crBL * 2])
                ctx.fill()

                // Main body — top/bottom asymmetric
                ctx.globalAlpha = spillAlpha
                ctx.fillStyle = `rgb(${spillC[0]},${spillC[1]},${spillC[2]})`
                ctx.beginPath()
                ctx.roundRect(-leftW, -topH, leftW + rightW, totalH, [crTL, crTR, crBR, crBL])
                ctx.fill()

                // White-hot center line
                ctx.globalAlpha = spillAlpha * 0.55
                ctx.fillStyle = '#fff'
                const lineH = totalH * 0.15
                const lineW = (leftW + rightW) * 0.7
                ctx.beginPath()
                ctx.roundRect(-lineW * 0.5, -lineH / 2, lineW, lineH, lineH / 2)
                ctx.fill()

                ctx.restore()

            } else {
                // Full screen: light pours outward, with drifting center
                const fillCx = cx + driftX * 3
                const fillCy = cy + driftY * 3
                const fillR = Math.max(w, h) * (0.1 + unfold * 0.9)
                const fillGrad = ctx.createRadialGradient(fillCx, fillCy, 0, fillCx, fillCy, fillR)
                fillGrad.addColorStop(0, `rgba(${spillC[0]},${spillC[1]},${spillC[2]},${spillAlpha})`)
                fillGrad.addColorStop(0.3, `rgba(${spillC[0]},${spillC[1]},${spillC[2]},${spillAlpha * 0.7})`)
                fillGrad.addColorStop(0.7, `rgba(${spillC[0]},${spillC[1]},${spillC[2]},${spillAlpha * 0.2})`)
                fillGrad.addColorStop(1, 'transparent')
                ctx.save()
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = fillGrad
                ctx.fillRect(0, 0, w, h)
                ctx.restore()
            }
        }


        // ── 6. Global bloom pass ─────────────────────────────────────────
        if (bloom > 0.3) {
            const gloomAlpha = (bloom - 0.3) * 0.06
            const topGlow = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy * 0.7, Math.max(w, h) * 0.5)
            topGlow.addColorStop(0, `rgba(${hotspotColor[0]},${hotspotColor[1]},${hotspotColor[2]},${gloomAlpha})`)
            topGlow.addColorStop(1, 'transparent')
            ctx.save()
            ctx.globalCompositeOperation = 'screen'
            ctx.fillStyle = topGlow
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
        }

        // ── 7. Vignette ─────────────────────────────────────────────────
        const vGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.25, cx, cy, Math.max(w, h) * 0.65)
        vGrad.addColorStop(0, 'transparent')
        vGrad.addColorStop(1, `rgba(0,0,0,${0.3 + depth * 0.15})`)
        ctx.save()
        ctx.fillStyle = vGrad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    onUnmounted(() => {
        stopRendering()
        document.removeEventListener('fullscreenchange', onFullscreenChange)
    })

    return {
        activeMode,
        isFullscreen,
        isPlaying,
        setCanvas,
        enterFullscreen,
        exitFullscreen,
        switchMode,
        startRendering,
        stopRendering,
        // Live performance controls
        liveIntensity,
        liveBuildup,
        setLiveIntensity,
        startBuildup,
        stopBuildup,
        triggerDrop,
        resetBuildup,
        triggerFlash,
        onDrop,
    }
}
