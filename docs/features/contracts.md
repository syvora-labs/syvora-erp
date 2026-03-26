# Feature: Contracts

## Description

Introduce a Contracts module to create, manage, and collect legally binding signatures on Artist-Label contracts. The module supports reusable contract templates and produces fully configured contracts ready for multi-party signature. A contract is established between the label's internal signatories (typically the Founder and the Artist & Repertoire Manager) and the Artist. Because artists do not have access to the platform, every finalised contract generates a unique public signing URL — accessible by anyone who holds the link — where all parties can review the contract text and apply their handwritten signatures via a canvas-based input field. The signed contract record is then stored and downloadable as a PDF.

The module is gated behind the mandator profile system (`module_contracts`) and follows the same enable/disable pattern as all other ERP modules. Each mandator can additionally configure a logo that appears on the contract header and the public signing page.

All contracts are designed to satisfy the requirements of a valid written contract under Swiss law (Obligationenrecht, OR Art. 11 ff.) with the mandatory clauses, party identification fields, and a Swiss jurisdiction clause included by default.

## Swiss Law Requirements

For a contract to be legally binding under Swiss law the following must be satisfied:

- **Parties clearly identified**: full legal name, address, and — for legal entities — registered company name and UID (OR Art. 1).
- **Written form**: Artist-Label contracts require the simple written form (*einfache Schriftform*, OR Art. 16). A handwritten signature applied on screen and rendered permanently into a PDF satisfies this requirement when combined with a printed copy workflow; parties are advised to also exchange wet-ink originals for maximum enforceability.
- **Offer and acceptance**: the sequential signing flow (internal signatories first, then the artist) models the statutory offer-and-acceptance chain.
- **Definite subject matter**: the contract template must include rights scope, territory, exclusivity, term, and remuneration (OR Art. 394 ff. by analogy; URG Art. 16 for rights transfer).
- **Governing law and jurisdiction clause**: every generated contract contains a mandatory clause designating Swiss law and a specific Swiss canton as the place of jurisdiction (IPRG Art. 116).
- **Date of conclusion**: the contract records the date on which the last required signature is applied.

## Deliverables

### Database — `contract_templates` table

Stores reusable contract blueprints owned by a mandator.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` |
| `name` | TEXT | NOT NULL — internal name of the template (e.g. "Standard Exclusive Recording Deal") |
| `body` | TEXT | NOT NULL — full contract text with `{{placeholder}}` variables (see Variable Reference below) |
| `jurisdiction_canton` | TEXT | NOT NULL, DEFAULT `'Zurich'` — Swiss canton for the jurisdiction clause |
| `governing_law` | TEXT | NOT NULL, DEFAULT `'Swiss law (Obligationenrecht, SR 220)'` |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE only rows where `mandator_id` matches their own profile's mandator.

**Variable Reference** — placeholders resolved at contract generation time:

| Placeholder | Resolved from |
| --- | --- |
| `{{label_name}}` | Mandator name |
| `{{label_address}}` | Mandator address |
| `{{label_uid}}` | Mandator UID (see `mandators` extension below) |
| `{{artist_name}}` | Artist signatory's full legal name |
| `{{artist_address}}` | Artist signatory's address |
| `{{artist_dob}}` | Artist signatory's date of birth |
| `{{contract_date}}` | Date of last required signature (OR: date of contract conclusion) |
| `{{effective_date}}` | Configurable on the contract instance |
| `{{territory}}` | Configurable on the contract instance |
| `{{term}}` | Configurable on the contract instance |
| `{{exclusivity}}` | Configurable on the contract instance (`Exclusive` / `Non-exclusive`) |
| `{{royalty_rate}}` | Configurable on the contract instance |
| `{{advance}}` | Configurable on the contract instance |
| `{{release_title}}` | Linked release title (if a release is attached) |
| `{{release_type}}` | Linked release type (e.g. `Album`, `Single`) — if a release is attached |
| `{{jurisdiction_canton}}` | Template field |
| `{{governing_law}}` | Template field |

### Database — `contracts` table

One row per contract instance generated from a template.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` |
| `template_id` | UUID | FK → `contract_templates(id)` — null if created from scratch |
| `artist_id` | UUID | NOT NULL, FK → `artists(id)` — the artist this contract is with |
| `release_id` | UUID | FK → `releases(id)` — optional; set when the contract is created directly from a release |
| `title` | TEXT | NOT NULL — human-readable contract title |
| `body_snapshot` | TEXT | NOT NULL — resolved contract text at the time of generation (immutable after first signature) |
| `status` | TEXT | NOT NULL, DEFAULT `'draft'` — one of `draft`, `open`, `partially_signed`, `fully_signed`, `voided` |
| `public_token` | UUID | UNIQUE, DEFAULT `gen_random_uuid()` — the token used to build the public signing URL |
| `effective_date` | DATE | — when the contract takes effect |
| `territory` | TEXT | — e.g. `Worldwide` or `Switzerland` |
| `term` | TEXT | — e.g. `3 years` or `until termination` |
| `exclusivity` | TEXT | — `Exclusive` or `Non-exclusive` |
| `royalty_rate` | TEXT | — e.g. `18%` |
| `advance` | TEXT | — e.g. `CHF 2 000` |
| `concluded_at` | TIMESTAMPTZ | — set automatically when all required signatures are collected |
| `voided_at` | TIMESTAMPTZ | — set when status is changed to `voided` |
| `voided_by` | UUID | FK → `auth.users(id)` |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

