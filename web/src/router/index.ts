import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'
import { useMandator } from '../composables/useMandator'
import LoginView from '../views/LoginView.vue'
import ReleasesView from '../views/ReleasesView.vue'
import EventsView from '../views/EventsView.vue'
import ArtistsView from '../views/ArtistsView.vue'
import ArtistDetailView from '../views/ArtistDetailView.vue'
import ProfileView from '../views/ProfileView.vue'
import AdminView from '../views/AdminView.vue'
import FinancialsView from '../views/FinancialsView.vue'
import RadiosView from '../views/RadiosView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        { path: '/login', component: LoginView, meta: { public: true } },
        { path: '/', redirect: '/releases' },
        { path: '/releases', component: ReleasesView, meta: { requiresAuth: true, module: 'releases' } },
        { path: '/events', component: EventsView, meta: { requiresAuth: true, module: 'events' } },
        { path: '/radios', component: RadiosView, meta: { requiresAuth: true, module: 'radios' } },
        { path: '/artists', component: ArtistsView, meta: { requiresAuth: true, module: 'artists' } },
        { path: '/artists/:id', component: ArtistDetailView, meta: { requiresAuth: true, module: 'artists' } },
        { path: '/financials', component: FinancialsView, meta: { requiresAuth: true, module: 'financials' } },
        { path: '/profile', component: ProfileView, meta: { requiresAuth: true } },
        { path: '/admin', component: AdminView, meta: { requiresAuth: true } },
    ],
})

router.beforeEach(async (to) => {
    const { data } = await supabase.auth.getSession()
    const isAuthenticated = !!data.session

    if (to.meta.requiresAuth && !isAuthenticated) {
        return '/login'
    }
    if (to.path === '/login' && isAuthenticated) {
        return '/releases'
    }

    // Guard disabled modules
    const moduleName = to.meta.module as string | undefined
    if (moduleName && isAuthenticated) {
        const { isModuleEnabled, enabledModules } = useMandator()
        if (!isModuleEnabled(moduleName)) {
            // Redirect to the first enabled module, or /profile as last resort
            const firstEnabled = enabledModules.value[0]
            return firstEnabled ? `/${firstEnabled}` : '/profile'
        }
    }
})

export default router
