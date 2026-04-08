# Feature: Sales

## Description

Introduce a Sales module to configure and manage ticket offerings for events within the ERP. The module enables mandator administrators to set up multiple pricing phases per event (e.g. Early Bird, Regular, Door) with quantity caps, sale windows, and per-phase pricing. All ticket configuration is stored in the database and exposed via a composable for the admin UI. The actual public-facing ticket shop, Stripe payment processing, confirmation emails, and QR code scanning will be implemented in a separate frontend project (a lightweight linktree-style site) that reads from the same Supabase database. This feature covers only the admin configuration side and the underlying data model.

The module is gated behind the mandator profile system (`module_sales`) and follows the same enable/disable pattern as all other ERP modules.

## Deliverables

### Database — `ticket_phases` table

Defines pricing tiers and availability windows for an event's tickets.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `event_id` | UUID | NOT NULL, FK → `events(id)` ON DELETE CASCADE |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` |
| `name` | TEXT | NOT NULL — phase label (e.g. "Early Bird", "Regular", "Door") |
| `description` | TEXT | — optional description shown to the buyer |
| `price_cents` | INTEGER | NOT NULL — ticket price in the smallest currency unit (e.g. cents for CHF) |
| `currency` | TEXT | NOT NULL, DEFAULT `'chf'` — ISO 4217 lowercase currency code |
| `quantity` | INTEGER | NOT NULL — total number of tickets available in this phase |
| `sort_order` | INTEGER | NOT NULL, DEFAULT `0` — display order (ascending) |
| `sale_start` | TIMESTAMPTZ | — when tickets in this phase become available for purchase (NULL = immediately) |
| `sale_end` | TIMESTAMPTZ | — when tickets in this phase stop being available (NULL = until sold out or event starts) |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT `true` — manual toggle to enable/disable the phase |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE where `mandator_id` matches their profile's mandator.

### Database — `ticket_orders` table

Stores each purchase transaction. Rows are created by the external ticket shop project (via Supabase service role or edge functions) but are readable and manageable from the ERP admin.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` |
| `event_id` | UUID | NOT NULL, FK → `events(id)` |
| `buyer_name` | TEXT | NOT NULL — full name of the buyer |
| `buyer_email` | TEXT | NOT NULL — email address for the confirmation and tickets |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'` — one of `pending`, `paid`, `refunded`, `expired` |
| `total_cents` | INTEGER | NOT NULL — total amount charged in smallest currency unit |
| `currency` | TEXT | NOT NULL, DEFAULT `'chf'` |
| `stripe_checkout_session_id` | TEXT | UNIQUE — Stripe Checkout Session ID |
| `stripe_payment_intent_id` | TEXT | — Stripe PaymentIntent ID (populated after payment) |
| `paid_at` | TIMESTAMPTZ | — set when payment is confirmed |
| `refunded_at` | TIMESTAMPTZ | — set when a refund is processed |
| `email_sent_at` | TIMESTAMPTZ | — set when confirmation email is successfully sent |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

RLS policies: authenticated users can SELECT, UPDATE where `mandator_id` matches their profile's mandator. INSERT and DELETE are restricted to service role (orders are created by the external ticket shop).

### Database — `tickets` table

One row per individual ticket within an order. Each ticket has a unique QR code token for door verification.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `order_id` | UUID | NOT NULL, FK → `ticket_orders(id)` ON DELETE CASCADE |
| `phase_id` | UUID | NOT NULL, FK → `ticket_phases(id)` |
| `event_id` | UUID | NOT NULL, FK → `events(id)` |
| `mandator_id` | UUID | NOT NULL, FK → `mandators(id)` |
| `qr_token` | UUID | NOT NULL, UNIQUE, DEFAULT `gen_random_uuid()` — the value encoded in the QR code |
| `status` | TEXT | NOT NULL, DEFAULT `'valid'` — one of `valid`, `checked_in`, `cancelled` |
| `checked_in_at` | TIMESTAMPTZ | — set when the ticket is scanned and validated at the door |
| `checked_in_by` | UUID | FK → `auth.users(id)` — the staff member who scanned the ticket |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

RLS policies: authenticated users can SELECT, UPDATE where `mandator_id` matches their profile's mandator. INSERT is restricted to service role (tickets are created by the external ticket shop alongside orders).

### Database — `mandators` table extensions

Add the following columns to the existing `mandators` table:

| Column | Type | Constraints |
| --- | --- | --- |
| `module_sales` | BOOLEAN | NOT NULL, DEFAULT `true` |
| `stripe_secret_key` | TEXT | — Stripe secret key (used by the external ticket shop project at checkout time) |
| `stripe_webhook_secret` | TEXT | — Stripe webhook signing secret (used by the external ticket shop project) |

Note: Stripe keys are sensitive. Only admin users can edit mandator settings in the UI. The external ticket shop reads these via service role.

### Database — helper function: `get_phase_sold_count(phase_id UUID)`

A Postgres function that returns the count of tickets linked to a given `ticket_phases.id` where the parent `ticket_orders.status = 'paid'`. Used by the admin view to determine remaining availability.

