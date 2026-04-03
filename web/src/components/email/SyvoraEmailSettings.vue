<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SyvoraButton } from '@syvora/ui'
import { useEmail } from '../../composables/useEmail'

const { settings, configured, fetchSettings, saveSettings, deleteSettings } = useEmail()

const form = ref({
    email_address: '',
    password: '',
    display_name: '',
    signature_html: '',
})
const saving = ref(false)
const error = ref('')
const success = ref('')

onMounted(async () => {
    await fetchSettings()
    if (settings.value) {
        form.value.email_address = settings.value.email_address
        form.value.display_name = settings.value.display_name ?? ''
        form.value.signature_html = settings.value.signature_html ?? ''
        // Password not shown — user must re-enter
    }
})

async function handleSave() {
    if (!form.value.email_address || !form.value.password) {
        error.value = 'Email and password are required'
        return
    }

    saving.value = true
    error.value = ''
    success.value = ''
    try {
        await saveSettings({
            email_address: form.value.email_address,
            password: form.value.password,
            display_name: form.value.display_name || null,
            signature_html: form.value.signature_html || null,
        })
        form.value.password = ''
        success.value = 'Settings saved successfully'
    } catch (e: any) {
        error.value = e.message
    } finally {
        saving.value = false
    }
}

async function handleDelete() {
    if (!confirm('Remove your email configuration? You will be disconnected from your mailbox.')) return
    try {
        await deleteSettings()
        form.value = { email_address: '', password: '', display_name: '', signature_html: '' }
        success.value = 'Email settings removed'
    } catch (e: any) {
        error.value = e.message
    }
}
</script>

<template>
    <div class="email-settings">
        <div class="settings-card">
            <h2 class="settings-title">Email Account Settings</h2>
            <p class="settings-desc">Connect your Hostpoint email to send and receive messages within the ERP.</p>

            <div class="settings-form">
                <div class="field">
                    <label class="field-label">Email Address</label>
                    <input v-model="form.email_address" type="email" class="field-input" placeholder="you@example.ch" />
                </div>

                <div class="field">
                    <label class="field-label">Password</label>
                    <input v-model="form.password" type="password" class="field-input" :placeholder="configured ? '(unchanged — enter to update)' : 'Your email password'" />
                </div>

                <div class="field">
                    <label class="field-label">Display Name</label>
                    <input v-model="form.display_name" type="text" class="field-input" placeholder="Your Name" />
                </div>

                <div class="field">
                    <label class="field-label">Email Signature</label>
                    <textarea v-model="form.signature_html" class="field-textarea" placeholder="HTML signature appended to outgoing emails" rows="4"></textarea>
                </div>
            </div>

            <div class="settings-actions">
                <SyvoraButton variant="primary" size="sm" :disabled="saving" @click="handleSave">
                    {{ saving ? 'Saving...' : 'Save Settings' }}
                </SyvoraButton>
                <SyvoraButton v-if="configured" variant="ghost" size="sm" @click="handleDelete">
                    Remove Account
                </SyvoraButton>
            </div>

            <p v-if="error" class="error-msg">{{ error }}</p>
            <p v-if="success" class="success-msg">{{ success }}</p>
        </div>
    </div>
</template>

<style scoped>
.email-settings {
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
}

.settings-card {
    background: var(--color-surface, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card, 1.5rem);
    padding: 2rem;
    max-width: 32rem;
    width: 100%;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.settings-title {
    font-size: 1.125rem;
    font-weight: 600;
}

.settings-desc {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
}

.settings-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
}

.field-input,
.field-textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm, 0.625rem);
    background: var(--color-surface-2, rgba(255, 255, 255, 0.48));
    font-size: 0.8125rem;
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    font-family: inherit;
}

.field-input:focus,
.field-textarea:focus {
    border-color: var(--color-accent, #73c3fe);
    box-shadow: 0 0 0 3px rgba(115, 195, 254, 0.15);
}

.field-textarea {
    resize: vertical;
    min-height: 4rem;
}

.settings-actions {
    display: flex;
    gap: 0.5rem;
}

.error-msg {
    color: var(--color-error, #dc2626);
    font-size: 0.8125rem;
}

.success-msg {
    color: var(--color-success, #16a34a);
    font-size: 0.8125rem;
}
</style>
