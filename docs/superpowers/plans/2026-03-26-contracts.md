# Contracts Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Contracts module that allows creating, managing, and publicly signing Artist-Label contracts with Swiss law compliance.

**Architecture:** New Supabase tables for templates/contracts/signatories/signatures with RLS + auto-conclude trigger, a Supabase Edge Function for unauthenticated public signing, a `useContracts` composable following the existing pattern, three new Vue views (contracts list, templates, public signing page with canvas), and integration into the mandator module system, admin UI, nav, and releases shortcut.

**Tech Stack:** Vue 3 + TypeScript, Supabase (PostgreSQL + Edge Functions + Storage), `@syvora/ui` component library, HTML5 Canvas for signature capture.

**Spec:** `docs/features/contracts.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260326000001_contracts.sql` | All 4 tables, RLS, trigger, storage bucket, mandator columns, seed template |
| `supabase/functions/sign-contract/index.ts` | Public GET/POST edge function for unauthenticated signing |
| `web/src/composables/useContracts.ts` | Reactive state + CRUD for templates and contracts |
| `web/src/views/ContractsView.vue` | Authenticated contract list + multi-step creation modal |
| `web/src/views/ContractTemplatesView.vue` | Authenticated template CRUD view |
| `web/src/views/ContractSignView.vue` | Public signing page with canvas |
| `web/src/components/SignatureCanvas.vue` | Reusable canvas component for freehand signature input |

### Modified files

| File | Change |
|------|--------|
| `web/src/composables/useMandator.ts` | Add `module_contracts` to interfaces, MODULES, DEFAULT_FORM, computed flags, new mandator fields |
| `web/src/composables/useArtists.ts` | Add `address`, `date_of_birth` to `Artist` interface |
| `web/src/composables/useNavGroups.ts` | Add Contracts nav item under Operations group |
| `web/src/router/index.ts` | Add 3 new routes, update guard for public routes |
| `web/src/views/AdminView.vue` | Add Contracts toggle + logo upload + label address/UID fields in mandator modal |
| `web/src/views/ReleasesView.vue` | Add "Create Contract" shortcut button per release card + contracts sub-section in expanded panel |
| `web/src/views/ArtistDetailView.vue` | Add Contracts tab showing contracts linked to the artist |

### Design Notes

- **`artists` table not mandator-scoped**: The `artists` table has no `mandator_id`. The artist picker in contract creation shows ALL artists (matching existing app behavior). The spec's reference to "scoped to the current mandator" cannot be implemented without a separate schema migration. This is a known data model limitation.
- **`{{contract_date}}` placeholder**: The spec says this should be "date of last required signature" but `body_snapshot` is immutable after opening. The plan resolves `{{contract_date}}` as a placeholder text "To be determined upon final signature" at open time. The actual conclusion date is stored in `contracts.concluded_at` and displayed alongside the contract.
- **`artists` table extensions**: The migration adds `address TEXT` and `date_of_birth DATE` columns to the `artists` table so that signatory data can be auto-populated per the spec. The `useArtists` composable interface is updated accordingly.

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260326000001_contracts.sql`

- [ ] **Step 1: Write the complete migration SQL**

```sql
-- ============================================================
-- Contracts module: tables, RLS, trigger, storage, mandator ext
-- ============================================================

-- ── Artists table extensions (needed for signatory auto-population) ──
ALTER TABLE public.artists
    ADD COLUMN IF NOT EXISTS address       TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ── Mandator extensions ─────────────────────────────────────
ALTER TABLE public.mandators
    ADD COLUMN IF NOT EXISTS module_contracts    BOOLEAN     NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS contract_logo_url   TEXT,
    ADD COLUMN IF NOT EXISTS label_address       TEXT,
    ADD COLUMN IF NOT EXISTS label_uid           TEXT;

UPDATE public.mandators SET module_contracts = true WHERE module_contracts IS NULL;

-- ── contract_templates ──────────────────────────────────────
CREATE TABLE public.contract_templates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mandator_id         UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    name                TEXT        NOT NULL,
    body                TEXT        NOT NULL,
    jurisdiction_canton TEXT        NOT NULL DEFAULT 'Zurich',
    governing_law       TEXT        NOT NULL DEFAULT 'Swiss law (Obligationenrecht, SR 220)',
    created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates in their mandator"
    ON public.contract_templates FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create templates in their mandator"
    ON public.contract_templates FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update templates in their mandator"
    ON public.contract_templates FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete templates in their mandator"
    ON public.contract_templates FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE TRIGGER contract_templates_updated_at
    BEFORE UPDATE ON public.contract_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── contracts ───────────────────────────────────────────────
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TRIGGER contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── contract_signatories ────────────────────────────────────
CREATE TABLE public.contract_signatories (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL,
    display_name    TEXT        NOT NULL,
    legal_name      TEXT        NOT NULL,
    address         TEXT        NOT NULL,
    date_of_birth   DATE,
    email           TEXT,
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    signing_order   INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatories in their mandator"
    ON public.contract_signatories FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
        )
    );

CREATE POLICY "Users can create signatories in their mandator"
    ON public.contract_signatories FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
        )
    );

CREATE POLICY "Users can update signatories in their mandator"
    ON public.contract_signatories FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
        )
    );

CREATE POLICY "Users can delete signatories in their mandator"
    ON public.contract_signatories FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
        )
    );

-- ── contract_signatures ─────────────────────────────────────
CREATE TABLE public.contract_signatures (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    signatory_id    UUID        NOT NULL REFERENCES public.contract_signatories(id) ON DELETE CASCADE,
    signature_svg   TEXT        NOT NULL,
    signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address      TEXT,
    user_agent      TEXT,
    UNIQUE (contract_id, signatory_id)
);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view signatures for contracts in their mandator
CREATE POLICY "Users can view signatures in their mandator"
    ON public.contract_signatures FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND c.mandator_id = public.get_my_mandator_id()
        )
    );

