-- ─────────────────────────────────────────────────────────────────────────────
-- Financials – mandator profile support
-- Scope financial_categories and financial_transactions to mandators.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── financial_categories: add mandator_id ─────────────────────────────────────

ALTER TABLE public.financial_categories
    ADD COLUMN mandator_id UUID REFERENCES public.mandators(id) ON DELETE CASCADE;

UPDATE public.financial_categories
    SET mandator_id = '00000000-0000-0000-0000-000000000001'
    WHERE mandator_id IS NULL;

ALTER TABLE public.financial_categories
    ALTER COLUMN mandator_id SET NOT NULL;

CREATE INDEX idx_financial_categories_mandator ON public.financial_categories(mandator_id);

-- Replace RLS policies with mandator-scoped ones

DROP POLICY "Authenticated can view financial_categories" ON public.financial_categories;
DROP POLICY "Authenticated can create financial_categories" ON public.financial_categories;
DROP POLICY "Authenticated can update financial_categories" ON public.financial_categories;
DROP POLICY "Authenticated can delete financial_categories" ON public.financial_categories;

CREATE POLICY "Users can view financial_categories in their mandator"
    ON public.financial_categories FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create financial_categories in their mandator"
    ON public.financial_categories FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update financial_categories in their mandator"
    ON public.financial_categories FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete financial_categories in their mandator"
    ON public.financial_categories FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── financial_transactions: add mandator_id ───────────────────────────────────

ALTER TABLE public.financial_transactions
    ADD COLUMN mandator_id UUID REFERENCES public.mandators(id) ON DELETE CASCADE;

UPDATE public.financial_transactions
    SET mandator_id = '00000000-0000-0000-0000-000000000001'
    WHERE mandator_id IS NULL;

ALTER TABLE public.financial_transactions
    ALTER COLUMN mandator_id SET NOT NULL;

CREATE INDEX idx_financial_transactions_mandator ON public.financial_transactions(mandator_id);

-- Replace RLS policies with mandator-scoped ones

DROP POLICY "Authenticated can view financial_transactions" ON public.financial_transactions;
DROP POLICY "Authenticated can create financial_transactions" ON public.financial_transactions;
DROP POLICY "Authenticated can update financial_transactions" ON public.financial_transactions;
DROP POLICY "Authenticated can delete financial_transactions" ON public.financial_transactions;

CREATE POLICY "Users can view financial_transactions in their mandator"
    ON public.financial_transactions FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create financial_transactions in their mandator"
    ON public.financial_transactions FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update financial_transactions in their mandator"
    ON public.financial_transactions FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete financial_transactions in their mandator"
    ON public.financial_transactions FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());
