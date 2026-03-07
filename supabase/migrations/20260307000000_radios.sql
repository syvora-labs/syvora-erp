-- Radios table
CREATE TABLE public.radios (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    artist      TEXT,
    release_date DATE,
    is_draft    BOOLEAN     NOT NULL DEFAULT true,
    is_archived BOOLEAN     NOT NULL DEFAULT false,
    created_by  UUID        REFERENCES auth.users(id),
    updated_by  UUID        REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE TRIGGER set_radios_updated_at
    BEFORE UPDATE ON public.radios
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Radio file attachments
CREATE TABLE public.radio_files (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    radio_id    UUID        NOT NULL REFERENCES public.radios(id) ON DELETE CASCADE,
    label       TEXT        NOT NULL,
    file_url    TEXT        NOT NULL,
    file_name   TEXT        NOT NULL,
    file_size   BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for radios
ALTER TABLE public.radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view radios"
    ON public.radios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create radios"
    ON public.radios FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update radios"
    ON public.radios FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete radios"
    ON public.radios FOR DELETE TO authenticated USING (true);

-- RLS for radio_files
ALTER TABLE public.radio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view radio files"
    ON public.radio_files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create radio files"
    ON public.radio_files FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete radio files"
    ON public.radio_files FOR DELETE TO authenticated USING (true);
