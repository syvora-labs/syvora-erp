<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { SyvoraCard, SyvoraFormField, SyvoraInput, SyvoraButton } from '@syvora/ui'

const { signIn } = useAuth()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
    if (!email.value || !password.value) {
        error.value = 'Please enter your email and password.'
        return
    }
    loading.value = true
    error.value = ''
    try {
        await signIn(email.value, password.value)
        router.push('/releases')
    } catch (e: any) {
        error.value = e.message ?? 'Sign-in failed.'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="login-wrap">
        <div class="login-header">
            <span class="login-logo">◆</span>
            <h1 class="login-title">Syvora Label</h1>
            <p class="login-subtitle">Sign in to manage your label</p>
        </div>

        <SyvoraCard>
            <form class="login-form" @submit.prevent="handleLogin">
                <SyvoraFormField label="Email" for="email">
                    <SyvoraInput
                        id="email"
                        v-model="email"
                        type="email"
                        placeholder="you@label.com"
                        autocomplete="email"
                    />
                </SyvoraFormField>

                <SyvoraFormField label="Password" for="password">
                    <SyvoraInput
                        id="password"
                        v-model="password"
                        type="password"
                        placeholder="••••••••"
                        autocomplete="current-password"
                    />
                </SyvoraFormField>

                <p v-if="error" class="error-msg">{{ error }}</p>

                <SyvoraButton type="submit" :loading="loading" :disabled="loading" :full="true">
                    {{ loading ? 'Signing in…' : 'Sign in' }}
                </SyvoraButton>
            </form>
        </SyvoraCard>
    </div>
</template>

<style scoped>
.login-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 8rem);
    gap: 1.5rem;
}

.login-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
}

.login-logo {
    font-size: 2rem;
    color: var(--color-accent);
    line-height: 1;
}

.login-title {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--color-text);
    margin: 0;
}

.login-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
}

.login-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 340px;
}

@media (max-width: 480px) {
    .login-form {
        min-width: 0;
        width: 100%;
    }
}
</style>
