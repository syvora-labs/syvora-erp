-- Artists and artist notes

CREATE TABLE public.artists (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    picture_url TEXT,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view artists"
    ON public.artists FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create artists"
    ON public.artists FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update artists"
    ON public.artists FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete artists"
    ON public.artists FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artists_updated_at
    BEFORE UPDATE ON public.artists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.artist_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id   UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL DEFAULT '',
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artist_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view artist notes"
    ON public.artist_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create artist notes"
    ON public.artist_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update artist notes"
    ON public.artist_notes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete artist notes"
    ON public.artist_notes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artist_notes_updated_at
    BEFORE UPDATE ON public.artist_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
