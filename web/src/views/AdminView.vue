<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../composables/useAuth'
import {
    SyvoraCard, SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraAvatar
} from '@syvora/ui'

interface UserRow {
    id: string
    email: string
    created_at: string
    profile: {
        username: string
        display_name: string | null
        role: 'admin' | 'member'
    } | null
}

const { isAdmin } = useAuth()

// Admin client uses service role key for user management
const adminClient = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const users = ref<UserRow[]>([])
const loading = ref(false)
const error = ref('')

const showCreateModal = ref(false)
const creating = ref(false)
const createError = ref('')
const form = ref({
    email: '',
    username: '',
    password: '',
    role: 'member' as 'admin' | 'member',
})

onMounted(fetchUsers)

async function fetchUsers() {
    loading.value = true
    error.value = ''
    try {
        const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers()
        if (authErr) throw authErr

        const { data: profiles } = await adminClient.from('profiles').select('id, username, display_name, role')
        const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

        users.value = (authData.users ?? []).map((u: any) => ({
            id: u.id,
            email: u.email ?? '',
            created_at: u.created_at,
            profile: profileMap.get(u.id) ?? null,
        }))
    } catch (e: any) {
        error.value = e.message ?? 'Failed to load users.'
    } finally {
        loading.value = false
    }
}

function openCreate() {
    form.value = { email: '', username: '', password: '', role: 'member' }
    createError.value = ''
    showCreateModal.value = true
}

async function createUser() {
    if (!form.value.email.trim() || !form.value.username.trim() || !form.value.password) {
        createError.value = 'Email, username, and password are required.'
        return
    }
    if (form.value.password.length < 6) {
        createError.value = 'Password must be at least 6 characters.'
        return
    }
    creating.value = true
    createError.value = ''
    try {
        const { data, error: createErr } = await adminClient.auth.admin.createUser({
            email: form.value.email.trim(),
            password: form.value.password,
            email_confirm: true,
            user_metadata: {
                username: form.value.username.trim(),
                role: form.value.role,
            },
        })
        if (createErr) throw createErr

        // Profile is auto-created by DB trigger using user_metadata.username
        // If trigger doesn't fire immediately, create it manually:
        if (data.user) {
            await adminClient.from('profiles').upsert({
                id: data.user.id,
                username: form.value.username.trim(),
                role: form.value.role,
            })
        }

        showCreateModal.value = false
        await fetchUsers()
    } catch (e: any) {
        createError.value = e.message ?? 'Failed to create user.'
    } finally {
        creating.value = false
    }
}

async function deleteUser(userId: string, username: string) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
        const { error: delErr } = await adminClient.auth.admin.deleteUser(userId)
        if (delErr) throw delErr
        users.value = users.value.filter(u => u.id !== userId)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete user.')
    }
}

async function toggleRole(user: UserRow) {
    if (!user.profile) return
    const newRole = user.profile.role === 'admin' ? 'member' : 'admin'
    try {
        const { error: upErr } = await adminClient
            .from('profiles')
            .update({ role: newRole })
            .eq('id', user.id)
        if (upErr) throw upErr
        await fetchUsers()
    } catch (e: any) {
        alert(e.message ?? 'Failed to update role.')
    }
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">User Management</h1>
                <p class="page-subtitle">Create and manage label team members</p>
            </div>
            <SyvoraButton v-if="isAdmin" @click="openCreate">+ New User</SyvoraButton>
        </div>

        <div v-if="!isAdmin" class="access-denied">
            <SyvoraEmptyState>You need admin privileges to access this page.</SyvoraEmptyState>
        </div>

        <template v-else>
            <p v-if="error" class="error-msg" style="margin-bottom: 1rem;">{{ error }}</p>

            <div v-if="loading" class="loading-text">Loading users…</div>

            <SyvoraCard v-else>
                <SyvoraEmptyState v-if="users.length === 0">No users found.</SyvoraEmptyState>

                <div v-else class="user-list">
                    <div v-for="user in users" :key="user.id" class="user-row">
                        <SyvoraAvatar
                            :name="user.profile?.display_name ?? user.profile?.username ?? user.email"
                            size="sm"
                        />
                        <div class="user-info">
                            <span class="user-name">
                                {{ user.profile?.username ?? '—' }}
                                <span v-if="user.profile?.display_name" class="user-display-name">· {{ user.profile.display_name }}</span>
                            </span>
                            <span class="user-email">{{ user.email }}</span>
                        </div>
                        <div class="user-row-end">
                            <div class="user-meta">
                                <span class="badge" :class="user.profile?.role === 'admin' ? 'badge-success' : 'badge-deposit'">
                                    {{ user.profile?.role ?? 'no profile' }}
                                </span>
                                <span class="user-joined">Joined {{ formatDate(user.created_at) }}</span>
                            </div>
                            <div class="user-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="toggleRole(user)" :disabled="!user.profile">
                                    Make {{ user.profile?.role === 'admin' ? 'member' : 'admin' }}
                                </SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="deleteUser(user.id, user.profile?.username ?? user.email)">
                                    Delete
                                </SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </SyvoraCard>
        </template>
    </div>

    <!-- Create User Modal -->
    <SyvoraModal v-if="showCreateModal" title="Create User" size="sm" @close="showCreateModal = false">
        <div class="create-form">
            <SyvoraFormField label="Email" for="cu-email">
                <SyvoraInput id="cu-email" v-model="form.email" type="email" placeholder="user@label.com" autocomplete="off" />
            </SyvoraFormField>

            <SyvoraFormField label="Username" for="cu-username">
                <SyvoraInput id="cu-username" v-model="form.username" placeholder="username" autocomplete="off" />
            </SyvoraFormField>

            <SyvoraFormField label="Initial Password" for="cu-password">
                <SyvoraInput id="cu-password" v-model="form.password" type="password" placeholder="Min. 6 characters" autocomplete="new-password" />
            </SyvoraFormField>

            <SyvoraFormField label="Role" for="cu-role">
                <select id="cu-role" v-model="form.role" class="native-select">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                </select>
            </SyvoraFormField>

            <p class="create-hint">The user can change their password after logging in via the Profile page.</p>

            <p v-if="createError" class="error-msg">{{ createError }}</p>
        </div>

        <template #footer>
            <SyvoraButton variant="ghost" @click="showCreateModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="creating" :disabled="creating" @click="createUser">Create User</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 960px;
    margin: 0 auto;
}

.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    gap: 1rem;
}

.page-title {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 0.25rem;
}

.page-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem 0;
}

.user-list {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.user-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.user-row:last-child {
    border-bottom: none;
}

.user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.user-name {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.user-display-name {
    font-weight: 400;
    color: var(--color-text-muted);
}

.user-email {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
}

.user-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
    flex-shrink: 0;
}

.user-joined {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.user-row-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.user-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

.create-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.native-select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
}

.native-select:focus {
    outline: none;
    border-color: rgba(115, 195, 254, 0.4);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.1);
}

.create-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
}

:deep(.btn-danger) {
    color: var(--color-error);
}

@media (max-width: 600px) {
    .user-row {
        flex-wrap: wrap;
    }

    .user-row-end {
        width: 100%;
        justify-content: space-between;
    }

    .user-meta {
        align-items: flex-start;
    }
}
</style>
