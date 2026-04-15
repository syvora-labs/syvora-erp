<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRadios, type Radio } from '../composables/useRadios'
import {
    SyvoraButton, SyvoraEmptyState, SyvoraTabs
} from '@syvora/ui'

const router = useRouter()

function goToRadio(radio: Radio) {
    router.push(`/radios/${radio.id}`)
}

const {
    activeRadios, archivedRadios, loading,
    fetchRadios, deleteRadio,
    publishRadio, unpublishRadio, archiveRadio, unarchiveRadio,
} = useRadios()

const activeTab = ref<'active' | 'archived'>('active')

onMounted(() => {
    fetchRadios()
})

async function handlePublish(radio: Radio) {
    if (!radio.soundcloud_link) {
        alert('Cannot publish: a SoundCloud link is required.')
        return
    }
    try { await publishRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to publish radio.') }
}

async function handleUnpublish(radio: Radio) {
    try { await unpublishRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to revert to draft.') }
}

async function handleArchive(radio: Radio) {
    if (!confirm(`Archive "${radio.title}"? It will be hidden from the active list.`)) return
    try { await archiveRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to archive radio.') }
}

async function handleUnarchive(radio: Radio) {
    try { await unarchiveRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to restore radio.') }
}

async function handleDelete(radio: Radio) {
    if (!confirm(`Delete "${radio.title}"?`)) return
    try { await deleteRadio(radio.id) }
    catch (e: any) { alert(e.message ?? 'Failed to delete radio.') }
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    })
}

function formatAuditDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Radios</h1>
                <p class="page-subtitle">Manage radio episodes, artwork, and publishing</p>
            </div>
            <SyvoraButton @click="router.push('/radios/new')">+ New Radio</SyvoraButton>
        </div>

        <SyvoraTabs
            v-model="activeTab"
            :tabs="[
                { key: 'active', label: 'Active', count: activeRadios.length },
                { key: 'archived', label: 'Archived', count: archivedRadios.length },
            ]"
        />

        <div v-if="loading" class="loading-text">Loading radios...</div>

        <!-- Active radios -->
        <template v-else-if="activeTab === 'active'">
            <SyvoraEmptyState v-if="activeRadios.length === 0">
                No active radios. Create your first one.
            </SyvoraEmptyState>

            <div v-else class="radios-list">
                <div
                    v-for="radio in activeRadios"
                    :key="radio.id"
                    class="radio-card radio-card--clickable"
                    :class="{ 'radio-card--draft': radio.is_draft }"
                    @click="goToRadio(radio)"
                >
                    <div class="radio-body">
                        <div class="radio-meta">
                            <span v-if="radio.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>
                            <span class="radio-date">{{ formatDate(radio.release_date) }}</span>
                        </div>

                        <h3 class="radio-title">{{ radio.title }}</h3>

                        <div v-if="radio.artists.length" class="radio-artists">
                            <span v-for="(artist, i) in radio.artists" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="radio-audit">
                            <span>Created by {{ radio.creator_name ?? 'Unknown' }} · {{ formatAuditDate(radio.created_at) }}</span>
                            <span v-if="radio.updater_name"> · Updated by {{ radio.updater_name }} · {{ formatAuditDate(radio.updated_at) }}</span>
                        </div>

                        <div class="radio-footer">
                            <a v-if="radio.soundcloud_link && !radio.is_draft" :href="radio.soundcloud_link" target="_blank" class="soundcloud-link" @click.stop>
                                SoundCloud &#8599;
                            </a>
                            <div class="radio-actions" @click.stop>
                                <SyvoraButton v-if="radio.is_draft" size="sm" :disabled="!radio.soundcloud_link" :title="!radio.soundcloud_link ? 'Add a SoundCloud link before publishing' : ''" @click="handlePublish(radio)">
                                    Publish
                                </SyvoraButton>
                                <SyvoraButton v-else variant="ghost" size="sm" @click="handleUnpublish(radio)">
                                    Revert to Draft
                                </SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click="router.push(`/radios/${radio.id}/edit`)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" @click="handleArchive(radio)">Archive</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(radio)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Archived radios -->
        <template v-else>
            <SyvoraEmptyState v-if="archivedRadios.length === 0">
                No archived radios.
            </SyvoraEmptyState>

            <div v-else class="radios-list">
                <div
                    v-for="radio in archivedRadios"
                    :key="radio.id"
                    class="radio-card radio-card--clickable radio-card--archived"
                    @click="goToRadio(radio)"
                >
                    <div class="radio-body">
                        <div class="radio-meta">
                            <span class="badge badge-archived">Archived</span>
                            <span v-if="radio.is_draft" class="badge badge-draft">Draft</span>
                            <span v-else class="badge badge-published">Published</span>
                            <span class="radio-date">{{ formatDate(radio.release_date) }}</span>
                        </div>

                        <h3 class="radio-title">{{ radio.title }}</h3>

                        <div v-if="radio.artists.length" class="radio-artists">
                            <span v-for="(artist, i) in radio.artists" :key="i" class="badge badge-deposit">
                                {{ artist }}
                            </span>
                        </div>

                        <div class="radio-audit">
                            <span>Created by {{ radio.creator_name ?? 'Unknown' }} · {{ formatAuditDate(radio.created_at) }}</span>
                            <span v-if="radio.updater_name"> · Updated by {{ radio.updater_name }} · {{ formatAuditDate(radio.updated_at) }}</span>
                        </div>

                        <div class="radio-footer">
                            <div class="radio-actions" @click.stop>
                                <SyvoraButton variant="ghost" size="sm" @click="handleUnarchive(radio)">Restore</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDelete(radio)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; }
