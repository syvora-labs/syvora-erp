-- ─────────────────────────────────────────────────────────────────────────────
-- Events & Releases – mandator profile support
-- Scope events, releases, and tracks to mandators.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── events: add mandator_id ───────────────────────────────────────────────────

ALTER TABLE public.events
    ADD COLUMN mandator_id UUID REFERENCES public.mandators(id) ON DELETE CASCADE;

UPDATE public.events
    SET mandator_id = '00000000-0000-0000-0000-000000000001'
    WHERE mandator_id IS NULL;

ALTER TABLE public.events
    ALTER COLUMN mandator_id SET NOT NULL;

CREATE INDEX idx_events_mandator ON public.events(mandator_id);

-- Replace RLS policies with mandator-scoped ones

DROP POLICY "Authenticated users can view events" ON public.events;
DROP POLICY "Authenticated users can create events" ON public.events;
DROP POLICY "Authenticated users can update events" ON public.events;
DROP POLICY "Authenticated users can delete events" ON public.events;

CREATE POLICY "Users can view events in their mandator"
    ON public.events FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create events in their mandator"
    ON public.events FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update events in their mandator"
    ON public.events FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete events in their mandator"
    ON public.events FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── releases: add mandator_id ─────────────────────────────────────────────────

ALTER TABLE public.releases
    ADD COLUMN mandator_id UUID REFERENCES public.mandators(id) ON DELETE CASCADE;

UPDATE public.releases
    SET mandator_id = '00000000-0000-0000-0000-000000000001'
    WHERE mandator_id IS NULL;

ALTER TABLE public.releases
    ALTER COLUMN mandator_id SET NOT NULL;

CREATE INDEX idx_releases_mandator ON public.releases(mandator_id);

-- Replace RLS policies with mandator-scoped ones

DROP POLICY "Authenticated users can view releases" ON public.releases;
DROP POLICY "Authenticated users can create releases" ON public.releases;
DROP POLICY "Authenticated users can update releases" ON public.releases;
DROP POLICY "Authenticated users can delete releases" ON public.releases;

CREATE POLICY "Users can view releases in their mandator"
    ON public.releases FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create releases in their mandator"
    ON public.releases FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update releases in their mandator"
    ON public.releases FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete releases in their mandator"
    ON public.releases FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── tracks: mandator-scoped through releases ──────────────────────────────────
-- Tracks are linked to releases via release_id. Update RLS to scope through
-- the parent release's mandator_id (same pattern as meeting_notes → meetings).

DROP POLICY "Authenticated users can view tracks" ON public.tracks;
DROP POLICY "Authenticated users can manage tracks" ON public.tracks;

CREATE POLICY "Users can view tracks in their mandator"
    ON public.tracks FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.releases WHERE id = release_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create tracks in their mandator"
    ON public.tracks FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.releases WHERE id = release_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update tracks in their mandator"
    ON public.tracks FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.releases WHERE id = release_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete tracks in their mandator"
    ON public.tracks FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.releases WHERE id = release_id
        AND mandator_id = public.get_my_mandator_id()
    ));
