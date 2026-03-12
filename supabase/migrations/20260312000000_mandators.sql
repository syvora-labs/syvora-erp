-- ─────────────────────────────────────────────────────────────────────────────
-- Mandator Profiles – per-tenant module flags
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Mandators table ─────────────────────────────────────────────────────────
CREATE TABLE public.mandators (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT        NOT NULL,
    module_artists    BOOLEAN     NOT NULL DEFAULT true,
    module_releases   BOOLEAN     NOT NULL DEFAULT true,
    module_events     BOOLEAN     NOT NULL DEFAULT true,
    module_radios     BOOLEAN     NOT NULL DEFAULT true,
    module_financials BOOLEAN     NOT NULL DEFAULT true,
    created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER mandators_updated_at BEFORE UPDATE ON public.mandators FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Seed a default mandator with all modules enabled ────────────────────────
INSERT INTO public.mandators (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default');

-- ── Add mandator_id FK to profiles ──────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN mandator_id UUID REFERENCES public.mandators(id) ON DELETE SET NULL;

-- Assign all existing profiles to the default mandator
UPDATE public.profiles SET mandator_id = '00000000-0000-0000-0000-000000000001';

-- ── Update handle_new_user trigger to assign default mandator ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
        INSERT INTO public.profiles (id, username, display_name, role, mandator_id)
        VALUES (
            NEW.id,
            NEW.raw_user_meta_data->>'username',
            NEW.raw_user_meta_data->>'display_name',
            COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
            '00000000-0000-0000-0000-000000000001'
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ── RLS for mandators ───────────────────────────────────────────────────────
ALTER TABLE public.mandators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mandators"
    ON public.mandators FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert mandators"
    ON public.mandators FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update mandators"
    ON public.mandators FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete mandators"
    ON public.mandators FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
