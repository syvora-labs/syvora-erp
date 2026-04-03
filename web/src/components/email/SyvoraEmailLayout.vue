<script setup lang="ts">
defineProps<{
    showCompose?: boolean
}>()
</script>

<template>
    <div class="email-layout">
        <aside class="email-sidebar">
            <slot name="sidebar" />
        </aside>
        <div class="email-list-pane">
            <slot name="list" />
        </div>
        <main class="email-detail-pane">
            <slot name="detail" />
        </main>
    </div>
</template>

<style scoped>
.email-layout {
    display: grid;
    grid-template-columns: 220px 340px 1fr;
    height: calc(100vh - 4rem);
    overflow: hidden;
    border-radius: var(--radius-card, 1.5rem);
    background: var(--color-surface, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-card);
}

.email-sidebar {
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.email-list-pane {
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.email-detail-pane {
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

@media (max-width: 1024px) {
    .email-layout {
        grid-template-columns: 200px 1fr;
    }

    .email-detail-pane {
        display: none;
    }

    .email-layout.show-detail .email-list-pane {
        display: none;
    }

    .email-layout.show-detail .email-detail-pane {
        display: flex;
    }
}

@media (max-width: 600px) {
    .email-layout {
        grid-template-columns: 1fr;
        height: calc(100vh - 3.5rem);
    }

    .email-sidebar {
        display: none;
    }

    .email-layout.show-folders .email-sidebar {
        display: flex;
    }

    .email-layout.show-folders .email-list-pane {
        display: none;
    }

    .email-layout.show-folders .email-detail-pane {
        display: none;
    }
}
</style>
