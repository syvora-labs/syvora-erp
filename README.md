# Syvora ERP

An internal web application for managing a record label — releases, events, artists, financials, radios, associations, meetings, and team members.

## What it does

- **Releases** — create and manage albums, EPs, singles, and compilations. Upload artwork and audio tracks, set release dates, and reorder tracklists.
- **Events** — create and manage shows and release parties with draft/publish workflow. Set lineup, location, date/time, artwork, and ticket links.
- **Artists** — manage artist profiles with pictures, notes, booking history, and show appearances. Track managed vs. external artists.
- **Financials** — income and expense tracking with custom categories, transaction status (confirmed/pending), and a dashboard with charts.
- **Radios** — manage radio shows with file attachments, artist tags, release dates, and draft/archive workflow.
- **Associations** — club member management with contact details.
- **Meetings** — schedule meetings, take notes, assign follow-up tasks, and send email notifications to participants.
- **Users** — admin can create and manage team member accounts. Users set their own password and customise their profile.
- **Mandator** — multi-tenant system with per-tenant module toggles (admin can enable/disable modules per organisation).

---

## Project structure

```
syvora-erp/
├── docker-compose.yml
├── .env.example                  # required env vars (copy → .env)
├── packages/
│   └── ui/                       # @syvora/ui — shared Vue 3 component library
│       └── src/
│           ├── components/       # AppShell, SyvoraButton, SyvoraCard, SyvoraModal,
│           │                     # SyvoraBadge, SyvoraDrawer, SyvoraTabs, …
│           ├── index.ts
│           └── style.css         # glassmorphism design system tokens
├── supabase/
│   └── migrations/               # run in order via Supabase SQL Editor
│       ├── 20260302000000_record_label_schema.sql
│       ├── 20260302000001_events_draft_tracks_public.sql
│       ├── 20260302000002_profiles_insert_policy.sql
│       ├── 20260304000000_events_archived.sql
│       ├── 20260304000001_audit_updated_by.sql
│       ├── 20260304000002_artists.sql
│       ├── 20260304000003_artist_shows.sql
│       ├── 20260305000000_financials.sql
│       ├── 20260305000001_artists_is_managed.sql
│       ├── 20260305000002_artist_bookings.sql
│       ├── 20260305000003_artist_managed_by.sql
│       ├── 20260305000004_transaction_pending.sql
│       ├── 20260307000000_radios.sql
│       ├── 20260307000001_radios_artists_array.sql
│       ├── 20260307000002_radios_soundcloud_link.sql
│       ├── 20260312000000_mandators.sql
│       ├── 20260314000000_associations.sql
│       └── 20260316000000_meetings.sql
└── web/
    ├── Dockerfile.dev
    └── src/
        ├── lib/
        │   └── supabase.ts           # Supabase client singleton
        ├── composables/
        │   ├── useAuth.ts            # auth state, profile, password management
        │   ├── useReleases.ts        # releases + tracks CRUD + file uploads
        │   ├── useEvents.ts          # events CRUD + draft/publish + file uploads
        │   ├── useArtists.ts         # artist profiles, notes, bookings
        │   ├── useFinancialCategories.ts
        │   ├── useFinancialTransactions.ts
        │   ├── useFinancialDashboard.ts
        │   ├── useRadios.ts          # radio shows + file attachments
        │   ├── useAssociations.ts    # association member management
        │   ├── useMeetings.ts        # meetings, tasks, notifications
        │   ├── useMandator.ts        # multi-tenant module flags
        │   └── useNotifications.ts   # email notifications
        ├── views/
        │   ├── LoginView.vue
        │   ├── ReleasesView.vue
        │   ├── EventsView.vue
        │   ├── ArtistsView.vue
        │   ├── ArtistDetailView.vue
        │   ├── FinancialsView.vue
        │   ├── RadiosView.vue
        │   ├── AssociationsView.vue
        │   ├── MeetingsView.vue
        │   ├── ProfileView.vue
        │   └── AdminView.vue
        └── router/
            └── index.ts              # auth-guarded routes + module guards
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite |
| UI library | `@syvora/ui` (internal) |
| Backend / Auth | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Package manager | Yarn workspaces |
| Container | Docker + Docker Compose |

---

## Database schema

| Table | Description |
|-------|-------------|
| `profiles` | Linked to Supabase auth users. Stores username, display name, bio, avatar, role (`admin` / `member`), and mandator reference. |
| `releases` | Albums, EPs, singles, compilations. Includes artwork URL and release date. |
| `tracks` | Audio tracks linked to a release. Stores title, track number, and file URL. |
| `events` | Shows and release parties. Includes lineup array, location, datetime, artwork, ticket link, draft and archived flags. |
| `artists` | Artist profiles with name and picture. |
| `artist_notes` | Free-text notes linked to an artist. |
| `artist_shows` | Links artists to events (show appearances). |
| `artist_bookings` | Booking history for managed artists. |
| `financial_categories` | Income/expense categories with colour coding. |
| `financial_transactions` | Individual income or expense entries linked to a category, with confirmed/pending status. |
| `radios` | Radio shows with description, artist tags, SoundCloud link, draft/archive flags. |
| `radio_files` | File attachments (audio, documents) linked to a radio show. |
| `mandators` | Multi-tenant organisations with per-module enable/disable flags. |
| `association_members` | Club/association members with contact details. |
| `meetings` | Scheduled meetings scoped to a mandator. |
| `meeting_tasks` | Follow-up tasks linked to a meeting. |
| `notifications` | Email notifications linked to meetings. |

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
- Routes are further guarded by mandator module flags — disabled modules are inaccessible and the user is redirected to the first enabled module.

---

## Getting started

See [GETTING_STARTED.md](GETTING_STARTED.md).