-- INSERT is service-role only (from edge function) — no INSERT policy for authenticated

-- ── Auto-conclude trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.contract_auto_conclude()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_contract_id UUID;
    v_total       INT;
    v_signed      INT;
BEGIN
    v_contract_id := NEW.contract_id;

    SELECT count(*) INTO v_total
    FROM public.contract_signatories
    WHERE contract_id = v_contract_id;

    SELECT count(*) INTO v_signed
    FROM public.contract_signatures
    WHERE contract_id = v_contract_id;

    IF v_signed >= v_total AND v_total > 0 THEN
        UPDATE public.contracts
        SET status = 'fully_signed', concluded_at = now()
        WHERE id = v_contract_id;
    ELSIF v_signed > 0 THEN
        UPDATE public.contracts
        SET status = 'partially_signed'
        WHERE id = v_contract_id AND status != 'fully_signed';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER contract_signatures_auto_conclude
    AFTER INSERT ON public.contract_signatures
    FOR EACH ROW EXECUTE FUNCTION public.contract_auto_conclude();

-- ── Storage bucket for contract logos ───────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-logos', 'contract-logos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view contract logos"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated users can upload contract logos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated users can update contract logos"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'contract-logos');

CREATE POLICY "Authenticated users can delete contract logos"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contract-logos');

-- ── Seed: default template for default mandator ─────────────
INSERT INTO public.contract_templates (mandator_id, name, body, jurisdiction_canton, governing_law)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Standard Exclusive Recording Agreement (CH)',
    E'RECORDING AGREEMENT\n\nThis Recording Agreement ("Agreement") is entered into on {{contract_date}}, with an effective date of {{effective_date}}, by and between:\n\n1. LABEL\n   {{label_name}}\n   {{label_address}}\n   UID: {{label_uid}}\n   (hereinafter "the Label")\n\n2. ARTIST\n   {{artist_name}}\n   {{artist_address}}\n   Date of birth: {{artist_dob}}\n   (hereinafter "the Artist")\n\n§ 1 — SUBJECT MATTER\n\nThe Label engages the Artist to produce sound recordings on a {{exclusivity}} basis.\n\n§ 2 — TERRITORY\n\nThis Agreement applies to the following territory: {{territory}}.\n\n§ 3 — TERM\n\nThe term of this Agreement is: {{term}}.\n\n§ 4 — RIGHTS GRANT\n\nThe Artist hereby grants the Label the {{exclusivity}} right to produce, reproduce, distribute, and make available to the public all sound recordings created during the term of this Agreement within the territory specified above, in accordance with the Swiss Federal Act on Copyright and Related Rights (URG), Art. 16.\n\n§ 5 — REMUNERATION\n\nThe Artist shall receive a royalty of {{royalty_rate}} of net revenues generated from the exploitation of the recordings.\n\nAdvance: {{advance}}.\n\nPayment terms: quarterly accounting within 60 days of each calendar quarter end.\n\n§ 6 — RELEASE\n\nRelease: {{release_title}} ({{release_type}})\n\n§ 7 — TERMINATION\n\nEither party may terminate this Agreement with 90 days written notice after the initial term. All rights to recordings made during the term remain with the Label for the duration specified in § 4.\n\n§ 8 — GOVERNING LAW AND JURISDICTION\n\nThis Agreement is governed by {{governing_law}}.\n\nPlace of jurisdiction: {{jurisdiction_canton}}, Switzerland.\n\n§ 9 — SIGNATURES\n\nThe parties confirm that they have read and understood this Agreement and agree to all terms set forth herein.',
    'Zurich',
    'Swiss law (Obligationenrecht, SR 220)'
);
```

- [ ] **Step 2: Verify the migration file is valid**

Run: `head -5 supabase/migrations/20260326000001_contracts.sql`
Expected: First few lines of the migration visible.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260326000001_contracts.sql
git commit -m "feat(db): add contracts module tables, RLS, trigger, storage, and seed template"
```

---

## Task 2: Supabase Edge Function — `sign-contract`

**Files:**
- Create: `supabase/functions/sign-contract/index.ts`

- [ ] **Step 1: Create the edge function directory and file**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    try {
        if (req.method === 'GET') {
            return await handleGet(req, supabase)
        }
        if (req.method === 'POST') {
            return await handlePost(req, supabase)
        }
        return json({ error: 'Method not allowed' }, 405)
    } catch (err) {
        return json({ error: (err as Error).message ?? 'Internal error' }, 500)
    }
})

async function handleGet(req: Request, supabase: any) {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return json({ error: 'Missing token' }, 400)

    const { data: contract, error: cErr } = await supabase
        .from('contracts')
        .select('id, title, body_snapshot, status, public_token, effective_date, territory, term, exclusivity, royalty_rate, advance, concluded_at, mandator_id')
        .eq('public_token', token)
        .maybeSingle()

    if (cErr || !contract) return json({ error: 'Contract not found' }, 404)
    if (contract.status === 'draft' || contract.status === 'voided') {
        return json({ error: 'Contract not found' }, 404)
    }

    // Fetch mandator for logo
    const { data: mandator } = await supabase
        .from('mandators')
        .select('name, contract_logo_url')
        .eq('id', contract.mandator_id)
        .maybeSingle()

    // Fetch signatories
    const { data: signatories } = await supabase
        .from('contract_signatories')
        .select('id, role, display_name, legal_name, signing_order')
        .eq('contract_id', contract.id)
        .order('signing_order', { ascending: true })

    // Fetch existing signatures
    const { data: signatures } = await supabase
        .from('contract_signatures')
        .select('id, signatory_id, signature_svg, signed_at')
        .eq('contract_id', contract.id)

    return json({
        contract: {
            id: contract.id,
            title: contract.title,
            body_snapshot: contract.body_snapshot,
            status: contract.status,
            effective_date: contract.effective_date,
            concluded_at: contract.concluded_at,
        },
        mandator: {
            name: mandator?.name ?? null,
            logo_url: mandator?.contract_logo_url ?? null,
        },
        signatories: signatories ?? [],
        signatures: signatures ?? [],
    })
}

