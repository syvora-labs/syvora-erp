<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import {
    SyvoraCard, SyvoraFormField, SyvoraInput, SyvoraTextarea,
    SyvoraButton, SyvoraAvatar
} from '@syvora/ui'

const { currentUser, currentProfile, updateProfile, updatePassword, uploadAvatar } = useAuth()

const displayName = ref(currentProfile.value?.display_name ?? '')
const bio = ref(currentProfile.value?.bio ?? '')
const profileSaving = ref(false)
const profileError = ref('')
const profileSuccess = ref('')

const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

const avatarSaving = ref(false)

watch(currentProfile, (p) => {
    if (p) {
        displayName.value = p.display_name ?? ''
        bio.value = p.bio ?? ''
    }
})

async function saveProfile() {
    profileSaving.value = true
    profileError.value = ''
    profileSuccess.value = ''
    try {
        await updateProfile({
            display_name: displayName.value.trim() || null,
            bio: bio.value.trim() || null,
        })
        profileSuccess.value = 'Profile saved.'
    } catch (e: any) {
        profileError.value = e.message ?? 'Failed to save profile.'
    } finally {
        profileSaving.value = false
    }
}

async function savePassword() {
    if (!newPassword.value) {
        passwordError.value = 'Please enter a new password.'
        return
    }
    if (newPassword.value !== confirmPassword.value) {
        passwordError.value = 'Passwords do not match.'
        return
    }
    if (newPassword.value.length < 6) {
        passwordError.value = 'Password must be at least 6 characters.'
        return
    }
    passwordSaving.value = true
    passwordError.value = ''
    passwordSuccess.value = ''
    try {
        await updatePassword(newPassword.value)
        newPassword.value = ''
        confirmPassword.value = ''
        passwordSuccess.value = 'Password updated.'
    } catch (e: any) {
        passwordError.value = e.message ?? 'Failed to update password.'
    } finally {
        passwordSaving.value = false
    }
}

async function onAvatarPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    avatarSaving.value = true
    try {
        const url = await uploadAvatar(file)
        await updateProfile({ avatar_url: url })
    } catch (e: any) {
        alert(e.message ?? 'Failed to upload avatar.')
    } finally {
        avatarSaving.value = false
    }
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <h1 class="page-title">Profile</h1>
            <p class="page-subtitle">Manage your account</p>
        </div>

        <div class="profile-layout">
            <SyvoraCard class="avatar-card">
                <div class="avatar-section">
                    <label class="avatar-label" :class="{ loading: avatarSaving }">
                        <input type="file" accept="image/*" class="hidden-input" :disabled="avatarSaving" @change="onAvatarPick" />
                        <SyvoraAvatar
                            :src="currentProfile?.avatar_url ?? undefined"
                            :name="currentProfile?.display_name ?? currentProfile?.username ?? 'U'"
                            size="lg"
                            :editable="true"
                        />
                    </label>
                    <div class="avatar-info">
                        <span v-if="currentProfile?.display_name" class="display-name">{{ currentProfile.display_name }}</span>
                        <span class="badge" :class="currentProfile?.role === 'admin' ? 'badge-success' : 'badge-deposit'">
                            {{ currentProfile?.role }}
                        </span>
                    </div>
                    <p class="avatar-hint">{{ avatarSaving ? 'Uploading…' : 'Click avatar to change' }}</p>
                    <p class="email-text">{{ currentUser?.email }}</p>
                </div>
            </SyvoraCard>

            <div class="forms-col">
                <SyvoraCard title="Profile Details">
                    <div class="form-fields">
                        <SyvoraFormField label="Display Name" for="display-name">
                            <SyvoraInput id="display-name" v-model="displayName" placeholder="Your display name" />
                        </SyvoraFormField>
                        <SyvoraFormField label="Bio" for="bio">
                            <SyvoraTextarea id="bio" v-model="bio" placeholder="A short bio…" :rows="3" />
                        </SyvoraFormField>
                        <p v-if="profileError" class="error-msg">{{ profileError }}</p>
                        <p v-if="profileSuccess" class="success-msg">{{ profileSuccess }}</p>
                        <SyvoraButton :loading="profileSaving" :disabled="profileSaving" @click="saveProfile">
                            Save Profile
                        </SyvoraButton>
                    </div>
                </SyvoraCard>

                <SyvoraCard title="Change Password">
                    <div class="form-fields">
                        <SyvoraFormField label="New Password" for="new-pass">
                            <SyvoraInput id="new-pass" v-model="newPassword" type="password" placeholder="New password (min. 6 chars)" autocomplete="new-password" />
                        </SyvoraFormField>
                        <SyvoraFormField label="Confirm Password" for="confirm-pass">
                            <SyvoraInput id="confirm-pass" v-model="confirmPassword" type="password" placeholder="Confirm new password" autocomplete="new-password" />
                        </SyvoraFormField>
                        <p v-if="passwordError" class="error-msg">{{ passwordError }}</p>
                        <p v-if="passwordSuccess" class="success-msg">{{ passwordSuccess }}</p>
                        <SyvoraButton :loading="passwordSaving" :disabled="passwordSaving" @click="savePassword">
                            Update Password
                        </SyvoraButton>
                    </div>
                </SyvoraCard>
            </div>
        </div>
    </div>
</template>

<style scoped>
.page {
    max-width: 800px;
    margin: 0 auto;
}
.page-header { margin-bottom: 2rem; }
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
.profile-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 1.25rem;
    align-items: start;
}
.avatar-card { display: flex; flex-direction: column; }
.avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
}
.avatar-label { cursor: pointer; display: block; }
.avatar-label.loading { opacity: 0.6; pointer-events: none; }
.avatar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
}
.display-name { font-size: 1.0625rem; font-weight: 700; }
.username { font-size: 0.875rem; color: var(--color-text-muted); }
.avatar-hint { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }
.email-text { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; word-break: break-all; }
.forms-col { display: flex; flex-direction: column; gap: 1.25rem; }
.form-fields { display: flex; flex-direction: column; gap: 1rem; }
.hidden-input { display: none; }
.success-msg { font-size: 0.875rem; color: var(--color-success); }
@media (max-width: 640px) {
    .profile-layout { grid-template-columns: 1fr; }
}
</style>
