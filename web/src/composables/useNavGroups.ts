import { computed } from 'vue'
import { useMandator } from './useMandator'
import { useAuth } from './useAuth'

export interface NavItem {
    label: string
    to: string
    keywords?: string[]
}

export interface NavGroup {
    label: string
    items: NavItem[]
}

const GROUP_DEFS: { label: string; items: { route: string; label: string; keywords?: string[] }[] }[] = [
    {
        label: 'Content',
        items: [
            { route: 'releases', label: 'Releases', keywords: ['music', 'album', 'single', 'tracks'] },
            { route: 'radios', label: 'Radios', keywords: ['radio', 'broadcast', 'station'] },
            { route: 'artists', label: 'Artists', keywords: ['artist', 'talent', 'roster'] },
        ],
    },
    {
        label: 'Operations',
        items: [
            { route: 'events', label: 'Events', keywords: ['event', 'concert', 'show', 'gig'] },
            { route: 'financials', label: 'Financials', keywords: ['finance', 'money', 'revenue', 'expense', 'accounting'] },
            { route: 'associations', label: 'Associations', keywords: ['association', 'organization', 'partner'] },
            { route: 'meetings', label: 'Meetings', keywords: ['meeting', 'agenda', 'minutes', 'notes'] },
        ],
    },
]

export function useNavGroups() {
    const { isModuleEnabled } = useMandator()
    const { isAdmin } = useAuth()

    const groups = computed<NavGroup[]>(() => {
        const result: NavGroup[] = []

        for (const def of GROUP_DEFS) {
            const items = def.items
                .filter((item) => isModuleEnabled(item.route))
                .map((item) => ({
                    label: item.label,
                    to: `/${item.route}`,
                    keywords: item.keywords,
                }))

            if (items.length > 0) {
                result.push({ label: def.label, items })
            }
        }

        if (isAdmin.value) {
            result.push({
                label: 'Administration',
                items: [{ label: 'Administration', to: '/admin', keywords: ['admin', 'settings', 'users', 'config'] }],
            })
        }

        return result
    })

    const flatItems = computed<(NavItem & { group: string })[]>(() => {
        const result: (NavItem & { group: string })[] = []
        for (const g of groups.value) {
            for (const item of g.items) {
                result.push({ ...item, group: g.label })
            }
        }
        // Always add Profile
        result.push({ label: 'Profile', to: '/profile', keywords: ['profile', 'account', 'avatar', 'settings'], group: 'Account' })
        return result
    })

    return { groups, flatItems }
}