async function handlePost(req: Request, supabase: any) {
    const body = await req.json()
    const { token, signatory_id, signature_svg } = body

    if (!token || !signatory_id || !signature_svg) {
        return json({ error: 'Missing required fields: token, signatory_id, signature_svg' }, 400)
    }

    // Validate contract
    const { data: contract, error: cErr } = await supabase
        .from('contracts')
        .select('id, status')
        .eq('public_token', token)
        .maybeSingle()

    if (cErr || !contract) return json({ error: 'Contract not found' }, 404)
    if (contract.status !== 'open' && contract.status !== 'partially_signed') {
        return json({ error: `Cannot sign contract with status "${contract.status}"` }, 400)
    }

    // Validate signatory belongs to this contract
    const { data: signatory } = await supabase
        .from('contract_signatories')
        .select('id, signing_order')
        .eq('id', signatory_id)
        .eq('contract_id', contract.id)
        .maybeSingle()

    if (!signatory) return json({ error: 'Signatory not found for this contract' }, 404)

    // Check not already signed
    const { data: existing } = await supabase
        .from('contract_signatures')
        .select('id')
        .eq('contract_id', contract.id)
        .eq('signatory_id', signatory_id)
        .maybeSingle()

    if (existing) return json({ error: 'This signatory has already signed' }, 400)

    // Enforce signing order: all signatories with lower signing_order must have signed
    const { data: priorSignatories } = await supabase
        .from('contract_signatories')
        .select('id')
        .eq('contract_id', contract.id)
        .lt('signing_order', signatory.signing_order)

    if (priorSignatories && priorSignatories.length > 0) {
        const priorIds = priorSignatories.map((s: any) => s.id)
        const { data: priorSigs } = await supabase
            .from('contract_signatures')
            .select('signatory_id')
            .eq('contract_id', contract.id)
            .in('signatory_id', priorIds)

        const signedPriorIds = new Set((priorSigs ?? []).map((s: any) => s.signatory_id))
        const allPriorSigned = priorIds.every((id: string) => signedPriorIds.has(id))
        if (!allPriorSigned) {
            return json({ error: 'Previous signatories must sign first' }, 400)
        }
    }

    // Capture audit info
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
    const ua = req.headers.get('user-agent') ?? null

    // Insert signature
    const { error: insErr } = await supabase
        .from('contract_signatures')
        .insert({
            contract_id: contract.id,
            signatory_id,
            signature_svg,
            ip_address: ip,
            user_agent: ua,
        })

    if (insErr) return json({ error: insErr.message }, 500)

    // Re-fetch updated contract status (trigger may have updated it)
    const { data: updated } = await supabase
        .from('contracts')
        .select('status, concluded_at')
        .eq('id', contract.id)
        .single()

    return json({
        success: true,
        status: updated?.status ?? 'partially_signed',
        concluded_at: updated?.concluded_at ?? null,
    })
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sign-contract/index.ts
git commit -m "feat(supabase): add sign-contract edge function for public signing"
```

---

## Task 3: Extend `useMandator` Composable

**Files:**
- Modify: `web/src/composables/useMandator.ts`

- [ ] **Step 1: Add `module_contracts` to the `Mandator` interface**

Add `module_contracts: boolean` plus the new string fields to the `Mandator` interface:

```typescript
export interface Mandator {
    id: string
    name: string
    module_artists: boolean
    module_releases: boolean
    module_events: boolean
    module_radios: boolean
    module_financials: boolean
    module_associations: boolean
    module_meetings: boolean
    module_roadmap: boolean
    module_lights: boolean
    module_contracts: boolean
    contract_logo_url: string | null
    label_address: string | null
    label_uid: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
}
```

- [ ] **Step 2: Add `'module_contracts'` to the `ModuleKey` union and `'contracts'` to `ModuleRoute`**

```typescript
export type ModuleKey = 'module_artists' | 'module_releases' | 'module_events' | 'module_radios' | 'module_financials' | 'module_associations' | 'module_meetings' | 'module_roadmap' | 'module_lights' | 'module_contracts'
export type ModuleRoute = 'artists' | 'releases' | 'events' | 'radios' | 'financials' | 'associations' | 'meetings' | 'roadmap' | 'lights' | 'contracts'
```

- [ ] **Step 3: Add to `MODULES` array**

Add after the `lights` entry:
```typescript
{ route: 'contracts', column: 'module_contracts', label: 'Contracts' },
```

- [ ] **Step 4: Add to `DEFAULT_FORM`**

Add `module_contracts: true` to `DEFAULT_FORM`.

- [ ] **Step 5: Add computed flag**

Add after `lightsEnabled`:
```typescript
const contractsEnabled = computed(() => mandator.value?.module_contracts ?? true)
const contractLogoUrl = computed(() => mandator.value?.contract_logo_url ?? null)
const labelAddress = computed(() => mandator.value?.label_address ?? null)
const labelUid = computed(() => mandator.value?.label_uid ?? null)
```

- [ ] **Step 6: Add to `getDefaultForm` and `MandatorFormData`**

The `MandatorFormData` type uses `Pick<Mandator, 'name' | ModuleKey>` so `module_contracts` is already included after updating `ModuleKey`. Update `getDefaultForm` to include `module_contracts: from.module_contracts` in the `if (from)` branch.

- [ ] **Step 7: Export new values from `useMandator()`**

Add `contractsEnabled`, `contractLogoUrl`, `labelAddress`, `labelUid` to the return object.

- [ ] **Step 8: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`
Expected: No errors related to useMandator.

- [ ] **Step 9: Commit**

```bash
git add web/src/composables/useMandator.ts
git commit -m "feat(web): extend useMandator with contracts module support"
```

---

## Task 4: Create `useContracts` Composable

**Files:**
- Create: `web/src/composables/useContracts.ts`

- [ ] **Step 1: Write the full composable**

Follow the pattern from `useReleases.ts` — module-level refs, enrichWithNames, mandator-scoped queries.

Key interfaces:
```typescript
export interface ContractTemplate {
    id: string
    mandator_id: string
    name: string
    body: string
    jurisdiction_canton: string
    governing_law: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface Contract {
    id: string
    mandator_id: string
    template_id: string | null
    artist_id: string
    release_id: string | null
    title: string
    body_snapshot: string
    status: 'draft' | 'open' | 'partially_signed' | 'fully_signed' | 'voided'
    public_token: string
    effective_date: string | null
    territory: string | null
    term: string | null
    exclusivity: string | null
    royalty_rate: string | null
    advance: string | null
    concluded_at: string | null
    voided_at: string | null
    voided_by: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    artist_name: string | null
    release_title: string | null
    signatory_count: number
    signature_count: number
}

export interface ContractSignatory {
    id: string
    contract_id: string
    role: string
    display_name: string
    legal_name: string
    address: string
    date_of_birth: string | null
    email: string | null
    user_id: string | null
    signing_order: number
    created_at: string
}

export interface ContractSignature {
    id: string
    contract_id: string
    signatory_id: string
    signature_svg: string
    signed_at: string
    ip_address: string | null
    user_agent: string | null
}
```

Key functions to implement:
- `fetchTemplates()` — mandator-scoped, enriched with profile names
- `createTemplate(form)`, `updateTemplate(id, form)`, `deleteTemplate(id)`
- `fetchContracts()` — mandator-scoped, joins artists.name and releases.title, counts signatories/signatures
- `fetchContractsByArtist(artistId)` — filtered by artist_id
- `fetchContractsByRelease(releaseId)` — filtered by release_id
- `createContract(form)` — inserts contract row + signatory rows
- `openContract(id)` — resolves `{{placeholders}}` from mandator/artist/release/contract fields, writes `body_snapshot`, sets status to `open`
- `voidContract(id)` — sets status to `voided`, `voided_at`, `voided_by`
- `getSigningUrl(contract)` — returns `/sign/${contract.public_token}`
- `fetchContractSignatories(contractId)`, `fetchContractSignatures(contractId)`

The `openContract` placeholder resolution logic:
```typescript
async function openContract(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    // Fetch the contract with template body
    const { data: contract } = await supabase
        .from('contracts')
        .select('*, contract_templates(body, jurisdiction_canton, governing_law)')
        .eq('id', id)
        .single()
    if (!contract || contract.status !== 'draft') throw new Error('Contract must be in draft status')

    // Fetch artist signatory
    const { data: artistSignatory } = await supabase
        .from('contract_signatories')
        .select('legal_name, address, date_of_birth')
        .eq('contract_id', id)
        .eq('role', 'artist')
        .maybeSingle()

    // Fetch release if linked
    let releaseTitle = ''
    let releaseType = ''
    if (contract.release_id) {
        const { data: release } = await supabase
            .from('releases')
            .select('title, type')
            .eq('id', contract.release_id)
            .maybeSingle()
        releaseTitle = release?.title ?? ''
        releaseType = release?.type ?? ''
    }

    // Fetch mandator info
    const { data: mand } = await supabase
        .from('mandators')
        .select('name, label_address, label_uid')
        .eq('id', contract.mandator_id)
        .single()

    const templateBody = contract.contract_templates?.body ?? contract.body_snapshot
    const jurisdictionCanton = contract.contract_templates?.jurisdiction_canton ?? 'Zurich'
    const governingLaw = contract.contract_templates?.governing_law ?? 'Swiss law (Obligationenrecht, SR 220)'

    const replacements: Record<string, string> = {
        '{{label_name}}': mand?.name ?? '',
        '{{label_address}}': mand?.label_address ?? '',
        '{{label_uid}}': mand?.label_uid ?? '',
        '{{artist_name}}': artistSignatory?.legal_name ?? '',
        '{{artist_address}}': artistSignatory?.address ?? '',
        '{{artist_dob}}': artistSignatory?.date_of_birth ?? '',
        '{{contract_date}}': '[Date of final signature]',
        '{{effective_date}}': contract.effective_date ?? '',
        '{{territory}}': contract.territory ?? '',
        '{{term}}': contract.term ?? '',
        '{{exclusivity}}': contract.exclusivity ?? '',
        '{{royalty_rate}}': contract.royalty_rate ?? '',
        '{{advance}}': contract.advance ?? '',
        '{{release_title}}': releaseTitle,
        '{{release_type}}': releaseType,
        '{{jurisdiction_canton}}': jurisdictionCanton,
        '{{governing_law}}': governingLaw,
    }

    let resolved = templateBody
    for (const [key, val] of Object.entries(replacements)) {
        resolved = resolved.replaceAll(key, val)
    }

    const { error } = await supabase
        .from('contracts')
        .update({ body_snapshot: resolved, status: 'open', updated_by: user?.id })
        .eq('id', id)
    if (error) throw error
    await fetchContracts()
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useContracts.ts
git commit -m "feat(web): add useContracts composable with full CRUD and placeholder resolution"
```

---

## Task 5: Router + Navigation Updates

**Files:**
- Modify: `web/src/router/index.ts`
- Modify: `web/src/composables/useNavGroups.ts`

- [ ] **Step 1: Add routes to router**

Add imports at the top of `router/index.ts`:
```typescript
import ContractsView from "../views/ContractsView.vue";
import ContractTemplatesView from "../views/ContractTemplatesView.vue";
import ContractSignView from "../views/ContractSignView.vue";
```

Add routes before the `"/profile"` route:
```typescript
{ path: "/contracts", component: ContractsView, meta: { requiresAuth: true, module: "contracts" } },
{ path: "/contracts/templates", component: ContractTemplatesView, meta: { requiresAuth: true, module: "contracts" } },
{ path: "/sign/:token", component: ContractSignView, meta: { public: true } },
```

- [ ] **Step 2: Update beforeEach guard for public routes**

The existing guard already checks `to.meta.requiresAuth` before redirecting. The `/sign/:token` route uses `meta: { public: true }` (same as login). Since it does NOT have `meta.requiresAuth`, the guard's first check `if (to.meta.requiresAuth && !isAuthenticated)` won't trigger. And since it has no `meta.module`, the module guard won't trigger either. So no guard changes are needed — the existing logic already allows public routes through.

Verify this by reading the guard code and confirming no catch-all redirect exists.

- [ ] **Step 3: Add Contracts to nav groups**

In `useNavGroups.ts`, add to the `Operations` group items array:
```typescript
{ route: 'contracts', label: 'Contracts', keywords: ['contract', 'agreement', 'signing', 'legal'] },
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`
Expected: Errors about missing view components (ContractsView etc.) — these will be resolved in subsequent tasks. Verify no OTHER errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/router/index.ts web/src/composables/useNavGroups.ts
git commit -m "feat(web): add contracts routes and nav entry"
```

---

## Task 6: `ContractTemplatesView.vue`

**Files:**
- Create: `web/src/views/ContractTemplatesView.vue`

- [ ] **Step 1: Write the complete view**

Follow the pattern from `AssociationsView.vue` — page header, list, create/edit modal.

Setup script:
- Import `useContracts` composable
- Use `templates`, `loading`, `fetchTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`
- Modal state: `showModal`, `editingTemplate`, `form` (name, body, jurisdiction_canton), `saving`, `error`
- `openCreate()` resets form with defaults (jurisdiction_canton: 'Zurich')
- `openEdit(template)` populates form
- `saveTemplate()` creates or updates based on `editingTemplate.value`

Template:
- Page header with title "Contract Templates", subtitle, "+ New Template" button, and a "Back to Contracts" RouterLink
- Loading state
- Empty state
- Card list — each row shows: template name, jurisdiction canton badge, created date, edit/delete actions
- Modal: name input, body textarea (large, monospace), jurisdiction canton input, governing law (read-only display), and a placeholder reference sidebar or help text listing all `{{...}}` variables

Available placeholders help text (inside the modal):
```
Available variables: {{label_name}}, {{label_address}}, {{label_uid}}, {{artist_name}}, {{artist_address}}, {{artist_dob}}, {{contract_date}}, {{effective_date}}, {{territory}}, {{term}}, {{exclusivity}}, {{royalty_rate}}, {{advance}}, {{release_title}}, {{release_type}}, {{jurisdiction_canton}}, {{governing_law}}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ContractTemplatesView.vue
git commit -m "feat(web): add ContractTemplatesView for managing contract templates"
```

---

## Task 7: `SignatureCanvas.vue` Component

**Files:**
- Create: `web/src/components/SignatureCanvas.vue`

- [ ] **Step 1: Write the signature canvas component**

Props:
- `width?: number` (default 500)
- `height?: number` (default 200)
- `disabled?: boolean`

Emits:
- `update:svg` — emits the SVG path string whenever the user finishes a stroke

Implementation:
- Uses a `<canvas>` element with pointer events (`pointerdown`, `pointermove`, `pointerup`, `pointerleave`)
- Tracks strokes as arrays of `{x, y}` points
- On `pointerup`, converts all strokes to an SVG `<path>` element string with `d` attribute
- Exposes a `clear()` method via `defineExpose`
- Renders with a dashed border and "Sign here" placeholder text when empty
- Supports both mouse and touch input via pointer events
- Uses `e.preventDefault()` on touch to prevent scroll

SVG conversion logic:
```typescript
function strokesToSvg(): string {
    if (strokes.length === 0) return ''
    const paths = strokes.map(stroke => {
        if (stroke.length < 2) return ''
        const d = stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        return d
    }).filter(Boolean)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${props.width} ${props.height}"><path d="${paths.join(' ')}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/SignatureCanvas.vue
git commit -m "feat(web): add SignatureCanvas component for freehand signature input"
```

---

## Task 8: `ContractsView.vue`

**Files:**
- Create: `web/src/views/ContractsView.vue`

- [ ] **Step 1: Write the complete view**

This is the most complex view. Setup script:

```typescript
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContracts } from '../composables/useContracts'
import { useArtists } from '../composables/useArtists'
import { useReleases } from '../composables/useReleases'
import { useMandator } from '../composables/useMandator'
import type { Contract, ContractSignatory } from '../composables/useContracts'
import type { Artist } from '../composables/useArtists'
import type { Release } from '../composables/useReleases'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
    SyvoraCard, SyvoraBadge, SyvoraStepIndicator,
} from '@syvora/ui'
```

State:
- `contracts`, `templates`, `loading`, `fetchContracts`, `fetchTemplates`, `createContract`, `openContract`, `voidContract`, `getSigningUrl`, `fetchContractSignatories`, `fetchContractSignatures` from `useContracts()`
- `artists`, `fetchArtists` from `useArtists()`
- `releases`, `fetchReleases` from `useReleases()`
- Multi-step modal: `showModal`, `step` (1-3), `saving`, `error`
- Step 1 form: `selectedTemplateId`, `customBody`
- Step 2 form: `title`, `artistId`, `releaseId`, `effectiveDate`, `territory`, `term`, `exclusivity`, `royaltyRate`, `advance`
- Step 3 form: `signatories` (array of signatory definitions)
- Detail drawer: `expandedContractId`, `detailSignatories`, `detailSignatures`

Multi-step modal flow:
1. **Step 1**: Template picker (select from `templates` or "Start from scratch") + body preview/editor
2. **Step 2**: Detail fields + artist picker (select from all artists) + release picker (optional, from mandator releases)
3. **Step 3**: Signatories table — default 3 rows: Founder (signing_order=0), A&R Manager (signing_order=0), Artist (signing_order=1). Artist row auto-filled from selected artist's record. Add/remove signatory rows.

Per-contract actions:
- **Open**: calls `openContract(id)`, shows confirmation first
- **Copy Link**: `navigator.clipboard.writeText(window.location.origin + getSigningUrl(contract))`
- **View**: toggles `expandedContractId`, fetches signatories + signatures
- **Void**: confirmation → `voidContract(id)`

Status badge variant mapping:
```typescript
function statusVariant(status: string) {
    const map: Record<string, string> = {
        draft: 'badge-deposit',
        open: 'badge-warning',
        partially_signed: 'badge-claim',
        fully_signed: 'badge-success',
        voided: 'badge-disabled',
    }
    return map[status] ?? 'badge-deposit'
}
```

Template structure:
- Page header: "Contracts" title, "+ New Contract" button, "Templates" link
- Contract list (cards or rows): title, artist name, release title, status badge, signature progress, actions
- Expanded detail panel: body text, signatories list with signature status
- Multi-step creation modal with `SyvoraStepIndicator`

Props for pre-filling from releases shortcut — accept optional query params `?releaseId=X&artistId=Y` in `onMounted` to pre-open the modal with pre-filled data. Or use a shared reactive ref. We'll use query params since it's simpler for cross-view navigation.

- [ ] **Step 2: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ContractsView.vue
git commit -m "feat(web): add ContractsView with multi-step creation and contract management"
```

