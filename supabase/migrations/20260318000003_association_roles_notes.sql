-- ─────────────────────────────────────────────────────────────────────────────
-- Associations – roles (mandator-scoped) and member notes (markdown)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Association roles table ─────────────────────────────────────────────────
CREATE TABLE public.association_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#73c3fe',
    mandator_id UUID        REFERENCES public.mandators(id) ON DELETE SET NULL,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER association_roles_updated_at
    BEFORE UPDATE ON public.association_roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.association_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view association roles"
    ON public.association_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create association roles"
    ON public.association_roles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update association roles"
    ON public.association_roles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete association roles"
    ON public.association_roles FOR DELETE TO authenticated USING (true);

-- ── Add role_id to association_members ───────────────────────────────────────
ALTER TABLE public.association_members
    ADD COLUMN role_id UUID REFERENCES public.association_roles(id) ON DELETE SET NULL;

-- ── Association member notes table ──────────────────────────────────────────
CREATE TABLE public.association_member_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID        NOT NULL REFERENCES public.association_members(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL DEFAULT '',
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER association_member_notes_updated_at
    BEFORE UPDATE ON public.association_member_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.association_member_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view association member notes"
    ON public.association_member_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create association member notes"
    ON public.association_member_notes FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update association member notes"
    ON public.association_member_notes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete association member notes"
    ON public.association_member_notes FOR DELETE TO authenticated USING (true);
