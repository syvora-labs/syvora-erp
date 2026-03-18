-- ─────────────────────────────────────────────────────────────────────────────
-- Roadmap items – link to system events and releases
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.roadmap_items
    ADD COLUMN linked_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.roadmap_items
    ADD COLUMN linked_release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL;