---

## Task 9: `ContractSignView.vue` (Public Signing Page)

**Files:**
- Create: `web/src/views/ContractSignView.vue`

- [ ] **Step 1: Write the complete public signing view**

This view is unauthenticated — it talks to the edge function, not directly to Supabase.

Setup:
```typescript
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SignatureCanvas from '../components/SignatureCanvas.vue'
import { SyvoraButton, SyvoraCard, SyvoraBadge } from '@syvora/ui'

const route = useRoute()
const token = computed(() => route.params.token as string)

const loading = ref(true)
const error = ref('')
const contract = ref<any>(null)
const mandator = ref<any>(null)
const signatories = ref<any[]>([])
const signatures = ref<any[]>([])
const selectedSignatoryId = ref<string | null>(null)
const signing = ref(false)
const signError = ref('')
const canvasRef = ref<InstanceType<typeof SignatureCanvas> | null>(null)
const capturedSvg = ref('')

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract`
```

`fetchContract()`:
```typescript
async function fetchContract() {
    loading.value = true
    error.value = ''
    try {
        const res = await fetch(`${EDGE_FN_URL}?token=${token.value}`)
        if (!res.ok) { error.value = 'Contract not found'; return }
        const data = await res.json()
        contract.value = data.contract
        mandator.value = data.mandator
        signatories.value = data.signatories
        signatures.value = data.signatures
    } catch {
        error.value = 'Failed to load contract'
    } finally {
        loading.value = false
    }
}
```

Computed helpers:
- `signedIds`: Set of signatory IDs that have signed
- `currentTier`: the lowest `signing_order` that has at least one unsigned signatory
- `pendingSignatories`: signatories at `currentTier` that haven't signed yet
- `isFullySigned`: `contract.value?.status === 'fully_signed'`

`submitSignature()`:
```typescript
async function submitSignature() {
    if (!selectedSignatoryId.value || !capturedSvg.value) {
        signError.value = 'Please select your name and sign in the box above'
        return
    }
    signing.value = true
    signError.value = ''
    try {
        const res = await fetch(EDGE_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token.value,
                signatory_id: selectedSignatoryId.value,
                signature_svg: capturedSvg.value,
            }),
        })
        const data = await res.json()
        if (!res.ok) { signError.value = data.error ?? 'Failed to sign'; return }
        // Refresh
        await fetchContract()
        selectedSignatoryId.value = null
        capturedSvg.value = ''
        canvasRef.value?.clear()
    } catch {
        signError.value = 'Network error'
    } finally {
        signing.value = false
    }
}
```

Template structure:
- Loading state
- Error state (404)
- Fully signed read-only view
- Otherwise:
  - Header: logo, title, status badge
  - Contract body (whitespace-pre-wrap)
  - Signatories list: for each signatory in order:
    - If signed: green indicator with SVG preview and timestamp
    - If in current tier and unsigned: clickable to select for signing
    - If in future tier: "Waiting for previous signatories"
  - When a pending signatory is selected:
    - `SignatureCanvas` component
    - Clear button, Sign button
    - Legal notice text
  - Sign error display

Legal notice text:
```
By clicking "Sign", I confirm that I have read and understood the above contract in its entirety. I agree that my digital handwritten signature constitutes a legally binding signature under Swiss law (Obligationenrecht, OR Art. 14).
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ContractSignView.vue
git commit -m "feat(web): add public ContractSignView with canvas signing and legal notice"
```

---

## Task 10: Admin UI Extension

**Files:**
- Modify: `web/src/views/AdminView.vue`

- [ ] **Step 1: Add contract-related fields to mandator modal**

In `AdminView.vue`, the mandator create/edit modal already iterates `MODULES` for checkboxes, so the Contracts toggle is automatically included after Task 3 (useMandator update). No change needed for the checkbox.

Add the following fields **after** the module toggles `<div class="module-toggles">` section inside the mandator modal:

```html
<SyvoraFormField label="Contract Logo" for="cm-logo">
    <div class="logo-upload">
        <img v-if="mandatorLogoPreview" :src="mandatorLogoPreview" class="logo-preview" alt="Logo" />
        <input type="file" accept="image/*" @change="onLogoFilePick" id="cm-logo" />
    </div>
