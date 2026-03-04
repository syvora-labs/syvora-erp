-- ============================================================
-- Financial Categories
-- ============================================================

CREATE TABLE public.financial_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    type        TEXT        NOT NULL CHECK (type IN ('income', 'expense', 'both')),
    color       TEXT        NOT NULL DEFAULT '#73c3fe',
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view financial_categories"
    ON public.financial_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create financial_categories"
    ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update financial_categories"
    ON public.financial_categories FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete financial_categories"
    ON public.financial_categories FOR DELETE TO authenticated USING (true);

CREATE TRIGGER financial_categories_updated_at
    BEFORE UPDATE ON public.financial_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Financial Transactions
-- ============================================================

CREATE TABLE public.financial_transactions (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    type             TEXT          NOT NULL CHECK (type IN ('income', 'expense')),
    amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    description      TEXT          NOT NULL,
    category_id      UUID          REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    event_id         UUID          REFERENCES public.events(id) ON DELETE SET NULL,
    release_id       UUID          REFERENCES public.releases(id) ON DELETE SET NULL,
    transaction_date DATE          NOT NULL,
    created_by       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view financial_transactions"
    ON public.financial_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create financial_transactions"
    ON public.financial_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update financial_transactions"
    ON public.financial_transactions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete financial_transactions"
    ON public.financial_transactions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER financial_transactions_updated_at
    BEFORE UPDATE ON public.financial_transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_financial_transactions_date ON public.financial_transactions(transaction_date);
CREATE INDEX idx_financial_transactions_category ON public.financial_transactions(category_id);
CREATE INDEX idx_financial_transactions_type ON public.financial_transactions(type);
