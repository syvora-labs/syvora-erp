# Syvora Label Management

An internal web application for managing a record label — releases, events, and team members.

## What it does

- **Releases** — create and manage albums, EPs, singles, and compilations. Upload artwork and audio tracks, set release dates, and reorder tracklists.
- **Events** — create and manage shows and release parties with draft/publish workflow. Set lineup, location, date/time, artwork, and ticket links.
- **Users** — admin can create and manage team member accounts. Users set their own password and customise their profile.

---

## Project structure

```
syvora-erp/
├── docker-compose.yml
├── .env.example                  # required env vars (copy → .env)
├── packages/
│   └── ui/                       # @syvora/ui — shared Vue 3 component library
│       └── src/
│           ├── components/       # AppShell, SyvoraButton, SyvoraCard, SyvoraModal, …
│           ├── index.ts
│           └── style.css         # glassmorphism design system tokens
├── supabase/
│   └── migrations/
│       ├── 20260302000000_record_label_schema.sql   # core tables + RLS + storage
│       ├── 20260302000001_events_draft_tracks_public.sql
│       └── 20260302000002_profiles_insert_policy.sql
└── web/
    ├── Dockerfile.dev
    └── src/
        ├── lib/
        │   └── supabase.ts           # Supabase client singleton
        ├── composables/
        │   ├── useAuth.ts            # auth state, profile, password management
        │   ├── useReleases.ts        # releases + tracks CRUD + file uploads
        │   └── useEvents.ts          # events CRUD + draft/publish + file uploads
        ├── views/
        │   ├── LoginView.vue
        │   ├── ReleasesView.vue
        │   ├── EventsView.vue
        │   ├── ProfileView.vue
        │   └── AdminView.vue
        └── router/
            └── index.ts              # auth-guarded routes
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite |
| UI library | `@syvora/ui` (internal) |
| Backend / Auth | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Package manager | npm workspaces |
| Container | Docker + Docker Compose |

---

## Database schema

| Table | Description |
|-------|-------------|
| `profiles` | Linked to Supabase auth users. Stores username, display name, bio, avatar, role (`admin` / `member`). |
| `releases` | Albums, EPs, singles, compilations. Includes artwork URL and release date. |
| `tracks` | Audio tracks linked to a release. Stores title, track number, and file URL. |
| `events` | Shows and release parties. Includes lineup array, location, datetime, artwork, ticket link, and draft flag. |

### Storage buckets

| Bucket | Access | Used for |
|--------|--------|----------|
| `artwork` | Public | Release and event artwork images |
| `tracks` | Public | Audio file uploads |
| `avatars` | Public | User profile pictures |

---

## Auth model

- **No self-registration.** An admin creates all user accounts from the Users tab.
- Newly created users log in with the password set by the admin and can change it from their Profile page.
- Role-based access: `admin` users can access the Users tab; `member` users cannot.
- All routes except `/login` require authentication (enforced by the router guard).

---

## Getting started

See [GETTING_STARTED.md](GETTING_STARTED.md).
