# Email Integration Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Overview

Integrate Hostpoint IMAP/SMTP email into the Syvora ERP as a full-featured, per-user email client. Users can compose, read, reply, forward, search, and manage emails within the ERP — connected to their personal Hostpoint mailbox. The module is toggleable per mandator (`module_email`).

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐        ┌─────────────────┐
│   Vue 3 Frontend    │◄──WSS──►│  Email Proxy Service │◄─IMAP─►│   Hostpoint     │
│   (Email Module)    │──REST──►│  (Node.js)           │──SMTP─►│   Mail Server   │
└─────────────────────┘         └──────────────────────┘        └─────────────────┘
         │                              │
         │ Supabase JWT                 │ Service Role Key
         ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase                              │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │ auth.users   │  │ email_settings    │  │ mandators │  │
│  │ (JWT verify) │  │ (encrypted creds) │  │ (modules) │  │
│  └─────────────┘  └──────────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Flow

1. User logs into the ERP (Supabase Auth — unchanged)
2. Admin enables `module_email` for the mandator and configures Hostpoint server settings (host, port, TLS)
3. User enters their personal Hostpoint email + password in a settings page
4. Credentials are encrypted via `pgcrypto` and stored in `user_email_settings`
5. The email proxy service authenticates the user via Supabase JWT, retrieves + decrypts credentials, and opens an IMAP connection to Hostpoint
6. Vue frontend communicates via REST (send, move, delete) and WebSocket (real-time inbox updates via IMAP IDLE)

## Database Schema

### `mandators` table — new column

- `module_email BOOLEAN DEFAULT false` — toggles the email module per mandator

### `mandator_email_config` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `mandator_id` | UUID FK (unique) | One config per mandator |
| `imap_host` | TEXT | e.g., `mail.hostpoint.ch` |
| `imap_port` | INT | e.g., `993` |
| `smtp_host` | TEXT | e.g., `mail.hostpoint.ch` |
| `smtp_port` | INT | e.g., `465` |
| `use_tls` | BOOLEAN DEFAULT true | |
| `created_by` / `updated_by` | UUID FK | Audit |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit |

RLS: Only admins of the mandator can read/write.

### `user_email_settings` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `user_id` | UUID FK (unique) | One email config per user |
| `mandator_id` | UUID FK | Tenant scoping |
| `email_address` | TEXT | User's Hostpoint email |
| `encrypted_password` | BYTEA | Encrypted via `pgcrypto` |
| `display_name` | TEXT | Name shown in outgoing emails |
| `signature_html` | TEXT | User's email signature (rich text) |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit |

RLS: Users can only read/write their own row. The email proxy service uses the service role key to decrypt credentials.

### Encryption

`pgp_sym_encrypt(password, server_secret)` using a symmetric key stored only as an environment variable (`EMAIL_ENCRYPTION_KEY`) on the proxy service. Never exposed to the frontend.

## Email Proxy Service

### Tech Stack

- Node.js + TypeScript
- `imapflow` — IMAP client with IDLE support
- `nodemailer` — SMTP sending
- `mailparser` — parse MIME messages
- `@supabase/supabase-js` — verify JWTs, read credentials
- `ws` — WebSocket server
- `express` or `fastify` — REST endpoints

### Location

New workspace: `services/email-proxy/` in the monorepo. Deployed separately (Fly.io, Railway, or VPS).

### Connection Management

- When a user opens the email module, the frontend opens a WebSocket connection
- The service authenticates the JWT, fetches + decrypts Hostpoint credentials from Supabase, and opens an IMAP connection
- IMAP IDLE listens for new messages — pushed to the frontend via WebSocket
- Connections kept alive while WebSocket is open, torn down on disconnect
- Connection pool per user with idle timeout (5 min after WebSocket closes)

### REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/folders` | List all IMAP folders |
| GET | `/folders/:path/messages` | List messages (paginated, sort/filter) |
| GET | `/messages/:uid` | Fetch full message (headers, body, attachments) |
| GET | `/messages/:uid/attachments/:id` | Download attachment |
| POST | `/messages/send` | Compose and send via SMTP |
| POST | `/messages/reply` | Reply/reply-all |
| POST | `/messages/forward` | Forward with attachments |
| PUT | `/messages/:uid/move` | Move to folder (drag-and-drop) |
| PUT | `/messages/:uid/flags` | Mark read/unread/flagged |
| DELETE | `/messages/:uid` | Move to trash / permanent delete |
| POST | `/drafts` | Save draft |
| GET | `/contacts/suggest?q=` | Auto-complete from previously seen addresses |