</SyvoraFormField>

<SyvoraFormField label="Label Address" for="cm-address">
    <SyvoraTextarea id="cm-address" v-model="mandatorExtraForm.label_address" placeholder="Registered postal address" :rows="2" />
</SyvoraFormField>

<SyvoraFormField label="Label UID" for="cm-uid">
    <SyvoraInput id="cm-uid" v-model="mandatorExtraForm.label_uid" placeholder="CHE-123.456.789" />
</SyvoraFormField>
```

Add script state:
```typescript
const mandatorExtraForm = ref({ label_address: '', label_uid: '', contract_logo_url: '' })
const mandatorLogoFile = ref<File | null>(null)
const mandatorLogoPreview = ref<string | null>(null)
```

Update `openMandatorModal` to populate extra fields:
```typescript
mandatorExtraForm.value = {
    label_address: m?.label_address ?? '',
    label_uid: m?.label_uid ?? '',
    contract_logo_url: m?.contract_logo_url ?? '',
}
mandatorLogoPreview.value = m?.contract_logo_url ?? null
mandatorLogoFile.value = null
```

Update `saveMandator` to upload logo and include extra fields:
```typescript
// Before the existing updateMandator/createMandator calls:
let logoUrl = mandatorExtraForm.value.contract_logo_url
if (mandatorLogoFile.value) {
    const ext = mandatorLogoFile.value.name.split('.').pop() ?? 'png'
    const path = `mandators/${editingMandatorId.value ?? 'new'}/logo.${ext}`
    await adminClient.storage.from('contract-logos').upload(path, mandatorLogoFile.value, { upsert: true })
    const { data: urlData } = adminClient.storage.from('contract-logos').getPublicUrl(path)
    logoUrl = urlData.publicUrl
}

