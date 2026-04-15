-- ─────────────────────────────────────────────────────────────────────────────
-- Artist Press Kit — transparent chunking for large files
--
-- Files above the Supabase project-level upload cap are split on the client
-- into N Storage objects at `<storage_path>.part-0000`, `.part-0001`, … and
-- `chunk_count` records how many parts to reassemble on download.
--
-- Existing rows default to `chunk_count = 1` and keep the legacy single-object
-- layout (one object at exactly `storage_path`).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.artist_press_kit_files
    ADD COLUMN IF NOT EXISTS chunk_count INTEGER NOT NULL DEFAULT 1
        CHECK (chunk_count >= 1);
