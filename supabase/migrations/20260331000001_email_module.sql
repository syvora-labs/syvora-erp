-- ─────────────────────────────────────────────────────────────────────────────
-- Email Module
-- Tables: mandator_email_config, user_email_settings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Enable pgcrypto ──────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. ALTER TABLE mandators ─────────────────────────────────────────────────

ALTER TABLE public.mandators
    ADD COLUMN IF NOT EXISTS module_email BOOLEAN NOT NULL DEFAULT false;

-- ── 3. mandator_email_config ─────────────────────────────────────────────────

CREATE TABLE public.mandator_email_config (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id UUID        NOT NULL UNIQUE REFERENCES public.mandators(id) ON DELETE CASCADE,
    imap_host   TEXT        NOT NULL DEFAULT 'imap.mail.hostpoint.ch',
    imap_port   INTEGER     NOT NULL DEFAULT 993,
    smtp_host   TEXT        NOT NULL DEFAULT 'asmtp.mail.hostpoint.ch',
    smtp_port   INTEGER     NOT NULL DEFAULT 465,
    use_tls     BOOLEAN     NOT NULL DEFAULT true,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mandator_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email config in their mandator"
    ON public.mandator_email_config FOR SELECT TO authenticated
    USING (
        mandator_id = public.get_my_mandator_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create email config in their mandator"
    ON public.mandator_email_config FOR INSERT TO authenticated
    WITH CHECK (
        mandator_id = public.get_my_mandator_id()
        AND auth.uid() = created_by
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update email config in their mandator"
    ON public.mandator_email_config FOR UPDATE TO authenticated
    USING (
        mandator_id = public.get_my_mandator_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete email config in their mandator"
    ON public.mandator_email_config FOR DELETE TO authenticated
    USING (
        mandator_id = public.get_my_mandator_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE TRIGGER mandator_email_config_updated_at
    BEFORE UPDATE ON public.mandator_email_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. user_email_settings ───────────────────────────────────────────────────

CREATE TABLE public.user_email_settings (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    mandator_id         UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    email_address       TEXT        NOT NULL,
    encrypted_password  BYTEA       NOT NULL,
    display_name        TEXT,
    signature_html      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email settings"
    ON public.user_email_settings FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create their own email settings"
    ON public.user_email_settings FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can update their own email settings"
    ON public.user_email_settings FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own email settings"
    ON public.user_email_settings FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE TRIGGER user_email_settings_updated_at
    BEFORE UPDATE ON public.user_email_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Decrypt helper (called by email-proxy service via service role) ──────

CREATE OR REPLACE FUNCTION public.decrypt_email_password(p_user_id UUID, p_key TEXT)
RETURNS TABLE (
    email_address    TEXT,
    decrypted_password TEXT,
    display_name     TEXT,
    signature_html   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.email_address,
        pgp_sym_decrypt(s.encrypted_password, p_key)::TEXT AS decrypted_password,
        s.display_name,
        s.signature_html
    FROM public.user_email_settings s
    WHERE s.user_id = p_user_id;
END;
$$;

-- ── 6. Encrypt helper (for inserting/updating user credentials) ─────────────

CREATE OR REPLACE FUNCTION public.encrypt_email_password(p_password TEXT, p_key TEXT)
RETURNS BYTEA
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN pgp_sym_encrypt(p_password, p_key);
END;
$$;
