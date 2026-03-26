import { createRouter, createWebHistory } from "vue-router";
import { supabase } from "../lib/supabase";
import { useMandator } from "../composables/useMandator";
import LoginView from "../views/LoginView.vue";
import ReleasesView from "../views/ReleasesView.vue";
import EventsView from "../views/EventsView.vue";
import ArtistsView from "../views/ArtistsView.vue";
import ArtistDetailView from "../views/ArtistDetailView.vue";
import ProfileView from "../views/ProfileView.vue";
import AdminView from "../views/AdminView.vue";
import FinancialsView from "../views/FinancialsView.vue";
import RadiosView from "../views/RadiosView.vue";
import AssociationsView from "../views/AssociationsView.vue";
import AssociationMemberDetailView from "../views/AssociationMemberDetailView.vue";
import MeetingsView from "../views/MeetingsView.vue";
import RoadmapView from "../views/RoadmapView.vue";
import LightsView from "../views/LightsView.vue";
import ContractsView from "../views/ContractsView.vue";
import ContractTemplatesView from "../views/ContractTemplatesView.vue";
import ContractSignView from "../views/ContractSignView.vue";

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        { path: "/login", component: LoginView, meta: { public: true } },
        { path: "/", component: { render: () => null }, meta: { requiresAuth: true, redirectToDefault: true } },
        { path: "/releases", component: ReleasesView, meta: { requiresAuth: true, module: "releases" } },
        { path: "/events", component: EventsView, meta: { requiresAuth: true, module: "events" } },
        { path: "/radios", component: RadiosView, meta: { requiresAuth: true, module: "radios" } },
        { path: "/artists", component: ArtistsView, meta: { requiresAuth: true, module: "artists" } },
        { path: "/artists/:id", component: ArtistDetailView, meta: { requiresAuth: true, module: "artists" } },
        { path: "/financials", component: FinancialsView, meta: { requiresAuth: true, module: "financials" } },
        { path: "/associations", component: AssociationsView, meta: { requiresAuth: true, module: "associations" } },
        { path: "/associations/:id", component: AssociationMemberDetailView, meta: { requiresAuth: true, module: "associations" } },
        { path: "/meetings", component: MeetingsView, meta: { requiresAuth: true, module: "meetings" } },
        { path: "/roadmap", component: RoadmapView, meta: { requiresAuth: true, module: "roadmap" } },
        { path: "/lights", component: LightsView, meta: { requiresAuth: true, module: "lights" } },
        { path: "/contracts", component: ContractsView, meta: { requiresAuth: true, module: "contracts" } },
        { path: "/contracts/templates", component: ContractTemplatesView, meta: { requiresAuth: true, module: "contracts" } },
        { path: "/sign/:token", component: ContractSignView, meta: { public: true } },
        { path: "/profile", component: ProfileView, meta: { requiresAuth: true } },
        { path: "/admin", component: AdminView, meta: { requiresAuth: true } },
    ],
});

function getFirstEnabledRoute(): string {
    const { enabledModules } = useMandator();
    const first = enabledModules.value[0];
    return first ? `/${first}` : "/profile";
}

router.beforeEach(async (to) => {
    const { data } = await supabase.auth.getSession();
    const isAuthenticated = !!data.session;

    if (to.meta.requiresAuth && !isAuthenticated) {
        return "/login";
    }
    if (to.path === "/login" && isAuthenticated) {
        const { waitUntilReady } = useMandator();
        await waitUntilReady();
        return getFirstEnabledRoute();
    }

    if (to.meta.redirectToDefault && isAuthenticated) {
        const { waitUntilReady } = useMandator();
        await waitUntilReady();
        return getFirstEnabledRoute();
    }

    // Guard disabled modules
    const moduleName = to.meta.module as string | undefined;
    if (moduleName && isAuthenticated) {
        const { waitUntilReady, isModuleEnabled } = useMandator();
        await waitUntilReady();
        if (!isModuleEnabled(moduleName)) {
            return getFirstEnabledRoute();
        }
    }
});

export default router;
