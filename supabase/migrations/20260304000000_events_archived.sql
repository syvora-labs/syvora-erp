-- ─────────────────────────────────────────────────────────────────────────────
-- Events: archive workflow
-- ─────────────────────────────────────────────────────────────────────────────

-- Archived events are hidden from the active list but preserved for history.
ALTER TABLE public.events
    ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
