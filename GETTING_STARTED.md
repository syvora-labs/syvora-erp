# Getting Started

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A [Supabase](https://supabase.com) project

---

## 1. Set up Supabase

### Create the project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Once it's ready, go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `VITE_SUPABASE_SERVICE_ROLE_KEY`

### Run the migrations

In your Supabase project, open the **SQL Editor** and run the migration files in order:

1. `supabase/migrations/20260302000000_record_label_schema.sql`
2. `supabase/migrations/20260302000001_events_draft_tracks_public.sql`
3. `supabase/migrations/20260302000002_profiles_insert_policy.sql`

Each file can be pasted directly into the SQL Editor and executed.

---

## 2. Configure environment variables

Copy `.env.example` to `.env` in the project root and fill in your Supabase values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<service-role-secret-key>
```

> **Note:** The service role key bypasses RLS. It is only used server-side in the admin user-management functions. Keep it out of public repositories.

---

## 3. Start the development server

```bash
docker compose up --build
```

This starts a single container running the Vite dev server. Wait until you see `VITE ready` in the logs, then open [http://localhost:5173](http://localhost:5173).

> **First run only:** Docker builds the image and installs all npm dependencies inside the container. This can take a minute or two. Subsequent starts are much faster.

---

## 4. Create the first admin user

There is no registration flow — all accounts are created by an admin. To bootstrap the first admin account:

1. In the Supabase dashboard, go to **Authentication → Users** and click **Add user**.
2. Enter an email and password, then click **Create user**. Copy the new user's UUID.
3. Open the **SQL Editor** and run:

```sql
INSERT INTO public.profiles (id, username, role)
VALUES ('<paste-user-uuid-here>', 'admin', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

4. Log in at [http://localhost:5173](http://localhost:5173) with the email and password you set.

The admin account now has access to the **Users** tab and can create additional team member accounts from within the app.

---

## 5. Day-to-day usage

| Task | Where |
|------|-------|
| Manage releases (albums, EPs, singles, compilations) | **Releases** tab |
| Upload artwork and audio tracks | Release edit modal |
| Create and publish events | **Events** tab |
| Create team member accounts | **Users** tab (admin only) |
| Update your display name, bio, or avatar | **Profile** (avatar icon, top right) |
| Change your password | **Profile → Change Password** |

---

## Running without Docker

If you prefer to run outside Docker:

```bash
npm install
npm run dev -w web
```

The app will be available at [http://localhost:5173](http://localhost:5173).
