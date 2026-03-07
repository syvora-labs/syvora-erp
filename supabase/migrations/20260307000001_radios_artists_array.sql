-- Change artist (single text) to artists (text array)
ALTER TABLE public.radios DROP COLUMN IF EXISTS artist;
ALTER TABLE public.radios ADD COLUMN artists TEXT[] NOT NULL DEFAULT '{}';
