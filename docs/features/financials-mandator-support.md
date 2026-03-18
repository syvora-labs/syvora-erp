# Feature: Financials — Mandator Profile Support

## Description

Extend the existing Financials module so that each mandator operates its own isolated set of financial data. Currently, financial categories and transactions are shared across all users regardless of mandator assignment. After this change, every category and transaction belongs to exactly one mandator, and users can only view, create, and manage financial records within their own mandator. This ensures that each label or tenant has a fully independent financial overview — separate transactions, categories, dashboard metrics, and reporting — without interference from other mandators.

The module's existing functionality (transactions, categories, dashboard analytics, event/release linking) remains unchanged. The only structural difference is that all data is scoped to the current user's mandator, and RLS policies enforce cross-mandator isolation at the database level.

## Deliverables

### Database — `financial_categories.mandator_id` column

Add a `mandator_id` (UUID, NOT NULL, FK → `mandators(id)`) column to the existing `financial_categories` table.

Migration steps:

1. Add the column as nullable first.
2. Backfill all existing rows with the default mandator ID (`00000000-0000-0000-0000-000000000001`).
3. Set the column to NOT NULL.
4. Create an index on `mandator_id` for efficient filtering.

Update RLS policies to replace the current "all authenticated users" access with mandator-scoped access:

- **SELECT**: authenticated users can read rows where `mandator_id` matches their profile's mandator.
- **INSERT**: authenticated users can insert rows only with a `mandator_id` matching their profile's mandator.
- **UPDATE**: authenticated users can update rows where `mandator_id` matches their profile's mandator.
- **DELETE**: authenticated users can delete rows where `mandator_id` matches their profile's mandator.

### Database — `financial_transactions.mandator_id` column

Add a `mandator_id` (UUID, NOT NULL, FK → `mandators(id)`) column to the existing `financial_transactions` table.

Migration steps:

1. Add the column as nullable first.
2. Backfill all existing rows with the default mandator ID (`00000000-0000-0000-0000-000000000001`).
3. Set the column to NOT NULL.
4. Create an index on `mandator_id` for efficient filtering.

Update RLS policies to mandator-scoped access (same pattern as `financial_categories` above).

Additionally, add a CHECK or application-level constraint ensuring that a transaction's `category_id` (when set) references a category within the same mandator, preventing cross-mandator category assignment.

### Database — cross-module foreign key consistency

The existing `event_id` and `release_id` foreign keys on `financial_transactions` link to the `events` and `releases` tables. If those tables are also mandator-scoped in the future, ensure that linked records belong to the same mandator. For now, add an application-level validation in the composable to only present events and releases that are accessible to the current user (already enforced by their respective RLS policies).

### Composable — `useFinancialCategories` updates

Update the existing composable to:

- Read the current user's `mandator_id` from `useMandator` (or the user's profile).
- Pass `mandator_id` when creating a new category (`createCategory`).
- Filter fetched categories by `mandator_id` in the query (as a defense-in-depth measure alongside RLS).
- No changes to the public API shape — `categories`, `loading`, `fetchCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()` remain the same.

### Composable — `useFinancialTransactions` updates

Update the existing composable to:

- Read the current user's `mandator_id` from `useMandator` (or the user's profile).
- Pass `mandator_id` when creating a new transaction (`createTransaction`).
- Filter fetched transactions by `mandator_id` in the query (defense-in-depth alongside RLS).
- When populating the category selector, only show categories belonging to the current mandator (already handled by the updated `useFinancialCategories`).
- When populating event/release selectors, rely on the existing RLS policies of those tables to return only accessible records.
- No changes to the public API shape.

### Composable — `useFinancialDashboard` — no changes

The dashboard composable operates on the `transactions` ref passed to it. Since the transactions are already mandator-scoped by the updated `useFinancialTransactions`, all computed metrics (total income, total expenses, net balance, monthly chart data, category chart data, recent transactions) automatically reflect only the current mandator's data. No changes required.

### View — `FinancialsView.vue` updates

Minimal changes:

- Ensure the transaction modal's category selector only lists categories from the current mandator (already handled by composable changes).
- Ensure the event/release selectors only show records accessible to the current user (already handled by existing RLS).
- No visual or layout changes — the view continues to display the same Dashboard, Transactions, and Categories tabs.

### Admin UI — no changes

The existing mandator management UI already includes the `module_financials` toggle. No additional admin-facing changes are required for mandator data scoping, as the isolation is enforced at the database and composable levels.

## Definition of Done

- The `financial_categories` table has a `mandator_id` column (NOT NULL, FK → `mandators`) with an index, and all existing rows are backfilled to the default mandator.
- The `financial_transactions` table has a `mandator_id` column (NOT NULL, FK → `mandators`) with an index, and all existing rows are backfilled to the default mandator.
- RLS policies on both tables enforce that users can only access records belonging to their own mandator.
- A transaction's `category_id` can only reference a category within the same mandator (validated at application level).
- The `useFinancialCategories` and `useFinancialTransactions` composables set `mandator_id` on creation and filter by `mandator_id` on fetch.
- The dashboard metrics, charts, and recent transactions reflect only the current mandator's data.
- Users in different mandators see completely independent financial data — no cross-mandator data leakage.
- Existing financial data is migrated to the default mandator without data loss (no breaking change on deploy).
- The event/release selectors in the transaction modal continue to work correctly, showing only records accessible to the current user.
