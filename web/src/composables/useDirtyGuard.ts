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