- `body_snapshot` is populated when the contract is first opened (status transitions from `draft` → `open`). Once set it is never overwritten, preserving the exact text that the parties signed.
- `public_token` is only meaningful once status is `open` or later; the public signing page returns 404 for `draft` or `voided` contracts.
- `concluded_at` is set by a database trigger when the last required signature is inserted into `contract_signatures`.
- `artist_id` drives the artist signatory's pre-filled details and the `{{artist_name}}`, `{{artist_address}}`, `{{artist_dob}}` placeholder resolution. The `artists` table record is the source of truth; the signatory row in `contract_signatories` copies these values at creation time so they are preserved even if the artist record is later edited.
- `release_id` is informational and used to pre-fill `{{release_title}}` and `{{release_type}}` placeholders and to display the linked release on the contract detail view. It does not impose any database constraints on the release lifecycle.

RLS policies: authenticated users can SELECT, INSERT, UPDATE only rows where `mandator_id` matches their own profile's mandator. `public_token`-based reads for the public signing page are executed via Supabase service role from an edge function (see Public Signing Flow below).

### Database — `contract_signatories` table

Defines who must sign a specific contract and in what capacity.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `contract_id` | UUID | NOT NULL, FK → `contracts(id)` ON DELETE CASCADE |
| `role` | TEXT | NOT NULL — one of `founder`, `ar_manager`, `artist` (extensible) |
| `display_name` | TEXT | NOT NULL — the name shown on the signing page for this role (e.g. "Founder", "A&R Manager", "Artist") |
| `legal_name` | TEXT | NOT NULL — full legal name of this party (required by OR for party identification) |
| `address` | TEXT | NOT NULL — postal address of this party |
| `date_of_birth` | DATE | — required for natural persons (relevant for legal capacity under ZGB Art. 12 ff.) |
| `email` | TEXT | — optional contact email, used for future notification extension |
| `user_id` | UUID | FK → `auth.users(id)` — set for internal platform users; NULL for the artist |
| `signing_order` | INTEGER | NOT NULL, DEFAULT `0` — lower numbers sign first; ties sign in parallel |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

RLS policies: same mandator-scoped access as `contracts` (resolved via `contract_id → contracts.mandator_id`). The public signing page reads signatories via service role.

Constraints:
- At minimum one signatory with `role = 'artist'` and `user_id IS NULL` must exist.
- At minimum one internal signatory (`user_id IS NOT NULL`) must exist.
- `(contract_id, role)` must be unique unless the role is `'ar_manager'` or a future custom role — enforced at application level.

### Database — `contract_signatures` table

