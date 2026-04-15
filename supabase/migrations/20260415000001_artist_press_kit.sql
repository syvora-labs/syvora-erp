-- ─────────────────────────────────────────────────────────────────────────────
-- Artist Press Kit
-- Tables: artist_press_kit_folders, artist_press_kit_files, artist_press_kit_share_links
-- Storage: press-kits (private bucket)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. artist_press_kit_folders ───────────────────────────────────────────────

CREATE TABLE public.artist_press_kit_folders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id   UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    parent_id   UUID        REFERENCES public.artist_press_kit_folders(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT press_kit_folder_name_no_slash
        CHECK (
            name !~ '[/\\]'
            AND btrim(name) <> ''
        )
);

-- Case-insensitive unique sibling folder names within the same parent.
CREATE UNIQUE INDEX artist_press_kit_folders_unique_sibling_name
    ON public.artist_press_kit_folders (artist_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name));

CREATE INDEX artist_press_kit_folders_artist_idx
    ON public.artist_press_kit_folders (artist_id);

CREATE INDEX artist_press_kit_folders_parent_idx
    ON public.artist_press_kit_folders (parent_id);

ALTER TABLE public.artist_press_kit_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view press kit folders"
    ON public.artist_press_kit_folders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create press kit folders"
    ON public.artist_press_kit_folders FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update press kit folders"
    ON public.artist_press_kit_folders FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete press kit folders"
    ON public.artist_press_kit_folders FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artist_press_kit_folders_updated_at
    BEFORE UPDATE ON public.artist_press_kit_folders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cycle prevention trigger: a folder's parent chain must never reach back to itself.
CREATE OR REPLACE FUNCTION public.press_kit_folder_prevent_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    current_parent UUID;
    steps          INTEGER := 0;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'Folder cannot be its own parent';
    END IF;

    current_parent := NEW.parent_id;
    WHILE current_parent IS NOT NULL AND steps < 1000 LOOP
        IF current_parent = NEW.id THEN
            RAISE EXCEPTION 'Cycle detected in press kit folder tree';
        END IF;
        SELECT parent_id INTO current_parent
            FROM public.artist_press_kit_folders
            WHERE id = current_parent;
        steps := steps + 1;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER artist_press_kit_folders_prevent_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON public.artist_press_kit_folders
    FOR EACH ROW EXECUTE FUNCTION public.press_kit_folder_prevent_cycle();

-- ── 2. artist_press_kit_files ─────────────────────────────────────────────────

CREATE TABLE public.artist_press_kit_files (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id     UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    folder_id     UUID        REFERENCES public.artist_press_kit_folders(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    storage_path  TEXT        NOT NULL UNIQUE,
    size_bytes    BIGINT      NOT NULL,
    mime_type     TEXT,
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT press_kit_file_name_no_slash
        CHECK (name !~ '[/\\]' AND btrim(name) <> '')
);

-- Case-insensitive unique sibling file names within the same folder.
CREATE UNIQUE INDEX artist_press_kit_files_unique_sibling_name
    ON public.artist_press_kit_files (artist_id, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name));

CREATE INDEX artist_press_kit_files_artist_idx
    ON public.artist_press_kit_files (artist_id);

CREATE INDEX artist_press_kit_files_folder_idx
    ON public.artist_press_kit_files (folder_id);

ALTER TABLE public.artist_press_kit_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view press kit files"
    ON public.artist_press_kit_files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create press kit files"
    ON public.artist_press_kit_files FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update press kit files"
    ON public.artist_press_kit_files FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete press kit files"
    ON public.artist_press_kit_files FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artist_press_kit_files_updated_at
    BEFORE UPDATE ON public.artist_press_kit_files
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. artist_press_kit_share_links ───────────────────────────────────────────

CREATE TABLE public.artist_press_kit_share_links (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id           UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    public_token        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    label               TEXT,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    download_count      INTEGER     NOT NULL DEFAULT 0,
    last_downloaded_at  TIMESTAMPTZ,
    created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX artist_press_kit_share_links_artist_idx
    ON public.artist_press_kit_share_links (artist_id);

ALTER TABLE public.artist_press_kit_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view press kit share links"
    ON public.artist_press_kit_share_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create press kit share links"
    ON public.artist_press_kit_share_links FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update press kit share links"
    ON public.artist_press_kit_share_links FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete press kit share links"
    ON public.artist_press_kit_share_links FOR DELETE TO authenticated USING (true);

-- ── 4. Helper function: collect storage paths for a folder subtree ────────────

CREATE OR REPLACE FUNCTION public.press_kit_collect_storage_paths(root_folder_id UUID)
RETURNS TABLE (storage_path TEXT) LANGUAGE sql STABLE AS $$
    WITH RECURSIVE descendants AS (
        SELECT id FROM public.artist_press_kit_folders WHERE id = root_folder_id
        UNION ALL
        SELECT f.id
        FROM public.artist_press_kit_folders f
        JOIN descendants d ON f.parent_id = d.id
    )
    SELECT pkf.storage_path
    FROM public.artist_press_kit_files pkf
    WHERE pkf.folder_id IN (SELECT id FROM descendants);
$$;

GRANT EXECUTE ON FUNCTION public.press_kit_collect_storage_paths(UUID) TO authenticated;

-- ── 5. Storage bucket: press-kits (private) ───────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'press-kits',
    'press-kits',
    false,
    5368709120  -- 5 GB per-object
)
ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated press-kits read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'press-kits');

CREATE POLICY "Authenticated press-kits upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'press-kits');

CREATE POLICY "Authenticated press-kits update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'press-kits');

CREATE POLICY "Authenticated press-kits delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'press-kits');
