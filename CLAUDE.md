# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
yarn install

# Local dev server (port 5173)
yarn workspace web dev

# Type check + production build
yarn workspace web build

# Preview production build
yarn workspace web preview

# Docker dev environment (hot reload)
docker compose up --build
```

Environment variables required in `web/.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_SERVICE_ROLE_KEY`

There are no tests configured in this project.

## Architecture

**Monorepo** using Yarn workspaces with two packages:
- `web/` — Vue 3 + TypeScript + Vite SPA (the main application)
- `packages/ui/` — `@syvora/ui` shared component library (custom glassmorphism design system, no external UI framework)

**Backend**: Supabase (PostgreSQL + Auth + Storage + RLS). No custom backend server — the Vue app talks directly to Supabase via `@supabase/supabase-js`. The Supabase client is initialized in `web/src/lib/supabase.ts`.

**State management**: Vue 3 composables pattern with module-level reactive refs (no Pinia/Vuex). Each domain has a composable in `web/src/composables/` (e.g., `useReleases`, `useEvents`, `useMeetings`).

**Multi-tenancy**: Mandator-scoped via `mandators` table with per-org module toggles (module_releases, module_events, etc.). RLS policies and a `get_my_mandator_id()` Postgres function enforce tenant isolation. The `useMandator` composable manages module availability on the frontend.

**Auth model**: No self-registration. Admins create accounts via AdminView. Roles are `admin` or `member`. Route guards in `web/src/router/index.ts` enforce auth and module access.

**Database migrations**: Sequential SQL files in `supabase/migrations/`. Key tables: profiles, releases, tracks, events, artists, financial_transactions, meetings, association_members, mandators.

**Deployment**: Vercel via GitHub Actions (`.github/workflows/deploy.yml`). SPA fallback configured in `web/vercel.json`.

## Key Conventions

- **Commit messages**: Conventional commits format — `feat(web):`, `fix(vercel):`, `feat(ui):` scoped to the affected package
- **Component naming**: All UI components prefixed with `Syvora` (e.g., `SyvoraButton`, `SyvoraCard`, `SyvoraModal`)
- **Path alias**: `@syvora/ui` resolves to `packages/ui/src` via tsconfig paths and Vite config
- **TypeScript**: Strict mode with unused locals/parameters detection; `vue-tsc` runs before production builds
- **CSS**: Custom design system using CSS variables defined in `packages/ui/src/style.css` — no Tailwind or CSS framework
