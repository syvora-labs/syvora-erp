<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const props = withDefaults(defineProps<{
    width?: number
    height?: number
    disabled?: boolean
}>(), {
    width: 500,
    height: 200,
    disabled: false,
})

const emit = defineEmits<{
    'update:svg': [svg: string]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const strokes = ref<{ x: number; y: number }[][]>([])
const currentStroke = ref<{ x: number; y: number }[]>([])

const hasSignature = computed(() => strokes.value.length > 0)

function getCoords(e: PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.value!
    const rect = canvas.getBoundingClientRect()
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    }
}

function redraw() {
    const canvas = canvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, props.width, props.height)

    if (strokes.value.length === 0 && currentStroke.value.length === 0) {
        ctx.fillStyle = '#aaa'
        ctx.font = '16px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Sign here', props.width / 2, props.height / 2)
        return
    }

    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const allStrokes = [...strokes.value]
    if (currentStroke.value.length > 0) {
        allStrokes.push(currentStroke.value)
    }

    for (const stroke of allStrokes) {
        if (stroke.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(stroke[0].x, stroke[0].y)
        for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x, stroke[i].y)
        }
        ctx.stroke()
    }
}

function strokesToSvg(): string {
    if (strokes.value.length === 0) return ''
    const paths = strokes.value.map(stroke => {
        if (stroke.length < 2) return ''
        return stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    }).filter(Boolean)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${props.width} ${props.height}"><path d="${paths.join(' ')}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function onPointerDown(e: PointerEvent) {
    if (props.disabled) return
    e.preventDefault()
    isDrawing.value = true
    currentStroke.value = [getCoords(e)]
}

function onPointerMove(e: PointerEvent) {
    if (!isDrawing.value || props.disabled) return
    currentStroke.value.push(getCoords(e))
    redraw()
}

function onPointerUp() {
    if (!isDrawing.value) return
    isDrawing.value = false
    if (currentStroke.value.length > 0) {
        strokes.value.push([...currentStroke.value])
        currentStroke.value = []
        redraw()
        emit('update:svg', strokesToSvg())
    }
}

onMounted(() => {
    redraw()
})

defineExpose({
    clear() {
        strokes.value = []
        currentStroke.value = []
        redraw()
        emit('update:svg', '')
    }
})
</script>

<template>
    <div class="signature-canvas-wrapper">
        <canvas
            ref="canvasRef"
            :width="props.width"
            :height="props.height"
            :class="{ disabled: props.disabled, 'has-signature': hasSignature }"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
        />
    </div>
</template>

<style scoped>
.signature-canvas-wrapper {
    display: inline-block;
}

canvas {
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-sm);
    cursor: crosshair;
    touch-action: none !important;
    background: rgba(255, 255, 255, 0.9);
    display: block;
}

canvas.has-signature {
    border-color: var(--color-accent);
}

canvas.disabled {
    opacity: 0.5;
    pointer-events: none;
}
</style>
