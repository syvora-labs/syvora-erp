-- Artist show assignments

CREATE TABLE public.artist_shows (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id   UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    show_name   TEXT        NOT NULL,
    show_date   DATE        NOT NULL,
    slot_time   TIME,
    notes       TEXT,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artist_shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view artist shows"
    ON public.artist_shows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create artist shows"
    ON public.artist_shows FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update artist shows"
    ON public.artist_shows FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete artist shows"
    ON public.artist_shows FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artist_shows_updated_at
    BEFORE UPDATE ON public.artist_shows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
