-- ─────────────────────────────────────────────────────────────────────────────
-- Associations – club member management
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add module_associations flag to mandators ─────────────────────────────────
ALTER TABLE public.mandators
    ADD COLUMN module_associations BOOLEAN NOT NULL DEFAULT true;

-- Enable for existing mandators (including seeded default)
UPDATE public.mandators SET module_associations = true;

-- ── Association members table ─────────────────────────────────────────────────
CREATE TABLE public.association_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    address     TEXT,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER association_members_updated_at
    BEFORE UPDATE ON public.association_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.association_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view association members"
    ON public.association_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create association members"
    ON public.association_members FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update association members"
    ON public.association_members FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete association members"
    ON public.association_members FOR DELETE TO authenticated USING (true);
