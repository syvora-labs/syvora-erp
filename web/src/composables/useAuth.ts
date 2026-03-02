import { ref, computed } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Profile {
    id: string
    username: string
    display_name: string | null
    bio: string | null
    avatar_url: string | null
    role: 'admin' | 'member'
    created_at: string
    updated_at: string
}

const currentUser = ref<User | null>(null)
const currentProfile = ref<Profile | null>(null)

async function fetchProfile(userId: string) {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
    currentProfile.value = data as Profile | null
}

supabase.auth.getSession().then(({ data }) => {
    currentUser.value = data.session?.user ?? null
    if (currentUser.value) fetchProfile(currentUser.value.id)
})

supabase.auth.onAuthStateChange((_event, session) => {
    currentUser.value = session?.user ?? null
    if (currentUser.value) {
        fetchProfile(currentUser.value.id)
    } else {
        currentProfile.value = null
    }
})

export function useAuth() {
    const isAuthenticated = computed(() => currentUser.value !== null)
    const isAdmin = computed(() => currentProfile.value?.role === 'admin')

    async function signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
    }

    async function updatePassword(newPassword: string) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
    }

    async function updateProfile(updates: {
        display_name?: string | null
        bio?: string | null
        avatar_url?: string | null
    }) {
        if (!currentUser.value) return
        const { error } = await supabase
            .from('profiles')
            .upsert({ id: currentUser.value.id, username: currentProfile.value?.username ?? currentUser.value.email ?? '', ...updates })
        if (error) throw error
        await fetchProfile(currentUser.value.id)
    }

    async function uploadAvatar(file: File): Promise<string> {
        if (!currentUser.value) throw new Error('Not authenticated')
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${currentUser.value.id}/avatar.${ext}`
        const { error } = await supabase.storage
            .from('avatars')
            .upload(path, file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        return data.publicUrl
    }

    return {
        currentUser,
        currentProfile,
        isAuthenticated,
        isAdmin,
        signIn,
        signOut,
        updatePassword,
        updateProfile,
        uploadAvatar,
    }
}