Stores the actual signature for each signatory once applied.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `contract_id` | UUID | NOT NULL, FK → `contracts(id)` ON DELETE CASCADE |
| `signatory_id` | UUID | NOT NULL, FK → `contract_signatories(id)` ON DELETE CASCADE |
| `signature_svg` | TEXT | NOT NULL — the handwritten signature as an SVG path string captured from the canvas |
| `signed_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| `ip_address` | TEXT | — the IP address of the request at signing time (audit trail) |
| `user_agent` | TEXT | — the browser user agent at signing time (audit trail) |

UNIQUE constraint on `(contract_id, signatory_id)` — each signatory can only sign once.

RLS policies: INSERT via service role only (from the edge function). SELECT by authenticated users scoped to their mandator. This prevents tampering with existing signatures.

### Database — `mandators` table extensions

Add the following columns to the existing `mandators` table:

| Column | Type | Constraints |
| --- | --- | --- |
| `module_contracts` | BOOLEAN | NOT NULL, DEFAULT `true` |
| `contract_logo_url` | TEXT | — URL of the logo image stored in Supabase Storage, displayed on contract header and signing page |
| `label_address` | TEXT | — the label's registered postal address, used to populate `{{label_address}}` |
| `label_uid` | TEXT | — the label's Swiss UID (Unternehmens-Identifikationsnummer), used for legal identification |

### Database — trigger: auto-conclude contract

A database trigger on `contract_signatures` (`AFTER INSERT`) that:

1. Counts the total number of signatories for the contract.
2. Counts the total number of signatures for the contract.
3. If the counts match, sets `contracts.status = 'fully_signed'` and `contracts.concluded_at = now()`.
4. If at least one signature exists but not all, sets `contracts.status = 'partially_signed'`.

### Supabase Storage — `contract-logos` bucket

A new storage bucket `contract-logos` (public read, authenticated write) for mandator logo uploads used on the contract header and signing page.

### Edge Function — `sign-contract`

A Supabase Edge Function at `/functions/v1/sign-contract` that handles all public (unauthenticated) contract interactions using the service role key:

- `GET /sign-contract?token=<public_token>` — returns the full contract record (title, body_snapshot, status, signatories, existing signatures) for rendering on the public signing page. Returns 404 if the token is invalid or the contract is `draft`/`voided`.
- `POST /sign-contract` — accepts `{ token, signatory_id, signature_svg }`. Validates the token, verifies the contract is `open` or `partially_signed`, verifies the signatory exists for this contract and has not already signed, then inserts a row into `contract_signatures`. Returns the updated contract status. The function captures `ip_address` and `user_agent` from the request context for the audit trail.

The edge function enforces signing order: a signatory with `signing_order = N` cannot sign until all signatories with `signing_order < N` have signed.

### Composable — `useContracts`

A new composable following the established pattern that:

- Exposes `contracts` (ref array), `templates` (ref array), `loading` (ref boolean) state.
- Provides `fetchContracts()` — fetches all contracts for the current mandator, ordered by `created_at` descending, enriched with signatory count and signature count.
- Provides `fetchTemplates()` — fetches all contract templates for the current mandator, ordered by `name`.
- Provides `createTemplate(form)`, `updateTemplate(id, form)`, `deleteTemplate(id)` — CRUD for templates.
- Provides `createContract(form)` — creates a contract in `draft` status. Accepts template_id (optional), artist_id (required), release_id (optional), title, effective_date, territory, term, exclusivity, royalty_rate, advance, and an array of signatory definitions. When `artist_id` is provided, the artist signatory row is pre-populated from the `artists` record (legal name, address, date of birth). Inserts one row into `contracts` and one row per signatory into `contract_signatories`.
- Provides `fetchContractsByArtist(artistId)` — fetches all contracts linked to a specific artist, ordered by `created_at` descending. Used by the artist detail panel in `ArtistsView`.
- Provides `fetchContractsByRelease(releaseId)` — fetches all contracts linked to a specific release. Used by the release shortcut flow.
- Provides `openContract(id)` — transitions the contract from `draft` to `open`. Resolves all `{{placeholder}}` variables from the contract body and writes the result into `body_snapshot`. After this point the body is immutable.
- Provides `voidContract(id)` — sets status to `voided`. Only permitted when status is `draft`, `open`, or `partially_signed`.
- Provides `getSigningUrl(contract)` — returns the public signing URL: `/sign/<public_token>`.
- Provides `fetchContractSignatories(contractId)` and `fetchContractSignatures(contractId)` for detail views.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `contractsEnabled` (computed from `mandator.module_contracts`).
- Add `'contracts'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'contracts', column: 'module_contracts', label: 'Contracts' }
  ```
- `isModuleEnabled('contracts')` returns the correct value.
- Expose `contractLogoUrl`, `labelAddress`, and `labelUid` from the mandator record.

### Navigation and routing

- In `App.vue`, add a new nav item for "Contracts" pointing to `/contracts`, wrapped with `v-if="contractsEnabled"`.
- Add authenticated routes in `router/index.ts`:
  ```ts
  { path: '/contracts', name: 'contracts', component: ContractsView, meta: { requiresAuth: true, module: 'contracts' } }
  { path: '/contracts/templates', name: 'contract-templates', component: ContractTemplatesView, meta: { requiresAuth: true, module: 'contracts' } }
  ```
- Add a public (unauthenticated) route:
  ```ts
  { path: '/sign/:token', name: 'contract-sign', component: ContractSignView, meta: { requiresAuth: false } }
  ```
  The existing `beforeEach` guard must be updated to skip module/auth checks for routes where `meta.requiresAuth === false`.

### View — `ContractsView.vue`

A new authenticated view that includes:

- A list of all contracts for the current mandator displaying: title, linked artist name, linked release title (if set), status badge (`draft`, `open`, `partially signed`, `fully signed`, `voided`), creation date, and signature progress (e.g. "2 / 3 signed").
- A "Create Contract" button that opens a multi-step modal:
  1. **Step 1 — Template**: choose an existing template or start from scratch (raw text editor).
  2. **Step 2 — Details**: fill in title, effective date, territory, term, exclusivity, royalty rate, advance. An **Artist** picker (required) selects from the `artists` table scoped to the current mandator. An optional **Release** picker selects from the `releases` table scoped to the current mandator; when a release is chosen, `{{release_title}}` and `{{release_type}}` placeholders resolve automatically.
  3. **Step 3 — Signatories**: configure the signing parties. Pre-populated with three default rows (Founder, A&R Manager, Artist). The Artist row is pre-filled with the legal name, address, and date of birth from the selected `artists` record (editable). Each row has fields for role label, legal name, address, date of birth, email, and — for internal parties — a user picker restricted to the current mandator's users. Signing order is configurable via a numeric field. Rows can be added or removed.
- Per-contract actions:
  - **Open** (for `draft` contracts) — resolves placeholders, locks the body, transitions to `open`, and reveals the signing URL.
  - **Copy signing link** — copies the public signing URL to the clipboard.
  - **View** — expands a detail panel showing the resolved contract text, the list of signatories, and the status of each signature (pending / signed with timestamp).
  - **Void** — confirms and voids the contract. Disabled for `fully_signed` contracts.
- A link to "Templates" navigating to `/contracts/templates`.

### View — `ContractTemplatesView.vue`

A new authenticated view for managing reusable templates:

- A list of all templates for the current mandator displaying: name, jurisdiction canton, and creation date.
- A "Create Template" button that opens a modal with:
  - **Name** (required)
  - **Body** — a large textarea with syntax highlighting hints for `{{placeholder}}` variables, and a sidebar reference panel listing all available placeholders.
  - **Jurisdiction canton** (required, default `Zurich`)
  - **Governing law** (read-only display, always `Swiss law (Obligationenrecht, SR 220)`)
- Inline edit and delete per template row. Deleting a template does not affect contracts already generated from it (the body snapshot is stored independently).

### View — `ContractSignView.vue` (public)

A publicly accessible view rendered for unauthenticated users at `/sign/:token`. This view:

- Fetches contract data from the `sign-contract` edge function using the token from the URL parameter.
- Displays a 404 / "Contract not found" message if the token is invalid or the contract is `draft`/`voided`.
- Displays a "Contract already fully signed" read-only summary if status is `fully_signed`.
- Otherwise renders:
  - **Header**: mandator logo (from `contract_logo_url`), contract title, and status.
  - **Contract body**: the full `body_snapshot` text, formatted for readability (whitespace-preserved, paragraph breaks, section headings).
  - **Signatories panel**: a list of all required signatories in signing order, each showing their display name / role, legal name, and either:
    - A green "Signed on [date]" indicator with a preview of their signature SVG, if already signed.
    - A "Waiting for previous signatories" message, if this signatory's turn has not yet come.
    - A signature canvas input (see below), if it is this signatory's turn and they have not yet signed.
  - **Signature canvas**: a `<canvas>` element with touch and pointer event support allowing freehand handwriting input. A "Clear" button resets the canvas. A "Sign" button submits the captured SVG path to the edge function. The signatory is identified by selecting their name from the list of pending signatories at the correct signing order tier (since there is no authentication, the artist or internal user simply selects their own name from the panel).
  - **Legal notice**: a brief statement that by clicking "Sign" the user agrees that their digital handwritten signature constitutes a valid signature under Swiss law (OR Art. 14 by analogy), and that they have read and understood the full contract.
- After successful submission, the view refreshes to show the updated signature state.

### Release shortcut — "Create Contract" from `ReleasesView.vue`

When the Contracts module is enabled for the current mandator, each release row/card gains a "Create Contract" action button (visible alongside the existing edit and delete actions). Clicking it:

1. Opens the standard contract creation modal (same as the "Create Contract" button in `ContractsView`) with the following fields pre-filled:
   - **Release**: locked to the current release (display-only, cannot be changed).
   - **Artist**: pre-selected from the artist linked to this release (resolved via `releases.artist` matched against `artists.name`, or left as a manual picker if no match is found). The signatory legal name, address, and date of birth fields are populated from the `artists` record if available.
   - **Title**: defaults to `"Recording Agreement — <release.title>"`.
   - **Territory / Term / Exclusivity / Royalty rate / Advance**: left blank for manual entry.
2. On submission, `createContract` is called with `release_id` set to the current release's `id` and `artist_id` set to the resolved artist.
3. After the contract is created, the modal closes and a brief success toast confirms the draft was created with a link to open it in the Contracts view.

Additionally, the release detail/expanded panel (if one exists) displays a **Contracts** sub-section showing all contracts linked to that release (title, status badge, signature progress), each with a "View" link that navigates to `/contracts` filtered by that record.

Note: `releases.artist` is currently a plain TEXT field and is not a FK to the `artists` table. The matching logic (name lookup) must handle the case where no `artists` record matches and fall back to a free-text artist name entry with a manual artist picker. This is a known data model limitation that can be resolved in a future migration to add `releases.artist_id`.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add:
  - A "Contracts" checkbox alongside existing module toggles, mapping to `module_contracts`.
  - A "Contract Logo" file upload input that stores the image in the `contract-logos` Supabase Storage bucket and saves the resulting URL to `mandators.contract_logo_url`.
  - A "Label Address" textarea for `mandators.label_address`.
  - A "Label UID" text input for `mandators.label_uid`.
- The mandator list view displays a "Contracts" badge (enabled/disabled) consistent with existing module badges.

### Sensible defaults

- The migration sets `module_contracts = true` on all existing mandator records.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_contracts: true`.
- A starter template named "Standard Exclusive Recording Agreement (CH)" is seeded for the default mandator (`00000000-0000-0000-0000-000000000001`). Its body includes all legally required clauses: parties, rights grant, exclusivity, territory, term, royalties, accounting, termination, governing law, and jurisdiction.

