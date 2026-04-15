# Feature: Artist Press Kit

## Description

Extend the Artists module with a **Press Kit** tab available on the artist detail view. The press kit is a curated bundle of promotional assets — photos, videos, riders, stage plots, bios, logos, press quotes — that a label regularly needs to hand out to promoters, journalists, agencies, and venues. Managed artists (i.e. artists where `artists.is_managed = true`) typically have a continuously maintained press kit; unmanaged artists do not. The Press Kit tab is therefore only visible for managed artists, alongside the existing "Bookings" tab which follows the same gating rule.

Inside the Press Kit tab, users can:

- Upload arbitrary files (images, videos, PDFs, audio, ZIPs, …) — no hard format restriction.
- Organise those files into nested folders.
- Rename, move, and delete both files and folders.
- Generate a **public share link** that anyone with the URL can open without authentication. The public page lists the contents of the press kit in read-only form and offers a single action: **Download press kit as ZIP**. The ZIP contains the full folder tree and all files, mirroring the structure the user sees in the app.

Each artist owns exactly one press kit. There is no multi-kit concept per artist — instead, the folder tree inside the kit is the organisational unit. Share links are individually revocable and optionally time-boxed, so a label can hand out a link to one promoter today and another link to a journalist tomorrow without the two links being interchangeable.

The feature inherits the mandator isolation model of the `artists` table (which is already mandator-scoped) and does not introduce a new `module_press_kit` flag: if the Artists module is enabled and the artist is managed, the press kit is available. No separate admin toggle is needed.

## Deliverables

### Database — `artist_press_kit_folders` table

Stores the folder tree inside an artist's press kit. The root of the tree is implicit: folders with `parent_id IS NULL` are top-level folders at the root of the kit.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `artist_id` | UUID | NOT NULL, FK → `artists(id)` ON DELETE CASCADE |
| `parent_id` | UUID | FK → `artist_press_kit_folders(id)` ON DELETE CASCADE — NULL for root-level folders |
| `name` | TEXT | NOT NULL — display name of the folder (no slashes allowed) |
| `sort_order` | INTEGER | NOT NULL, DEFAULT `0` — optional manual ordering within a parent |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

Constraints:
- UNIQUE `(artist_id, parent_id, lower(name))` — sibling folder names are case-insensitively unique within the same parent.
- A CHECK constraint forbids `name` containing `/`, `\`, or only whitespace.
- A trigger (or CHECK via a recursive function) prevents cycles — a folder's `parent_id` chain must never reach back to itself.

RLS policies: authenticated users can SELECT, INSERT, UPDATE, DELETE rows where the referenced artist's mandator matches their profile's mandator (resolved via `artists.id → artists.mandator_id` — if `artists` is not yet mandator-scoped at the column level, use the existing access pattern that `useArtists` already relies on). The public share-link edge function reads via service role.

### Database — `artist_press_kit_files` table

Stores metadata for each uploaded file. The binary payload lives in Supabase Storage (see bucket below); this row is the record-of-truth for where it lives, who owns it, and how it appears in the UI.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `artist_id` | UUID | NOT NULL, FK → `artists(id)` ON DELETE CASCADE |
| `folder_id` | UUID | FK → `artist_press_kit_folders(id)` ON DELETE CASCADE — NULL for files at the root of the kit |
| `name` | TEXT | NOT NULL — display filename (may differ from the storage path) |
| `storage_path` | TEXT | NOT NULL, UNIQUE — full path inside the `press-kits` Storage bucket |
| `size_bytes` | BIGINT | NOT NULL — file size in bytes as reported by Storage on upload |
| `mime_type` | TEXT | — content type (e.g. `image/jpeg`, `video/mp4`, `application/pdf`) |
| `sort_order` | INTEGER | NOT NULL, DEFAULT `0` — optional manual ordering within a folder |
| `created_by` | UUID | FK → `auth.users(id)` |
| `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |
| `updated_at` | TIMESTAMPTZ | DEFAULT `now()`, with existing `set_updated_at` trigger |