// Merge extra fields into the update payload:
const extraPayload = {
    label_address: mandatorExtraForm.value.label_address || null,
    label_uid: mandatorExtraForm.value.label_uid || null,
    contract_logo_url: logoUrl || null,
}
```

The `Mandator` type from `useMandator` now includes these fields, but `MandatorFormData` only includes `name | ModuleKey`. The extra fields need to be sent separately. Extend `saveMandator` to include the extra fields in the same insert/update payload by merging them directly via `adminClient`:

```typescript
async function saveMandator() {
    if (!mandatorForm.value.name.trim()) {
        mandatorError.value = 'Name is required.'
        return
    }
    savingMandator.value = true
    mandatorError.value = ''
    try {
        let logoUrl = mandatorExtraForm.value.contract_logo_url
        if (mandatorLogoFile.value) {
            const mandatorId = editingMandatorId.value ?? crypto.randomUUID()
            const ext = mandatorLogoFile.value.name.split('.').pop() ?? 'png'
            const path = `mandators/${mandatorId}/logo.${ext}`
            await adminClient.storage.from('contract-logos').upload(path, mandatorLogoFile.value, { upsert: true })
            const { data: urlData } = adminClient.storage.from('contract-logos').getPublicUrl(path)
            logoUrl = urlData.publicUrl
        }
        const extraPayload = {
            label_address: mandatorExtraForm.value.label_address || null,
            label_uid: mandatorExtraForm.value.label_uid || null,
            contract_logo_url: logoUrl || null,
        }
        if (editingMandatorId.value) {
            await updateMandator(editingMandatorId.value, mandatorForm.value, currentProfile.value?.id)
            await adminClient.from('mandators').update(extraPayload).eq('id', editingMandatorId.value)
        } else {
            // Create mandator, then immediately update extra fields using the name as lookup
            await createMandator(mandatorForm.value, currentProfile.value?.id)
            // Re-fetch to get the new mandator's ID
            await fetchMandators()
            const created = mandators.value.find(m => m.name === mandatorForm.value.name.trim())
            if (created) {
                await adminClient.from('mandators').update(extraPayload).eq('id', created.id)
            }
        }
        showMandatorModal.value = false
        await fetchMandators()
    } catch (e: any) {
        mandatorError.value = e.message ?? 'Failed to save mandator.'
    } finally {
        savingMandator.value = false
    }
}
```

This replaces the existing `saveMandator` function entirely.

Add `onLogoFilePick`:
```typescript
function onLogoFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    mandatorLogoFile.value = file
    mandatorLogoPreview.value = URL.createObjectURL(file)
}
```

- [ ] **Step 2: Add minimal CSS for logo preview**

```css
.logo-upload { display: flex; align-items: center; gap: 1rem; }
.logo-preview { width: 80px; height: 80px; object-fit: contain; border-radius: var(--radius-sm); border: 1px solid var(--color-border-subtle); }
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add web/src/views/AdminView.vue
git commit -m "feat(web): extend AdminView with contract logo, label address, and UID fields"
```

---

## Task 11: Releases Shortcut

**Files:**
- Modify: `web/src/views/ReleasesView.vue`

- [ ] **Step 1: Add "Create Contract" button to each release card**

Import router and mandator composable:
```typescript
import { useRouter } from 'vue-router'
import { useMandator } from '../composables/useMandator'
import { useArtists } from '../composables/useArtists'

