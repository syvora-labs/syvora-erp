-- ─────────────────────────────────────────────────────────────────────────────
-- Roadmap Planning – horizontal timeline with categories and item bars
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add module_roadmap flag to mandators ─────────────────────────────────────
ALTER TABLE public.mandators
    ADD COLUMN module_roadmap BOOLEAN NOT NULL DEFAULT true;

UPDATE public.mandators SET module_roadmap = true;

-- ── Roadmaps table ───────────────────────────────────────────────────────────
CREATE TABLE public.roadmaps (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT        NOT NULL,
    description   TEXT,
    start_date    DATE        NOT NULL,
    end_date      DATE        NOT NULL,
    mandator_id   UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT roadmaps_date_range CHECK (end_date > start_date)
);

CREATE TRIGGER roadmaps_updated_at
    BEFORE UPDATE ON public.roadmaps
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roadmaps in their mandator"
    ON public.roadmaps FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create roadmaps in their mandator"
    ON public.roadmaps FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update roadmaps in their mandator"
    ON public.roadmaps FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete roadmaps in their mandator"
    ON public.roadmaps FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── Roadmap categories ───────────────────────────────────────────────────────
CREATE TABLE public.roadmap_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id  UUID        NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    color       TEXT,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER roadmap_categories_updated_at
    BEFORE UPDATE ON public.roadmap_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.roadmap_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roadmap categories in their mandator"
    ON public.roadmap_categories FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmaps WHERE id = roadmap_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create roadmap categories in their mandator"
    ON public.roadmap_categories FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.roadmaps WHERE id = roadmap_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update roadmap categories in their mandator"
    ON public.roadmap_categories FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmaps WHERE id = roadmap_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete roadmap categories in their mandator"
    ON public.roadmap_categories FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmaps WHERE id = roadmap_id
        AND mandator_id = public.get_my_mandator_id()
    ));

-- ── Roadmap items (bars) ─────────────────────────────────────────────────────
CREATE TABLE public.roadmap_items (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID        NOT NULL REFERENCES public.roadmap_categories(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL,
    description   TEXT,
    start_date    DATE        NOT NULL,
    end_date      DATE        NOT NULL,
    color         TEXT,
    created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT roadmap_items_date_range CHECK (end_date >= start_date)
);

CREATE TRIGGER roadmap_items_updated_at
    BEFORE UPDATE ON public.roadmap_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roadmap items in their mandator"
    ON public.roadmap_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmap_categories rc
        JOIN public.roadmaps r ON r.id = rc.roadmap_id
        WHERE rc.id = category_id
        AND r.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create roadmap items in their mandator"
    ON public.roadmap_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.roadmap_categories rc
        JOIN public.roadmaps r ON r.id = rc.roadmap_id
        WHERE rc.id = category_id
        AND r.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update roadmap items in their mandator"
    ON public.roadmap_items FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmap_categories rc
        JOIN public.roadmaps r ON r.id = rc.roadmap_id
        WHERE rc.id = category_id
        AND r.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete roadmap items in their mandator"
    ON public.roadmap_items FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.roadmap_categories rc
        JOIN public.roadmaps r ON r.id = rc.roadmap_id
        WHERE rc.id = category_id
        AND r.mandator_id = public.get_my_mandator_id()
    ));