```sql
CREATE OR REPLACE FUNCTION get_phase_sold_count(p_phase_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM tickets t
  JOIN ticket_orders o ON o.id = t.order_id
  WHERE t.phase_id = p_phase_id
    AND o.status = 'paid';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Composable — `useSales`

A new composable following the established pattern that:

- Exposes `phases` (ref array), `orders` (ref array), `tickets` (ref array), `loading` (ref boolean) state.
- Provides `fetchPhases(eventId)` — fetches all ticket phases for a given event, ordered by `sort_order` ascending, enriched with `sold_count` (via `get_phase_sold_count` RPC) and `remaining` (computed as `quantity - sold_count`).
- Provides `createPhase(form)`, `updatePhase(id, form)`, `deletePhase(id)` — CRUD for ticket phases. `deletePhase` is only permitted if no paid orders contain tickets for this phase.
- Provides `fetchOrders(eventId)` — fetches all orders for a given event, ordered by `created_at` descending, enriched with the count of tickets per order and the buyer details.
- Provides `fetchTickets(orderId)` — fetches all tickets for a given order with their phase name and check-in status.
- Provides `fetchEventSalesSummary(eventId)` — returns an aggregated summary: total revenue, total tickets sold, tickets checked in, tickets remaining per phase. Used for the admin dashboard panel.

### Composable — `useMandator` extension

Extend the existing `useMandator` composable with:

- A new reactive flag: `salesEnabled` (computed from `mandator.module_sales`).
- Add `'sales'` to the `enabledModules` computed list when the flag is active.
- Register the new module in the `MODULE_DEFINITIONS` array:
  ```ts
  { route: 'sales', column: 'module_sales', label: 'Sales' }
  ```
- `isModuleEnabled('sales')` returns the correct value.

### Navigation and routing

- In `App.vue`, add a new nav item for "Sales" pointing to `/sales`, wrapped with `v-if="salesEnabled"`.
- Add authenticated routes in `router/index.ts`:
  ```ts
  { path: '/sales', name: 'sales', component: SalesView, meta: { requiresAuth: true, module: 'sales' } }
  { path: '/sales/:eventId', name: 'sales-event', component: SalesEventView, meta: { requiresAuth: true, module: 'sales' } }
  ```

### View — `SalesView.vue` (admin overview)

A new authenticated view that shows a high-level overview of all events with ticket sales:

- A list of all events (from the `events` table, scoped to the current mandator), displaying: event name, event date, number of ticket phases configured, total tickets available (sum of all phase quantities), total tickets sold, total revenue, and a status indicator (on sale / ended / not yet started / not configured).
- A "Configure Tickets" button per event that navigates to `/sales/:eventId`.
- Events without ticket phases show a "Set up tickets" action that also navigates to the event sales config.

### View — `SalesEventView.vue` (admin — event ticket config)

A detailed admin view for configuring and monitoring ticket sales for a specific event:

**Ticket Phases section**:
- A list of all phases for the event showing: name, price (formatted with currency), quantity, sold count, remaining, sale window (start–end), active status toggle.
- An "Add Phase" button that opens a modal with fields: name (required), description, price (required, in major currency units — converted to cents on save), currency (default CHF), quantity (required), sort order, sale start, sale end, is active.
- Inline edit and delete per phase. Delete is disabled if any paid tickets exist for the phase.

**Orders section**:
- A table of all orders for the event showing: buyer name, buyer email, status badge (`pending`, `paid`, `refunded`, `expired`), total amount, number of tickets, order date, email sent indicator.
- Expandable row showing individual tickets within the order: phase name, QR token (truncated), status (`valid`, `checked_in`, `cancelled`), check-in timestamp if applicable.

**Summary panel**:
- Total revenue, total tickets sold, check-in rate (checked in / sold), and a per-phase breakdown.

### Event integration — `EventsView.vue` extension

When the Sales module is enabled for the current mandator, each event row/card gains:

- A "Tickets" badge showing the number of tickets sold (e.g. "42 / 100 sold") if ticket phases are configured.
- A "Manage Tickets" action button that navigates to `/sales/:eventId`.

### Admin UI — mandator management extension

- In the mandator create/edit modal within `AdminView.vue`, add:
  - A "Sales" checkbox alongside existing module toggles, mapping to `module_sales`.
  - A "Stripe Secret Key" password input for `mandators.stripe_secret_key`.
  - A "Stripe Webhook Secret" password input for `mandators.stripe_webhook_secret`.
  - These fields are only visible to admin users and are masked by default.
- The mandator list view displays a "Sales" badge (enabled/disabled) consistent with existing module badges.

### Sensible defaults

- The migration sets `module_sales = true` on all existing mandator records so that the feature is available immediately without manual admin intervention.
- The default mandator form factory (`getDefaultForm()`) in `useMandator` includes `module_sales: true`.

## Definition of Done

- The `ticket_phases`, `ticket_orders`, and `tickets` tables exist with the specified schemas, RLS policies, foreign keys, and the `get_phase_sold_count` helper function.
- The `mandators` table has `module_sales` (BOOLEAN, default `true`), `stripe_secret_key` (TEXT), and `stripe_webhook_secret` (TEXT) columns.
- The `useSales` composable provides reactive state and operations for phases (CRUD), orders (fetch), tickets (fetch), and event summary (aggregated stats).
- The `useMandator` composable exposes `salesEnabled` and includes `'sales'` in `enabledModules` and `MODULE_DEFINITIONS`.
- A new "Sales" tab appears in navigation when the module is enabled for the current mandator.
- Navigating to `/sales` when the module is disabled redirects to the first available enabled module.
- The admin can configure ticket phases per event with pricing, quantity, sale windows, and active toggles.
- The admin can view all orders and tickets for an event, including check-in status.
- The admin can toggle the Sales module and configure Stripe credentials per mandator via `AdminView.vue`.
- Events in `EventsView` show ticket sales progress and a "Manage Tickets" quick action when the Sales module is enabled.
- All existing mandators are migrated with `module_sales = true` (no breaking change on deploy).
- Toggling the module flag takes effect without a full page reload (via `refreshMandator()`).
- The database schema supports the full ticket lifecycle (purchase, check-in, cancellation) so that the external ticket shop project can create orders and tickets via service role without requiring schema changes.
