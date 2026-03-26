-- ─────────────────────────────────────────────────────────────────────────────
-- Contracts Module
-- Tables: contract_templates, contracts, contract_signatories, contract_signatures
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ALTER TABLE artists ────────────────────────────────────────────────────

ALTER TABLE public.artists
    ADD COLUMN IF NOT EXISTS address      TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ── 2. ALTER TABLE mandators ─────────────────────────────────────────────────

ALTER TABLE public.mandators
    ADD COLUMN IF NOT EXISTS module_contracts BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS contract_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS label_address     TEXT,
    ADD COLUMN IF NOT EXISTS label_uid         TEXT;

UPDATE public.mandators SET module_contracts = true WHERE module_contracts IS NULL;

-- ── 3. contract_templates ─────────────────────────────────────────────────────

CREATE TABLE public.contract_templates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id         UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    name                TEXT        NOT NULL,
    body                TEXT        NOT NULL,
    jurisdiction_canton TEXT        NOT NULL DEFAULT 'Zurich',
    governing_law       TEXT        NOT NULL DEFAULT 'Swiss law (Obligationenrecht, SR 220)',
    created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contract templates in their mandator"
    ON public.contract_templates FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create contract templates in their mandator"
    ON public.contract_templates FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update contract templates in their mandator"
    ON public.contract_templates FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete contract templates in their mandator"
    ON public.contract_templates FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE TRIGGER contract_templates_updated_at
    BEFORE UPDATE ON public.contract_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. contracts ──────────────────────────────────────────────────────────────

CREATE TABLE public.contracts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id     UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    template_id     UUID        REFERENCES public.contract_templates(id) ON DELETE SET NULL,
    artist_id       UUID        NOT NULL REFERENCES public.artists(id) ON DELETE RESTRICT,
    release_id      UUID        REFERENCES public.releases(id) ON DELETE SET NULL,
    title           TEXT        NOT NULL,
    body_snapshot   TEXT        NOT NULL DEFAULT '',
    status          TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','open','partially_signed','fully_signed','voided')),
    public_token    UUID        UNIQUE DEFAULT gen_random_uuid(),
    effective_date  DATE,
    territory       TEXT,
    term            TEXT,
    exclusivity     TEXT,
    royalty_rate    TEXT,
    advance         TEXT,
    concluded_at    TIMESTAMPTZ,
    voided_at       TIMESTAMPTZ,
    voided_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contracts in their mandator"
    ON public.contracts FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create contracts in their mandator"
    ON public.contracts FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update contracts in their mandator"
    ON public.contracts FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete voided contracts in their mandator"
    ON public.contracts FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id() AND status = 'voided');

CREATE TRIGGER contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. contract_signatories ───────────────────────────────────────────────────

CREATE TABLE public.contract_signatories (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id    UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    role           TEXT        NOT NULL,
    display_name   TEXT        NOT NULL,
    legal_name     TEXT        NOT NULL,
    address        TEXT        NOT NULL,
    date_of_birth  DATE,
    email          TEXT,
    user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    signing_order  INTEGER     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contract_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contract signatories in their mandator"
    ON public.contract_signatories FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create contract signatories in their mandator"
    ON public.contract_signatories FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update contract signatories in their mandator"
    ON public.contract_signatories FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete contract signatories in their mandator"
    ON public.contract_signatories FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
    ));

-- ── 6. contract_signatures ────────────────────────────────────────────────────

CREATE TABLE public.contract_signatures (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id    UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    signatory_id   UUID        NOT NULL REFERENCES public.contract_signatories(id) ON DELETE CASCADE,
    signature_svg  TEXT        NOT NULL,
    signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address     TEXT,
    user_agent     TEXT,
    UNIQUE (contract_id, signatory_id)
);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contract signatures in their mandator"
    ON public.contract_signatures FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
    ));

-- No INSERT policy — signatures are written via service role only

-- ── 7. Auto-conclude trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contract_auto_conclude()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_signatories INTEGER;
    v_total_signatures  INTEGER;
    v_current_status    TEXT;