.page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 1.5rem; gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0; }
.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }

.radios-list { display: flex; flex-direction: column; gap: 1rem; }

.radio-card {
    background: var(--color-surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    display: flex;
    transition: box-shadow 0.3s;
}
.radio-card:hover { box-shadow: var(--shadow-card-hover); }
.radio-card--clickable { cursor: pointer; }
.radio-card--draft {
    opacity: 0.82;
    border-style: dashed;
}
.radio-card--archived {
    opacity: 0.6;
}

.radio-body { flex: 1; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }

.radio-meta { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.radio-date { font-size: 0.8125rem; color: var(--color-text-muted); }
.radio-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.radio-artists { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.radio-desc {
    font-size: 0.9rem; color: var(--color-text-muted); margin: 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.radio-files { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.files-label { font-size: 0.8125rem; color: var(--color-text-muted); }
.file-chip {
    display: inline-flex; align-items: center; gap: 0.375rem;
    padding: 0.25rem 0.5rem; border-radius: var(--radius-sm);
    background: rgba(115, 195, 254, 0.08); border: 1px solid rgba(115, 195, 254, 0.18);
    font-size: 0.8125rem;
}
.file-chip-label { font-weight: 500; }
.file-chip-size { color: var(--color-text-muted); font-size: 0.75rem; }
.file-chip-action {
    background: none; border: none; cursor: pointer;
    color: var(--color-accent); font-size: 0.9rem; padding: 0 0.125rem;
    line-height: 1;
}
.file-chip-action:hover { opacity: 0.7; }
.file-chip-delete { color: var(--color-error); }

.radio-audit {
    font-size: 0.75rem; color: var(--color-text-muted);
    opacity: 0.7;
}

.radio-footer {
    display: flex; align-items: center; justify-content: flex-end;
    margin-top: auto; padding-top: 0.5rem;
}
.radio-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.soundcloud-link { font-size: 0.875rem; font-weight: 600; color: var(--color-accent); text-decoration: none; }
.soundcloud-link:hover { opacity: 0.75; }

/* Status badges */
.badge-draft {
    background: rgba(100, 100, 100, 0.12);
    color: rgba(12, 26, 39, 0.55);
    border: 1px solid rgba(100, 100, 100, 0.2);
}
.badge-published {
    background: rgba(115, 195, 254, 0.1);
    color: var(--color-accent);
    border: 1px solid rgba(115, 195, 254, 0.22);
}
.badge-archived {
    background: rgba(120, 80, 0, 0.09);
    color: rgba(120, 80, 0, 0.75);
    border: 1px solid rgba(120, 80, 0, 0.18);
}

:deep(.btn-danger) { color: var(--color-error); }
</style>