const router = useRouter()
const { contractsEnabled } = useMandator()
const { artists: allArtists, fetchArtists: fetchAllArtists } = useArtists()
```

Fetch artists on mount (for name matching):
```typescript
onMounted(() => {
    fetchReleases()
    fetchAllArtists()
})
```

Add helper to resolve artist from release text:
```typescript
function resolveArtistId(release: Release): string | null {
    const match = allArtists.value.find(
        a => a.name.toLowerCase() === release.artist.toLowerCase()
    )
    return match?.id ?? null
}

function createContractFromRelease(release: Release) {
    const artistId = resolveArtistId(release)
    const query: Record<string, string> = { releaseId: release.id }
    if (artistId) query.artistId = artistId
    query.releaseTitle = release.title
    query.releaseArtist = release.artist
    router.push({ path: '/contracts', query })
}
```

In the template, add a button inside the `.release-actions` div, before the Edit button:
```html
<SyvoraButton
    v-if="contractsEnabled"
    variant="ghost"
    size="sm"
    @click.stop="createContractFromRelease(release)"
>
    Contract
</SyvoraButton>
```

- [ ] **Step 2: Handle query params in ContractsView**

In `ContractsView.vue`'s `onMounted`, check for `releaseId` and `artistId` query params:
```typescript
onMounted(async () => {
    await Promise.all([fetchContracts(), fetchTemplates(), fetchArtists(), fetchReleases()])
    // Auto-open creation modal from release shortcut
    const q = route.query
    if (q.releaseId) {
        openCreateFromRelease(
            q.releaseId as string,
            (q.artistId as string) ?? null,
            (q.releaseTitle as string) ?? '',
            (q.releaseArtist as string) ?? ''
        )
        // Clear query params
        router.replace({ query: {} })
    }
})
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx vue-tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add web/src/views/ReleasesView.vue web/src/views/ContractsView.vue
git commit -m "feat(web): add Create Contract shortcut on release cards"
```

---

## Task 12: Update `useArtists` Interface

**Files:**
- Modify: `web/src/composables/useArtists.ts`

- [ ] **Step 1: Add new fields to `Artist` interface**

Add `address` and `date_of_birth` to the `Artist` interface:
```typescript
export interface Artist {
    id: string; name: string; picture_url: string | null
    is_managed: boolean; managed_by: string | null
    address: string | null; date_of_birth: string | null
    created_by: string | null; updated_by: string | null
    created_at: string; updated_at: string
    creator_name: string | null; updater_name: string | null
    manager_name: string | null
}
```

- [ ] **Step 2: Update `createArtist` and `updateArtist` payloads**

Add `address` and `date_of_birth` as optional fields in the payload types for both functions.

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useArtists.ts
git commit -m "feat(web): add address and date_of_birth fields to Artist interface"
```

