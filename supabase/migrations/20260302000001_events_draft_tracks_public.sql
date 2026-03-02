-- ─────────────────────────────────────────────────────────────────────────────
-- Events: draft / publish workflow
-- ─────────────────────────────────────────────────────────────────────────────

-- New events start as drafts; set is_draft = false to publish them.
ALTER TABLE public.events
    ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks: make bucket public so audio URLs work directly in the browser
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets SET public = true WHERE id = 'tracks';
