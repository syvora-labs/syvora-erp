-- Permanent QR tokens for team members and artists (free entry to all events)

ALTER TABLE public.team_members
    ADD COLUMN qr_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid();

ALTER TABLE public.artists
    ADD COLUMN qr_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid();