Constraints:
- UNIQUE `(artist_id, folder_id, lower(name))` — sibling file names are case-insensitively unique within the same folder.
- A CHECK constraint forbids `name` containing `/` or `\`.

RLS policies: same mandator-scoped access as `artist_press_kit_folders`, resolved via `artist_id → artists.mandator_id`.

### Database — `artist_press_kit_share_links` table

One row per generated public share link. Each link is independently revocable and optionally expires. A single artist can have many active links at once (e.g. one per journalist).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | UUID | PK, default `gen_random_uuid()` |
| `artist_id` | UUID | NOT NULL, FK → `artists(id)` ON DELETE CASCADE |
| `public_token` | UUID | NOT NULL, UNIQUE, DEFAULT `gen_random_uuid()` — the token used to build the public URL |
| `label` | TEXT | — optional internal label so the user remembers what a link is for (e.g. "Groove Magazine", "EXIT Festival 2026") |
| `expires_at` | TIMESTAMPTZ | — if set, the link is rejected after this timestamp |
| `revoked_at` | TIMESTAMPTZ | — if set, the link is rejected regardless of `expires_at` |
| `download_count` | INTEGER | NOT NULL, DEFAULT `0` — incremented by the edge function on each successful ZIP download |
| `last_downloaded_at` | TIMESTAMPTZ | — updated by the edge function on each successful ZIP download |
| `created_by` | UUID | FK → `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

RLS policies: authenticated users can SELECT, INSERT, UPDATE (to set `revoked_at` / `label` / `expires_at`), DELETE rows where the artist's mandator matches their profile's mandator. The public edge function reads via service role and updates `download_count` / `last_downloaded_at` via service role.

### Supabase Storage — `press-kits` bucket

A new **private** Storage bucket named `press-kits` (public read disabled — access is always mediated either by an authenticated Supabase request or by the download edge function using service role). File paths follow the convention:

```
<artist_id>/<file_id>/<original-filename>
```

Using `<file_id>` as a path segment ensures two files named `photo.jpg` in different folders never collide at the Storage layer, while `storage_path` in the database remains the authoritative pointer.

Storage policies:
- Authenticated users with access to the artist's mandator can read, write, and delete objects under the prefix `<artist_id>/` for artists they are allowed to see.
- Public anonymous access to objects is denied — the public share page never surfaces direct Storage URLs; all download traffic goes through the `press-kit-download` edge function.

### Edge Function — `press-kit-download`

A Supabase Edge Function at `/functions/v1/press-kit-download` that serves the public share-link experience. It accepts only GET and reads data via the service role key.

- `GET /press-kit-download?token=<public_token>&mode=manifest` — returns JSON describing the kit:
  ```json
  {
    "artist": { "name": "…", "picture_url": "…" },
    "label": "Groove Magazine",
    "folders": [{ "id": "…", "parent_id": null, "name": "Photos" }, …],
    "files":   [{ "id": "…", "folder_id": "…", "name": "press-photo-01.jpg", "size_bytes": 4192832, "mime_type": "image/jpeg" }, …],
    "expires_at": "2026-05-01T00:00:00Z"
  }
  ```
  Used by the public view to render the read-only tree.
- `GET /press-kit-download?token=<public_token>&mode=zip` — streams back a `application/zip` response named `<artist-name>-press-kit.zip`. The ZIP mirrors the folder tree: each entry's path inside the archive is the full path from the root of the kit (e.g. `Photos/Live/press-photo-01.jpg`). Files at the root are placed at the top level of the archive. Empty folders are included as empty directory entries. On success, the function atomically increments `download_count` and sets `last_downloaded_at`.

Validation rules applied on every request:
- 404 if `public_token` does not exist.
- 410 (Gone) if the link is revoked (`revoked_at IS NOT NULL`) or past its expiry (`expires_at < now()`).
- The function never exposes the underlying Storage paths; it streams bytes directly.

