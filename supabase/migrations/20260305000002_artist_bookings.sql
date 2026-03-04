-- Artist bookings management

CREATE TABLE public.artist_bookings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id       UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    label_name      TEXT        NOT NULL,
    contact_name    TEXT        NOT NULL,
    contact_email   TEXT,
    contact_phone   TEXT,
    venue_location  TEXT,
    slot_time       TIME,
    booking_date    DATE        NOT NULL,
    technical_rider TEXT,
    gage            NUMERIC,
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','confirmed','completed','cancelled')),
    notes           TEXT,
    created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artist_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view artist bookings"
    ON public.artist_bookings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create artist bookings"
    ON public.artist_bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update artist bookings"
    ON public.artist_bookings FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete artist bookings"
    ON public.artist_bookings FOR DELETE TO authenticated USING (true);

CREATE TRIGGER artist_bookings_updated_at
    BEFORE UPDATE ON public.artist_bookings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