## Definition of Done

- The `contract_templates`, `contracts`, `contract_signatories`, and `contract_signatures` tables exist with the specified schemas, RLS policies, UNIQUE constraints, and the auto-conclude trigger.
- The `mandators` table has `module_contracts` (BOOLEAN, default `true`), `contract_logo_url` (TEXT), `label_address` (TEXT), and `label_uid` (TEXT) columns.
- The `contract-logos` Supabase Storage bucket exists with public read access.
- The `sign-contract` edge function handles GET and POST, validates tokens, enforces signing order, captures IP/user-agent, and triggers the auto-conclude logic via the database trigger.
- `body_snapshot` is written once when the contract is opened and is never subsequently modified.
- The `public_token` signing URL returns 404 for `draft` and `voided` contracts.
- Signing order is enforced: a signatory cannot sign until all signatories with a lower `signing_order` value have signed.
- The `useContracts` composable provides reactive state and full CRUD for templates and contracts, including `openContract`, `voidContract`, and `getSigningUrl`.
- The `useMandator` composable exposes `contractsEnabled`, `contractLogoUrl`, `labelAddress`, and `labelUid`, and includes `'contracts'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Contracts" tab appears in navigation when the module is enabled for the current mandator.
- Navigating to `/contracts` when the module is disabled redirects to the first available enabled module.
- The public route `/sign/:token` is accessible without authentication and does not trigger auth guards.
- The public signing page renders the full contract text, all signatories with their signing status, the signature canvas for eligible pending signatories, and the mandator logo.
- The signature canvas supports both mouse and touch/stylus input and exports an SVG path.
- After all required signatures are collected, `contracts.status` transitions to `fully_signed` and `contracts.concluded_at` is set automatically by the database trigger.
- Each generated contract body includes a governing law clause (`Swiss law, Obligationenrecht SR 220`) and a jurisdiction clause naming a Swiss canton.
- The admin can toggle the Contracts module and configure the logo, label address, and UID per mandator via `AdminView.vue`.
- All existing mandators are migrated with `module_contracts = true` (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
- Every contract has a required `artist_id` FK linking it to an `artists` record.
- The artist signatory row in `contract_signatories` is auto-populated from the linked `artists` record at contract creation time (name, address, date of birth).
- `{{artist_name}}`, `{{artist_address}}`, and `{{artist_dob}}` placeholders resolve from the `artists` record at open time.
- Contracts can optionally carry a `release_id` FK. When set, `{{release_title}}` and `{{release_type}}` resolve from the linked `releases` record.
- A "Create Contract" shortcut appears on each release row in `ReleasesView` when the Contracts module is enabled, pre-filling the modal with the release and best-matched artist.
- The release detail panel shows a Contracts sub-section listing all contracts linked to that release.
- `useContracts` exposes `fetchContractsByArtist(artistId)` and `fetchContractsByRelease(releaseId)`.
