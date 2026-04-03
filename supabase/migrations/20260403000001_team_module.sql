-- ─────────────────────────────────────────────────────────────────────────────
-- Team Module
-- Tables: team_members, team_event_assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ALTER TABLE mandators ─────────────────────────────────────────────────

ALTER TABLE public.mandators
    ADD COLUMN IF NOT EXISTS module_team BOOLEAN NOT NULL DEFAULT true;

UPDATE public.mandators SET module_team = true WHERE module_team IS NULL;

-- ── 2. team_members ──────────────────────────────────────────────────────────

CREATE TABLE public.team_members (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id     UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    full_name       TEXT        NOT NULL,
    image_url       TEXT,
    general_roles   TEXT[]      NOT NULL DEFAULT '{}',
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team members in their mandator"
    ON public.team_members FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create team members in their mandator"
    ON public.team_members FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update team members in their mandator"
    ON public.team_members FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete team members in their mandator"
    ON public.team_members FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE TRIGGER team_members_updated_at
    BEFORE UPDATE ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. team_event_assignments ────────────────────────────────────────────────

CREATE TABLE public.team_event_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id  UUID        NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
    event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    event_role      TEXT        NOT NULL,
    notes           TEXT,
    created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_member_id, event_id, event_role)
);

ALTER TABLE public.team_event_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team event assignments in their mandator"
    ON public.team_event_assignments FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.id = team_member_id AND tm.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create team event assignments in their mandator"
    ON public.team_event_assignments FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.id = team_member_id AND tm.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update team event assignments in their mandator"
    ON public.team_event_assignments FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.id = team_member_id AND tm.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete team event assignments in their mandator"
    ON public.team_event_assignments FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.id = team_member_id AND tm.mandator_id = public.get_my_mandator_id()
    ));

-- ── 4. Storage bucket: team-photos ───────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'team-photos',
    'team-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public team-photos read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'team-photos');

CREATE POLICY "Authenticated team-photos upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'team-photos');

CREATE POLICY "Authenticated team-photos update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'team-photos');

CREATE POLICY "Authenticated team-photos delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'team-photos');
