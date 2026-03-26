-- Add archive support for contracts
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
