-- ─────────────────────────────────────────────────────────────────────────────
-- Sales Module
-- Tables: ticket_phases, ticket_orders, tickets
-- Mandator extensions: module_sales, stripe_secret_key, stripe_webhook_secret
-- Helper function: get_phase_sold_count
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ALTER TABLE mandators ─────────────────────────────────────────────────

ALTER TABLE public.mandators
    ADD COLUMN IF NOT EXISTS module_sales BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT,
    ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT;

UPDATE public.mandators SET module_sales = true WHERE module_sales IS NULL;

-- ── 2. ticket_phases ─────────────────────────────────────────────────────────

CREATE TABLE public.ticket_phases (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    mandator_id     UUID        NOT NULL REFERENCES public.mandators(id),
    name            TEXT        NOT NULL,
    description     TEXT,
    price_cents     INTEGER     NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'chf',
    quantity        INTEGER     NOT NULL,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    sale_start      TIMESTAMPTZ,
    sale_end        TIMESTAMPTZ,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_by      UUID        REFERENCES auth.users(id),
    updated_by      UUID        REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ticket phases in their mandator"
    ON public.ticket_phases FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create ticket phases in their mandator"
    ON public.ticket_phases FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can update ticket phases in their mandator"
    ON public.ticket_phases FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete ticket phases in their mandator"
    ON public.ticket_phases FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE TRIGGER ticket_phases_updated_at
    BEFORE UPDATE ON public.ticket_phases
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. ticket_orders ─────────────────────────────────────────────────────────

CREATE TABLE public.ticket_orders (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id                 UUID        NOT NULL REFERENCES public.mandators(id),
    event_id                    UUID        NOT NULL REFERENCES public.events(id),
    buyer_name                  TEXT        NOT NULL,
    buyer_email                 TEXT        NOT NULL,
    status                      TEXT        NOT NULL DEFAULT 'pending',
    total_cents                 INTEGER     NOT NULL,
    currency                    TEXT        NOT NULL DEFAULT 'chf',
    stripe_checkout_session_id  TEXT        UNIQUE,
    stripe_payment_intent_id    TEXT,
    paid_at                     TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    email_sent_at               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ticket orders in their mandator"
    ON public.ticket_orders FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can update ticket orders in their mandator"
    ON public.ticket_orders FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE TRIGGER ticket_orders_updated_at
    BEFORE UPDATE ON public.ticket_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. tickets ───────────────────────────────────────────────────────────────

CREATE TABLE public.tickets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
    phase_id        UUID        NOT NULL REFERENCES public.ticket_phases(id),
    event_id        UUID        NOT NULL REFERENCES public.events(id),
    mandator_id     UUID        NOT NULL REFERENCES public.mandators(id),
    qr_token        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    status          TEXT        NOT NULL DEFAULT 'valid',
    checked_in_at   TIMESTAMPTZ,
    checked_in_by   UUID        REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tickets in their mandator"
    ON public.tickets FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can update tickets in their mandator"
    ON public.tickets FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── 5. Helper function: get_phase_sold_count ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_phase_sold_count(p_phase_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.tickets t
  JOIN public.ticket_orders o ON o.id = t.order_id
  WHERE t.phase_id = p_phase_id
    AND o.status = 'paid';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
