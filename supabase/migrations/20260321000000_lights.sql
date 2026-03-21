-- ─────────────────────────────────────────────────────────────────────────────
-- Lights – custom lightshows for events (gradient, buildup, text modes)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add module_lights flag to mandators ─────────────────────────────────────
ALTER TABLE public.mandators
    ADD COLUMN module_lights BOOLEAN NOT NULL DEFAULT true;

UPDATE public.mandators SET module_lights = true;

-- ── Lightshows table ────────────────────────────────────────────────────────
CREATE TABLE public.lightshows (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT        NOT NULL,
    description   TEXT,
    mandator_id   UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER lightshows_updated_at
    BEFORE UPDATE ON public.lightshows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lightshows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lightshows in their mandator"
    ON public.lightshows FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create lightshows in their mandator"
    ON public.lightshows FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update lightshows in their mandator"
    ON public.lightshows FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete lightshows in their mandator"
    ON public.lightshows FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── Lightshow modes ─────────────────────────────────────────────────────────
CREATE TABLE public.lightshow_modes (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lightshow_id  UUID        NOT NULL REFERENCES public.lightshows(id) ON DELETE CASCADE,
    type          TEXT        NOT NULL CHECK (type IN ('gradient', 'buildup', 'text')),
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    config        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER lightshow_modes_updated_at
    BEFORE UPDATE ON public.lightshow_modes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lightshow_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lightshow modes in their mandator"
    ON public.lightshow_modes FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.lightshows WHERE id = lightshow_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create lightshow modes in their mandator"
    ON public.lightshow_modes FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.lightshows WHERE id = lightshow_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update lightshow modes in their mandator"
    ON public.lightshow_modes FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.lightshows WHERE id = lightshow_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete lightshow modes in their mandator"
    ON public.lightshow_modes FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.lightshows WHERE id = lightshow_id
        AND mandator_id = public.get_my_mandator_id()
    ));
