-- Add title column to meeting_notes
ALTER TABLE public.meeting_notes
    ADD COLUMN title TEXT NOT NULL DEFAULT '';