The ZIP is streamed, not buffered, so large press kits (multi-GB video masters) do not blow up function memory. Use a streaming ZIP writer (e.g. `fflate`'s `Zip` class or similar) and pipe Storage object streams directly into it.

### Composable — `useArtistPressKit`

A new composable that encapsulates all press-kit operations. It is scoped per artist and takes the artist id as an argument on first use (following the pattern of `useArtists` sub-resources such as `fetchNotes(artistId)`).

- Exposes `folders` (ref array), `files` (ref array), `shareLinks` (ref array), `loading` (ref boolean).
- Provides `fetchPressKit(artistId)` — fetches all folders and files for the artist in parallel, plus share links.
- Provides `createFolder(artistId, { name, parent_id })`, `renameFolder(id, name)`, `moveFolder(id, new_parent_id)`, `deleteFolder(id)` — deleting a folder cascades to its descendants and their files via ON DELETE CASCADE; the composable also removes the corresponding Storage objects (see deletion note below).
- Provides `uploadFile(artistId, file: File, { folder_id })` — uploads the binary to `press-kits/<artist_id>/<file_id>/<filename>`, inserts the metadata row, and appends to `files`. Reports progress via a returned object that includes a progress ref so the UI can render a progress bar. Large uploads (>100 MB) use Supabase's resumable upload API.
- Provides `renameFile(id, name)`, `moveFile(id, new_folder_id)`, `deleteFile(id)`. `deleteFile` removes the Storage object as well as the row; a trigger (or application-level cleanup) ensures an orphan row whose Storage object is missing is still safely handled.
- Provides `getDownloadUrl(fileId)` — returns a short-lived signed URL (default 5 minutes) for the authenticated user to preview/download a single file from within the ERP. Signed URLs are generated via `supabase.storage.createSignedUrl` and are never persisted.
- Provides `createShareLink(artistId, { label?, expires_at? })`, `revokeShareLink(id)`, `deleteShareLink(id)`, `updateShareLink(id, { label?, expires_at? })`.
- Provides `getPublicShareUrl(link)` — returns `<app-origin>/press-kit/<public_token>` for display and copy-to-clipboard.

Deletion note: when a folder is deleted the database cascades to descendant folders and files. The composable must also remove the Storage objects. Implementation: before issuing the folder DELETE, the composable lists all descendant `storage_path` values via a recursive CTE (or a Postgres function `press_kit_collect_storage_paths(folder_id uuid)`) and then calls `supabase.storage.from('press-kits').remove(paths)`.

### View — `ArtistDetailView.vue` extension

Extend the existing artist detail view at `web/src/views/ArtistDetailView.vue`:

- Add a new tab `press-kit` to the `tabs` computed list, gated with `v-if="artist.is_managed"` — same pattern the `Bookings` tab already follows. The tab label is "Press Kit" and the count is `files.value.length` (files only, not folders).
- When `activeTab === 'press-kit'`, render a new `<ArtistPressKitPanel />` component receiving the `artistId`.

Keep the existing tab order; insert "Press Kit" directly after "Bookings" and before "Notes":

```
Shows → Bookings (managed only) → Press Kit (managed only) → Notes → Contracts (if module enabled)
```

### Component — `ArtistPressKitPanel.vue`

A new component in `web/src/components/` (not in `@syvora/ui`, since it is feature-specific). Responsibilities:

- **Breadcrumb navigation**: the header shows the current folder path (e.g. `Press Kit / Photos / Live`). Clicking any segment navigates up the tree. Navigation state is held locally in the component (a `currentFolderId` ref, `null` for the root).
- **Folder + file grid**: lists the contents of `currentFolderId`. Folders appear first, then files. Each entry shows:
  - For folders: folder icon, name, and a count of immediate children.
  - For files: a type-appropriate thumbnail (image thumbnail for `image/*`, video poster frame if available for `video/*`, generic icon for the rest), the filename, the human-readable size (`1.4 MB`), and the upload timestamp.
- **Primary actions** (in a toolbar at the top of the panel):
  - **Upload files** — opens a native file picker with `multiple` enabled, accepting all formats (`accept="*/*"`). Files are uploaded into `currentFolderId`. A progress list is rendered below the toolbar while uploads are in flight; each row shows the filename, progress bar, and a cancel button.
  - **New folder** — opens a small inline prompt (or `SyvoraModal` for consistency) asking for the folder name, then creates it under `currentFolderId`.
  - **Share** — opens a modal listing all existing share links for this artist with their label, expiry, revoked state, download count, and a "Copy link" button per row; plus a form at the top to create a new link (optional label, optional expiry date). Links can be revoked (soft) or deleted (hard) from this modal.
- **Per-entry actions** (context menu or row-hover buttons):
  - Folders: Rename, Move to…, Delete (with confirm).
  - Files: Download (opens signed URL in a new tab), Rename, Move to…, Delete (with confirm).
- **Drag-and-drop**:
  - Dropping files from the OS onto the panel uploads them into `currentFolderId`.
  - Dragging a file row onto a folder row moves the file into that folder.
  - Dragging a folder row onto another folder row moves that folder (with cycle prevention — the UI blocks drops that would make a folder a descendant of itself).
- **Image and video preview**: clicking an image or video file opens a lightweight lightbox overlay (image preview or `<video>` element with controls) using a signed URL. Other file types trigger a direct download.
- **Empty state**: when the kit is empty, show an `SyvoraEmptyState` with an inline "Upload your first file" CTA and a short paragraph explaining what the press kit is used for.

The component uses the existing design system: `SyvoraButton`, `SyvoraModal`, `SyvoraInput`, `SyvoraEmptyState`, `SyvoraBadge`, and icons from the existing icon set. No new UI primitives are introduced.

### View — `PressKitPublicView.vue` (public)

A publicly accessible view rendered for unauthenticated users at `/press-kit/:token`. Responsibilities:

- On mount, calls the `press-kit-download` edge function in `mode=manifest` to fetch the tree and artist metadata.
- Renders:
  - **Header**: the artist's picture (if set), artist name, optional share-link label ("Shared for: Groove Magazine"), and the kit's total size.
  - **Tree view**: a read-only, collapsible folder tree with file counts and sizes. No per-file download or preview — individual files are not linkable from the public page, deliberately, so the only access mode is the full ZIP.
  - **Primary CTA**: a large **Download press kit (.zip)** button. Clicking it navigates the browser to the edge function in `mode=zip`, which triggers the ZIP stream download. While the download starts, a subtle progress indicator is shown (the button enters a loading state until the first byte arrives).
  - **Expiry notice**: if the link has an `expires_at`, the page displays "This link expires on <date>" near the download button.
- Error states:
  - 404 (invalid token) renders a "Press kit not found" message with no further detail.
  - 410 (revoked / expired) renders a "This share link is no longer active" message.
- The page uses the same public-page design language as `ContractSignView.vue` (dark/brand header, minimal chrome). No authenticated navigation chrome is rendered.

### Router

In `web/src/router/index.ts`, add a public route:

```ts
{ path: '/press-kit/:token', name: 'press-kit-public', component: PressKitPublicView, meta: { requiresAuth: false } }
```

The existing `beforeEach` guard already skips auth for `meta.requiresAuth === false` (added during the Contracts feature); no guard changes needed.

### Sensible defaults and edge cases

- **File-size limits**: the Storage bucket is configured with a per-object limit of 5 GB (Supabase default for free/pro tiers is lower; the admin should set this explicitly in the bucket settings via migration if higher is needed). The UI rejects uploads above the limit with a clear error before the upload begins.
- **Duplicate names on upload**: when a file with the same name already exists in the target folder, the upload is auto-renamed with a `(2)`, `(3)`, … suffix (following common file-manager behaviour). This avoids blocking the user with a modal during bulk drag-and-drop.
- **Video thumbnails**: generating a poster frame server-side is out of scope for this feature. The UI falls back to a generic video icon; poster-frame generation can be added later via a Storage trigger without schema changes.
- **Concurrent edits**: two users renaming the same folder at the same time is resolved by last-write-wins via `updated_at`. No locking.
- **ZIP structure**: the archive always begins at the root of the kit (no leading `<artist-name>/` prefix), so extracting it somewhere already named after the artist produces a clean layout. The archive filename is `<slugified-artist-name>-press-kit.zip`.

## Definition of Done

- The `artist_press_kit_folders`, `artist_press_kit_files`, and `artist_press_kit_share_links` tables exist with the specified schemas, UNIQUE constraints, CHECK constraints, cycle prevention, RLS policies, and the `set_updated_at` trigger.
- The `press-kits` Supabase Storage bucket exists with public access disabled and authenticated-write policies scoped to the artist's mandator.
- The `press-kit-download` edge function is deployed and handles both `mode=manifest` and `mode=zip`, correctly returning 404 / 410 for invalid, revoked, or expired tokens, and streams ZIPs without buffering the whole archive in memory.
- Each successful ZIP download increments `download_count` and updates `last_downloaded_at` on the share link.
- The `useArtistPressKit` composable provides reactive state and full CRUD for folders, files, and share links, plus signed-URL generation for authenticated file previews.
- The "Press Kit" tab appears on the artist detail view **only** when `artist.is_managed === true`, following the same gating rule as the existing "Bookings" tab.
- The `ArtistPressKitPanel` supports folder creation, nested navigation via breadcrumb, file upload (including multi-select and drag-and-drop from the OS), in-panel drag-and-drop to move entries, rename, move-to, and delete — for both files and folders.
- Deleting a folder removes all descendant folders, files, and their Storage objects without orphaning Storage data.
- The share-link modal allows creating labelled links, setting optional expiries, copying the URL, revoking, and deleting. Revocation is reflected immediately on the public page.
- The public `/press-kit/:token` route is accessible without authentication, does not trigger auth guards, and renders the manifest plus a single "Download press kit (.zip)" action.
- The public page never exposes direct Storage URLs or per-file download endpoints.
- Image and video files are previewable inline in the authenticated panel via a lightbox; other file types trigger a direct signed-URL download.
- The ZIP produced by the edge function faithfully mirrors the folder tree, preserves original filenames, and is correctly named `<slugified-artist-name>-press-kit.zip`.
- Uploads above the configured per-object size limit are rejected client-side with a clear error message before any bytes are sent.
- Existing artist records require no migration: the feature is additive and managed artists with no press-kit rows simply see an empty state on the new tab.
