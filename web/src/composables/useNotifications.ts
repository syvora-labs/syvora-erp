import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'

export interface Notification {
    id: string
    user_id: string
    title: string
    message: string | null
    link: string | null
    read: boolean
    created_at: string
}

const notifications = ref<Notification[]>([])
const loading = ref(false)

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

let pollingInterval: ReturnType<typeof setInterval> | null = null

async function fetchNotifications() {
    loading.value = true
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50)
        if (error) throw error
        notifications.value = (data ?? []) as Notification[]
    } finally {
        loading.value = false
    }
}

async function markAsRead(notificationId: string) {
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
    if (error) throw error
    const n = notifications.value.find(n => n.id === notificationId)
    if (n) n.read = true
}

async function markAllAsRead() {
    const unreadIds = notifications.value.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds)
    if (error) throw error
    notifications.value.forEach(n => { n.read = true })
}

function startPolling(intervalMs = 30_000) {
    stopPolling()
    fetchNotifications()
    pollingInterval = setInterval(fetchNotifications, intervalMs)
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval)
        pollingInterval = null
    }
}

export function useNotifications() {
    return {
        notifications,
        loading,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        startPolling,
        stopPolling,
    }
}