### WebSocket Events (server → client)

- `newMessage` — new email arrived (via IMAP IDLE)
- `messageDeleted` — expunge event
- `flagsChanged` — read/unread change from another client

### Auth

Every REST request and WebSocket handshake includes the Supabase JWT in the `Authorization` header. The service verifies it against Supabase's JWT secret and checks that the user's mandator has `module_email` enabled.

## Vue Frontend — Email Module

### Composable

`web/src/composables/useEmail.ts`
- Manages WebSocket connection lifecycle
- REST API calls for all mail operations
- Reactive state: folders, messages, selected message, drafts
- Contact suggestion cache

### Views & Router

Main view: `web/src/views/EmailView.vue` — three-panel layout:

```
┌──────────┬────────────────────┬─────────────────────────┐
│ Folders  │ Message List       │ Message Detail / Compose │
│          │                    │                          │
│ Inbox(3) │ ▌From: Alice       │ From: Alice              │
│ Sent     │  Subject: Meeting  │ To: You                  │
│ Drafts   │  2 min ago         │ Subject: Meeting notes   │
│ Trash    │                    │                          │
│ ──────── │ ▌From: Bob         │ Hi, here are the notes   │
│ Custom1  │  Subject: Invoice  │ from yesterday's...      │
│ Custom2  │  1 hour ago        │                          │
│          │                    │ [attachment] notes.pdf    │
└──────────┴────────────────────┴─────────────────────────┘
```

Routes:
- `/email` — inbox view (default)
- `/email/:folder` — specific folder
- `/email/:folder/:uid` — specific message
- `/email/compose` — new email
- Route guard checks `module_email` enabled on mandator

### Components (all `Syvora`-prefixed)

| Component | Purpose |
|-----------|---------|
| `SyvoraEmailLayout.vue` | Three-panel layout with resizable panes |
| `SyvoraFolderList.vue` | Folder tree with unread counts, drag-drop targets |
| `SyvoraMessageList.vue` | Virtual-scrolled message list, sort, search, multi-select |
| `SyvoraMessageDetail.vue` | Renders email HTML safely (sandboxed iframe), shows attachments |
| `SyvoraComposeEmail.vue` | Rich text editor (tiptap), attachments, contact auto-complete, signature insertion |
| `SyvoraContactAutocomplete.vue` | Typeahead for To/Cc/Bcc fields |
| `SyvoraEmailSettings.vue` | User credentials + signature config page |
| `SyvoraEmailThreadView.vue` | Conversation/thread grouping by subject + references headers |

### Key Libraries

- **Rich text editor:** Tiptap (Vue 3 native, produces HTML suitable for email)
- **HTML email rendering:** Sandboxed `<iframe>` with `srcdoc` (prevents CSS/JS leaking into the app)
- **Drag and drop:** Native HTML5 drag API for moving messages between folders
- **Virtual scroll:** For large message lists (e.g., `vue-virtual-scroller`)

## Security

### Credential Storage

- Hostpoint passwords encrypted with `pgp_sym_encrypt()` using a symmetric key stored as env var (`EMAIL_ENCRYPTION_KEY`) on the proxy service only
- Encryption key never touches the frontend or Supabase client-side
- Decryption happens exclusively in the proxy service

### Transport Security

- Frontend <-> Proxy: HTTPS + WSS only
- Proxy <-> Hostpoint: TLS (IMAPS port 993, SMTPS port 465)
- No plaintext connections anywhere

### Authorization

- Every proxy request verified against Supabase JWT
- Proxy checks that the user's mandator has `module_email` enabled
- Users can only access their own IMAP connection (each connection uses that user's own Hostpoint credentials)

### HTML Email Sanitization

- Incoming HTML rendered in sandboxed iframe (`sandbox="allow-same-origin"` only — no scripts)
- Remote images blocked by default (privacy/tracking), user can opt-in per message
- No `javascript:` URLs, no inline event handlers

### Rate Limiting

- Per-user rate limits on send operations (60 emails/hour) to prevent abuse
- Attachment size limit aligned with Hostpoint's limits
