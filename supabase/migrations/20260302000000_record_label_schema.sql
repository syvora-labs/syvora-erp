-- ─────────────────────────────────────────────────────────────────────────────
-- Record Label Management Schema
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT        UNIQUE NOT NULL,
    display_name TEXT,
    bio         TEXT,
    avatar_url  TEXT,
    role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Releases (albums, EPs, singles, compilations) ─────────────────────────────
CREATE TABLE public.releases (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL,
    type         TEXT        NOT NULL DEFAULT 'album' CHECK (type IN ('album', 'ep', 'single', 'compilation')),
    artist       TEXT        NOT NULL,
    description  TEXT,
    artwork_url  TEXT,
    release_date DATE,
    created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tracks (linked to releases) ───────────────────────────────────────────────
CREATE TABLE public.tracks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id   UUID        NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL,
    track_number INTEGER,
    file_url     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE TABLE public.events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    lineup      TEXT[]      NOT NULL DEFAULT '{}',
    location    TEXT,
    event_date  TIMESTAMPTZ,
    artwork_url TEXT,
    ticket_link TEXT,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER releases_updated_at  BEFORE UPDATE ON public.releases  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER events_updated_at    BEFORE UPDATE ON public.events    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create profile on new user (when admin creates user via service role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
        INSERT INTO public.profiles (id, username, display_name, role)
        VALUES (
            NEW.id,
            NEW.raw_user_meta_data->>'username',
            NEW.raw_user_meta_data->>'display_name',
            COALESCE(NEW.raw_user_meta_data->>'role', 'member')
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events   ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Releases
CREATE POLICY "Authenticated users can view releases"
    ON public.releases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create releases"
    ON public.releases FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update releases"
    ON public.releases FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete releases"
    ON public.releases FOR DELETE TO authenticated USING (true);

-- Tracks
CREATE POLICY "Authenticated users can view tracks"
    ON public.tracks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage tracks"
    ON public.tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Events
CREATE POLICY "Authenticated users can view events"
    ON public.events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create events"
    ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update events"
    ON public.events FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete events"
    ON public.events FOR DELETE TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('artwork', 'artwork', true,  52428800, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
    ('tracks',  'tracks',  false, 52428800, ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/flac','audio/aac','audio/ogg']),
    ('avatars', 'avatars', true,  5242880,  ARRAY['image/jpeg','image/png','image/webp']);

-- Artwork storage policies
CREATE POLICY "Public artwork read"
    ON storage.objects FOR SELECT USING (bucket_id = 'artwork');

CREATE POLICY "Authenticated artwork upload"
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'artwork');

CREATE POLICY "Authenticated artwork update"
    ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'artwork');

CREATE POLICY "Authenticated artwork delete"
    ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'artwork');

-- Tracks storage policies
CREATE POLICY "Authenticated tracks read"
    ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tracks');

CREATE POLICY "Authenticated tracks upload"
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tracks');

CREATE POLICY "Authenticated tracks update"
    ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'tracks');

CREATE POLICY "Authenticated tracks delete"
    ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tracks');

-- Avatars storage policies
CREATE POLICY "Public avatars read"
    ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated avatars upload"
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated avatars update"
    ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated avatars delete"
    ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');