---

## Task 13: Release Detail Panel — Contracts Sub-Section

**Files:**
- Modify: `web/src/views/ReleasesView.vue`

- [ ] **Step 1: Import useContracts and add state**

```typescript
import { useContracts, type Contract } from '../composables/useContracts'
const { fetchContractsByRelease } = useContracts()
const releaseContracts = ref<Record<string, Contract[]>>({})
```

- [ ] **Step 2: Fetch contracts when expanding a release**

Update `toggleExpand` to also fetch contracts for that release:
```typescript
async function toggleExpand(releaseId: string) {
    expandedReleaseId.value = expandedReleaseId.value === releaseId ? null : releaseId
    if (expandedReleaseId.value && contractsEnabled.value && !releaseContracts.value[releaseId]) {
        releaseContracts.value[releaseId] = await fetchContractsByRelease(releaseId)
    }
}
```

- [ ] **Step 3: Add contracts section to expanded panel**

After the inline tracks `<div>` inside the `v-if="expandedReleaseId === release.id"` block, add:
```html
<div v-if="contractsEnabled && releaseContracts[release.id]?.length" class="inline-contracts">
    <span class="contracts-label">Contracts</span>
    <div v-for="c in releaseContracts[release.id]" :key="c.id" class="contract-mini">
        <span class="badge" :class="statusBadgeClass(c.status)">{{ c.status.replace('_', ' ') }}</span>
        <span class="contract-mini-title">{{ c.title }}</span>
        <span class="contract-mini-progress">{{ c.signature_count }}/{{ c.signatory_count }} signed</span>
        <RouterLink :to="'/contracts'" class="contract-mini-link">View</RouterLink>
    </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/ReleasesView.vue
git commit -m "feat(web): show linked contracts in release expanded panel"
```

---

## Task 14: Artist Detail — Contracts Tab

**Files:**
- Modify: `web/src/views/ArtistDetailView.vue`

- [ ] **Step 1: Import useContracts and add contracts tab**

```typescript
import { useContracts, type Contract } from '../composables/useContracts'
import { useMandator } from '../composables/useMandator'
const { fetchContractsByArtist } = useContracts()
const { contractsEnabled } = useMandator()
const artistContracts = ref<Contract[]>([])
```

- [ ] **Step 2: Fetch contracts on mount**

In the existing `onMounted` or data-loading section:
```typescript
if (contractsEnabled.value) {
    artistContracts.value = await fetchContractsByArtist(artistId.value)
}
```

- [ ] **Step 3: Add Contracts tab to the tabbed interface**

Add a "Contracts" tab (conditionally visible when `contractsEnabled`) that displays:
- A list of contracts: title, status badge, signature progress, creation date
- Each with a "View" link to `/contracts`

Follow the same pattern used for the existing Notes/Shows/Bookings tabs.

- [ ] **Step 4: Commit**

```bash
git add web/src/views/ArtistDetailView.vue
git commit -m "feat(web): add Contracts tab to ArtistDetailView"
```

---

## Task 15: Final Type-Check and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run production build**

Run: `yarn workspace web build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix any type errors or build issues**

Iterate until clean.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(web): resolve type errors from contracts module integration"
```

- [ ] **Step 5: Verify all spec deliverables**

Cross-check against `docs/features/contracts.md` Definition of Done:
- [ ] Tables: `contract_templates`, `contracts`, `contract_signatories`, `contract_signatures` with RLS
- [ ] `mandators` extended with `module_contracts`, `contract_logo_url`, `label_address`, `label_uid`
- [ ] `artists` extended with `address`, `date_of_birth`
- [ ] Auto-conclude trigger fires on signature insert
- [ ] `contract-logos` storage bucket with public read
- [ ] `sign-contract` edge function (GET + POST)
- [ ] `useContracts` composable with full CRUD
- [ ] `useMandator` extended with `contractsEnabled` + new fields
- [ ] Contracts nav item + routes (authenticated + public)
- [ ] `ContractTemplatesView` with CRUD
- [ ] `ContractsView` with multi-step creation modal
- [ ] `ContractSignView` with canvas signing + legal notice
- [ ] Admin UI: module toggle + logo + address + UID
- [ ] Release shortcut: "Contract" button + expanded panel contracts sub-section
- [ ] Artist detail: Contracts tab