BEGIN
    SELECT COUNT(*) INTO v_total_signatories
    FROM public.contract_signatories
    WHERE contract_id = NEW.contract_id;

    SELECT COUNT(*) INTO v_total_signatures
    FROM public.contract_signatures
    WHERE contract_id = NEW.contract_id;

    SELECT status INTO v_current_status
    FROM public.contracts
    WHERE id = NEW.contract_id;

    IF v_total_signatures >= v_total_signatories AND v_total_signatories > 0 THEN
        UPDATE public.contracts
        SET status = 'fully_signed', concluded_at = NOW()
        WHERE id = NEW.contract_id;
    ELSIF v_current_status <> 'fully_signed' THEN
        UPDATE public.contracts
        SET status = 'partially_signed'
        WHERE id = NEW.contract_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER contract_signatures_auto_conclude
    AFTER INSERT ON public.contract_signatures
    FOR EACH ROW EXECUTE FUNCTION public.contract_auto_conclude();

-- ── 8. Storage bucket: contract-logos ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'contract-logos',
    'contract-logos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public contract-logos read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated contract-logos upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated contract-logos update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated contract-logos delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contract-logos');

-- ── 9. Seed template for default mandator ────────────────────────────────────

INSERT INTO public.contract_templates (
    mandator_id,
    name,
    body,
    jurisdiction_canton,
    governing_law
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Standard Exclusive Recording Agreement (CH)',
$$STANDARD EXCLUSIVE RECORDING AGREEMENT

This Exclusive Recording Agreement (the "Agreement") is entered into as of {{contract_date}} between:

LABEL
{{label_name}}
{{label_address}}
UID: {{label_uid}}
(hereinafter "Label")

and

ARTIST
{{artist_name}}
{{artist_address}}
Date of Birth: {{artist_dob}}
(hereinafter "Artist")

collectively referred to as the "Parties".

1. SUBJECT MATTER

1.1 The Artist hereby grants the Label the exclusive right to produce, manufacture, distribute, sell, and exploit sound recordings of the Artist's performances, including the release tentatively titled "{{release_title}}" (type: {{release_type}}), throughout the Term and Territory defined herein.

1.2 The Label agrees to release the recordings in accordance with the terms set forth in this Agreement.

2. TERRITORY

2.1 This Agreement applies to the following territory: {{territory}}.

3. TERM

3.1 The term of this Agreement shall commence on {{effective_date}} and shall continue for {{term}} (the "Term"), unless earlier terminated in accordance with Section 8.

4. GRANT OF RIGHTS

4.1 Exclusivity: {{exclusivity}}. The Artist shall not record for any other label or make recordings available for commercial release through any third party during the Term without prior written consent of the Label.

4.2 The rights granted include, but are not limited to, the right to reproduce, distribute, publicly perform, broadcast, stream, and sub-license the recordings in all formats and media now known or hereafter developed.

4.3 The Label acknowledges the Artist's moral rights (Urheberpersoenlichkeitsrechte) as protected under Swiss copyright law (URG Art. 16) and agrees not to distort or mutilate the recordings in a manner prejudicial to the Artist's honour or reputation.

5. REMUNERATION

5.1 Royalty Rate: The Label shall pay the Artist a royalty of {{royalty_rate}} of net receipts derived from the exploitation of the recordings, calculated and paid semi-annually.

5.2 Advance: The Label shall pay the Artist a non-refundable advance of {{advance}} against future royalties. This advance shall be recouped from royalties otherwise payable to the Artist.

5.3 Accounting statements shall be provided within sixty (60) days following the end of each accounting period.

6. RELEASE OBLIGATIONS

6.1 The Label shall use commercially reasonable efforts to release the recordings within twelve (12) months of delivery of the final masters.

6.2 If the Label fails to release the recordings within the agreed timeframe, the Artist may provide written notice and the Label shall have ninety (90) days to cure such failure, after which the Artist may terminate this Agreement with respect to the unreleased recordings.

7. TERMINATION

7.1 Either Party may terminate this Agreement for cause upon thirty (30) days' written notice if the other Party materially breaches this Agreement and fails to cure such breach within the notice period.

7.2 Upon termination, all rights granted to the Label hereunder shall revert to the Artist, provided that the Label may continue to distribute and sell existing stock for a period of six (6) months following termination.

7.3 Termination shall not affect any accrued obligations, including unpaid royalties.

8. GOVERNING LAW AND JURISDICTION

8.1 This Agreement shall be governed by and construed in accordance with {{governing_law}}.

8.2 Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of {{jurisdiction_canton}}, Switzerland.

9. SIGNATURES

By signing below, the Parties agree to be bound by the terms and conditions of this Agreement.

For the Label:

Signature: ___________________________
Name:      ___________________________
Title:     ___________________________
Date:      ___________________________

For the Artist:

Signature: ___________________________
Name:      ___________________________
Date:      ___________________________$$,
    'Zurich',
    'Swiss law (Obligationenrecht, SR 220)'
);
