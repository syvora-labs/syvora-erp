# Event Detail Page Design

**Date:** 2026-04-08
**Status:** Approved

## Overview

Add a detail page for individual events at `/events/:id`, following the existing `ArtistDetailView` pattern. The page displays event information, team assignments, and linked financial transactions in a tabbed interface with inline editing.

## Route

- **Path:** `/events/:id`
- **Guard:** `requiresAuth: true`, `module: "events"`
- **Component:** `EventDetailView.vue`
- **Navigation:** Clicking an event card in `EventsView` navigates here. Back button returns to `/events`.

## Header

- Event artwork (large, or placeholder with first letter of title in colored circle)
- Title, location, formatted event date
- Status badges: Draft/Published, Upcoming/Past
- Action buttons: Edit, Publish/Unpublish, Archive/Unarchive, Delete (with confirmation)

## Tabs

### 1. Overview

- Description (rendered as text)
- Lineup displayed as badges
- Ticket link (clickable external link)
- Metadata footer: created by, updated by, created_at, updated_at

### 2. Team Assignments

- List of team members assigned to the event with their roles and notes
- Source: `team_event_assignments` table (already exists)
- CRUD via modal: add assignment (select team member, role, notes), edit, remove
- Needs team member dropdown populated from `team_members` table

### 3. Financial Transactions

- List of financial transactions linked via `event_id`
- Display: date, description, amount, type (income/expense)
- CRUD via modal: add/edit/remove transactions
- Source: `financial_transactions` table (already exists, has `event_id` FK)
- Reuses existing `useFinancialTransactions` composable

## Edit Modal

Same fields as the existing create/edit modal in `EventsView`:
- Title, description, lineup (tag input), location, event_date, artwork upload, ticket_link
- Uses `useEvents().updateEvent()` and `uploadEventArtwork()`

## Data Layer Changes

### `useEvents.ts` — extend with:
- `fetchEventById(id: string)` — fetch single event with profile enrichment

### New functions for team assignments (add to `useEvents.ts` or new composable):
- `fetchEventTeamAssignments(eventId: string)`
- `assignTeamMember(eventId, teamMemberId, role, notes)`
- `updateTeamAssignment(assignmentId, updates)`
- `removeTeamAssignment(assignmentId)`

### `useFinancialTransactions.ts` — already supports event_id filtering, reuse as-is

## Database

No new tables or migrations required. All tabs use existing tables:
- `events`
- `team_event_assignments`
- `financial_transactions`

## Files to Create/Modify

- **Create:** `web/src/views/EventDetailView.vue` — single-file detail view (~800-1000 lines)
- **Modify:** `web/src/router/index.ts` — add `/events/:id` route
- **Modify:** `web/src/composables/useEvents.ts` — add `fetchEventById`, team assignment functions
- **Modify:** `web/src/views/EventsView.vue` — make event cards clickable (router-link to detail)
