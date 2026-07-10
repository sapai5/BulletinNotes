# Bulletin Board Notes — Handoff Document

_Last updated: 2026-07-09_

This document is a complete, in-depth handoff for the **Bulletin Board Notes**
app: what it is, how it's built, every feature, the data/security model, the
full history of work done this session, known issues, and how to run/deploy/
extend it.

---

## 1. What the app is

An **installable PWA** where users create bulletin boards and pin **freeform,
draggable, resizable sticky notes** to them. Boards can be shared with other
people by email; a friends system with online presence and live "shadow"
collaboration (you can see what others are doing on a shared board in real
time) sits on top.

- **Repo:** `https://github.com/sapai5/BulletinNotes` (branch `main`)
- **Local path:** `~/BulletinBoardNotes`
- **Live URL (Vercel):** a `*.vercel.app` deployment (see §9)
- **Supabase project ref:** `iaxhypnmgqebzmahkskn`

### Core requirements (from the original brief)
- Persistent data → Supabase (Postgres).
- Installable app → PWA (chosen over native for a fully-free solution).
- Unlimited boards, each holding its own notes.
- Auth required; you can see notes others posted on shared boards.
- Invite/share model, notes with images/colors/tags, freeform movement.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 (custom cartoonish theme) |
| Icons | `lucide-react` |
| Fonts | Fredoka (display) + Nunito (body) via Google Fonts |
| PWA | `vite-plugin-pwa` (Workbox service worker + manifest) |
| Backend | Supabase: Postgres, Auth, Storage, Realtime |
| Routing | `react-router-dom` 6 |
| Image crop | `react-easy-crop` |
| HEIC convert | `heic-to` (lazy-loaded) |
| Hosting | Vercel (static SPA) |

**Why PWA, not native:** the user wanted a fully-free solution. A PWA installs
to the home screen / desktop, works cross-platform, and costs nothing to host.
Native App Store distribution requires paid developer accounts.

---

## 3. Running locally

```bash
cd ~/BulletinBoardNotes
npm install
cp .env.example .env        # then fill in the two values below
npm run dev                 # http://localhost:5173
```

`.env` (already present locally, gitignored):
```
VITE_SUPABASE_URL=https://iaxhypnmgqebzmahkskn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # publishable/anon key ONLY
```

> **Never** put the Supabase **secret** key in this client app — it bypasses
> all row-level security and would ship in the browser bundle. The publishable
> (anon) key is safe because access is enforced by RLS.

Scripts:
- `npm run dev` — dev server
- `npm run build` — type-check (`tsc -b`) + production build to `dist/`
- `npm run preview` — serve the built app (needed to exercise the PWA/service worker)
- `npm run typecheck` — types only

To test the PWA install or service worker you must `build` + `preview` (or
deploy); the dev server doesn't register the SW.

---

## 4. Supabase setup (backend)

All backend objects are defined in SQL. **Run these in the Supabase SQL Editor.**

1. **`supabase/schema.sql`** — the full canonical schema. Safe to re-run. Creates:
   - Tables: `profiles`, `boards`, `board_members`, `notes`, `friendships`
   - A trigger that auto-creates a `profiles` row on user signup
   - An `updated_at` trigger on `notes`
   - `SECURITY DEFINER` helper functions: `is_board_member`, `is_board_owner`
   - RPCs: `create_board`, `invite_member_by_email`, `send_friend_request_by_email`
   - Row-Level Security policies for every table
   - Storage buckets: `note-images`, `avatars` (both public-read, member/owner-restricted write)
   - Realtime publication for `notes`, `board_members`, `friendships`
2. **`supabase/002_friends_and_profiles.sql`** — an incremental migration that
   adds only the friends/avatars pieces. Use this if a database was created
   from an earlier version of `schema.sql`. (Re-running the full schema also works.)
3. **`supabase/003_drawing_notes.sql`** — adds the `kind` + `strokes` columns to
   `notes` for the drawing/whiteboard feature. Run on databases created before
   drawings existed. (Re-running the full schema also works for fresh setups.)

### Auth configuration (Supabase dashboard)
- **Email**: enabled by default. For quick testing you can disable "Confirm email".
- **Google OAuth** (optional, supported by the UI):
  - Google Cloud Console → OAuth client (Web), Authorized redirect URI =
    `https://iaxhypnmgqebzmahkskn.supabase.co/auth/v1/callback`, Authorized
    JavaScript origins = your app URLs.
  - Paste Client ID/Secret into Supabase → Authentication → Providers → Google.
- **URL Configuration** (critical for redirects to work):
  - **Site URL**: a single clean origin, e.g. `https://<your-app>.vercel.app`
    (no trailing slash, no wildcard, no path — a malformed value causes
    `site url is improperly formatted`).
  - **Redirect URLs**: add `https://<your-app>.vercel.app/**` and
    `http://localhost:5173/**` (wildcards belong here, not in Site URL).

---

## 5. Data model

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Mirror of `auth.users`; holds the public username + avatar | `id` (=auth uid), `email`, `display_name`, `avatar_url` |
| `boards` | A bulletin board | `id`, `name`, `owner_id`, `created_at` |
| `board_members` | Access + role per board | `board_id`, `user_id`, `role` (`owner`/`editor`), PK `(board_id,user_id)` |
| `notes` | A sticky note **or** a drawing (mini-whiteboard) | `id`, `board_id`, `author_id`, `text`, `color`, `tags[]`, `image_url`, `kind` (`note`/`drawing`), `strokes` (jsonb), `x`, `y`, `width`, `height`, `z_index`, timestamps |
| `friendships` | Friend links | `id`, `requester_id`, `addressee_id`, `status` (`pending`/`accepted`), unique + self-check |

Notes live in a fixed **logical canvas of 3000×2000** (`CANVAS_W`/`CANVAS_H` in
`useBoardView.ts`); `x`/`y` are within that space.

### Security model (RLS)
- **Boards** are visible only to the owner and invited members.
- **Notes** are readable by any board member; only the **author** can edit;
  the author **or the board owner** can delete.
- **Invites** and **friend requests** go through `SECURITY DEFINER` RPCs so the
  client never needs broad read access to everyone's email. Only a board owner
  can invite; friend requests auto-accept a reciprocal pending request.
- **Profiles** are readable for yourself, people who share a board with you, and
  your friends (any status).
- **RLS recursion** between `boards` and `board_members` is avoided using the
  `is_board_member` / `is_board_owner` definer functions.
- **Storage**: `note-images` writes are restricted to members of the board
  named by the object's folder (`<board_id>/...`); `avatars` writes are
  restricted to the user's own folder (`<user_id>/...`). Both buckets are
  **public-read** (a known privacy trade-off — see §11).

> **PostgREST gotcha (important for future queries):** `board_members` and
> `friendships` have no direct FK to `profiles` (both FK to `auth.users`), so
> you **cannot** embed `profiles(...)` from them. Fetch the ids, then query
> `profiles` with `.in('id', ids)` and join client-side. This bit us twice
> (author names showing "Someone", empty member lists).

---

## 6. Frontend architecture

```
src/
  main.tsx                 # Entry: Router > UIProvider > AuthProvider > App
  App.tsx                  # Auth gate; wraps authed routes in Profile + Presence providers; routes
  types.ts                 # Shared types (Profile, Board, Note, Friendship, GhostActivity, ...)
  vite-env.d.ts            # Vite/PWA + env typings

  lib/
    supabase.ts            # Supabase client + bucket name constants
    imageUpload.ts         # prepareImageForUpload() (HEIC→JPEG) + errorMessage()

  context/
    AuthContext.tsx        # Session + signIn/signUp (email + Google) + signOut
    ProfileContext.tsx     # Current user's profile (username/avatar) + refresh()
    PresenceContext.tsx    # Global "online-users" realtime channel → onlineIds
    UIContext.tsx          # In-app confirm() modal + toast() notifications (no native dialogs)

  hooks/
    useBoardCollab.ts      # Per-board realtime: viewer presence + live "shadow" activity broadcast
    useBoardView.ts        # Unified pan/zoom/note-drag gesture engine (see §7) + view persistence

  pages/
    AuthPage.tsx           # Sign in / sign up
    BoardsPage.tsx         # List/create/delete/leave boards
    BoardPage.tsx          # The canvas: notes, ghosts, toolbar, zoom controls, members
    ProfilePage.tsx        # Edit username + upload/crop avatar
    FriendsPage.tsx        # Add by email, requests in/out, friends w/ online status

  components/
    AppHeader.tsx          # Nav (Boards/Friends) + profile avatar link + sign out
    Avatar.tsx             # Picture or initial fallback, optional online dot, onError fallback
    AvatarCropper.tsx      # react-easy-crop modal → square JPEG via canvas
    NoteCard.tsx           # A sticky note (render + mouse drag + resize + edit + color/img/tags)
    GhostNote.tsx          # Translucent live shadow of another user's note-in-progress
    MembersDialog.tsx      # Board roster + invite by email
    Spinner.tsx
```

### Providers / state flow
- `UIProvider` (outermost) — exposes `useUI()` → `confirm(opts): Promise<boolean>`
  and `toast(message, kind)`. All confirmations/alerts are in-app popups.
- `AuthProvider` — Supabase session; `useAuth()`.
- `ProfileProvider` (authed only) — current user's `profiles` row + `refresh()`.
- `PresenceProvider` (authed only) — joins one global `online-users` presence
  channel; `usePresence().isOnline(userId)`.

### Realtime (three mechanisms)
1. **Global presence** (`PresenceContext`) — who is online (Friends tab dots).
2. **Board presence** (`useBoardCollab`) — who is currently viewing a board
   (avatar stack in the toolbar).
3. **Live shadows** (`useBoardCollab` broadcast) — while someone types/moves/
   resizes a note, an ephemeral `activity` event is broadcast (throttled ~55ms);
   other viewers render a translucent `GhostNote` with the person's name. Not
   persisted; a missed "end" event expires after 5s.
4. Plus **Postgres changes** on `notes`/`board_members` (in `BoardPage`) for
   durable sync of created/updated/deleted notes; optimistic + de-duped by id.

---

## 7. The gesture engine (`useBoardView.ts`) — read this before touching pan/zoom

This is the most iterated-on and subtle part of the app. It went through several
designs; the **current** one is a single **transform-based unified pointer
manager** and is the source of truth for all board navigation and touch note
dragging.

### Model
- The canvas is a fixed 3000×2000 **surface** rendered with a CSS transform:
  `translate(tx, ty) scale(s)`, `transform-origin: 0 0`. The container has
  `overflow: hidden` and `touch-action: none`.
- `scale`, `tx`, `ty` are the whole view state; persisted per board in
  `localStorage` under `bb-view-<boardId>` (debounced), restored on return.
- **First open** → `fitToView()` centers the whole board.

### Why transform-based (not native scroll)
Native scroll can't position content smaller than the viewport, so focal-point
zoom is impossible when zoomed out (it grows from a corner). A translate+scale
transform lets us **anchor zoom to the exact pointer/finger at any scale**.

### Focal zoom math
For a screen focal point `f` and scales `s0 → s1`:
`t1 = f - (f - t0) / s0 * s1` (per axis). Keeps the canvas point under the
cursor/pinch-midpoint fixed.

### Unified gesture rules (single source of truth)
All pointer events are handled by the **container** (not individual notes):
- **1 pointer, drag anywhere → pan** (over empty space, your notes, others'
  notes — no dead zones).
- **2 pointers → always pinch-zoom + pan** by the midpoint.
- **1 touch pointer, long-press (260ms) on your own editable note → pick it up
  and drag** it. Moving before the hold completes = pan instead.
- Edge **auto-pan** while dragging a note (ramped, capped ~9px/frame, diagonal);
  note position is clamped within the canvas so it can't fly off.
- `[data-no-drag]` elements (note controls, resize handle) are ignored by the
  manager so buttons/inputs work.
- `clampView` keeps the board from being lost (margin-based) but allows **free
  panning in both axes** at any zoom (it does NOT force-center except in
  `fitToView`).

### Coordination with notes
- Notes expose geometry via data attributes read at pickup:
  `data-note-id`, `data-note-editable`, `data-nx`, `data-ny`, `data-nw`, `data-nh`.
- The hook takes a `NoteDragApi` (`onNoteDragStart/Move/End`). `BoardPage` wires
  these to update local note state live (`patchLocal`), emit throttled activity,
  set the lifted note id, and persist the final position on release.
- **Desktop mouse** note-dragging is still handled locally inside `NoteCard`
  (the manager ignores mouse-down on an editable note); touch is owned by the
  manager. `NoteCard` shows the lift animation via its `isDragging` prop.

### Pan listeners
Attached to `window` on pointerdown and removed when the last pointer lifts.
**No `setPointerCapture`** — an earlier version used it and it conflicted with
the note's implicit touch capture, which locked panning after moving a note.

---

## 8. Feature inventory

- **Auth**: email/password + Google OAuth (choice on the sign-in screen).
- **Boards**: create unlimited; owner can delete; members can leave; role badges.
- **Notes**: freeform position, resize (corner handle), color palette, `#tags`,
  image upload (HEIC auto-converted to JPEG), text editing, per-note author name,
  tape + hand-pinned tilt styling, z-order bring-to-front.
- **Drawings (mini-whiteboard)**: a second item kind. Freeform draw with mouse
  (PC), finger, or Apple Pencil (mobile) via pointer events. Pen color palette,
  undo last stroke, clear. Strokes are stored **normalized (0..1)** in
  `notes.strokes` (jsonb) so they scale with resize/zoom, and sync to other
  viewers on stroke-end via the notes realtime channel. Component:
  `src/components/DrawingCanvas.tsx`. Created via the **Draw** toolbar button.
- **Sharing**: invite members by email (owner only) via RPC.
- **Friends**: add by email, incoming/outgoing requests (accept/decline/cancel),
  friends list sorted by online status, live-updating via realtime.
- **Presence**: global online status; per-board viewer avatars.
- **Live shadows**: real-time ghost of others' in-progress notes.
- **Profile**: username (shown everywhere) + avatar with interactive crop
  (pan/zoom, circular).
- **Pan/zoom**: pinch (trackpad ctrl-wheel + mobile two-finger), fit-on-first-open,
  restore-last-view, toolbar zoom controls.
- **PWA**: installable, offline app shell, Apple touch icon + iOS standalone meta.
- **UI**: cartoonish pastel theme, Fredoka/Nunito fonts, chunky "pop" shadows,
  corkboard canvas, custom SVG cursors (arrow + pushpin), in-app confirm/toast
  popups (no native browser dialogs), custom generated PWA icons
  (`scripts/gen_icons.py`, stdlib-only PNG generator).

---

## 9. Deployment (Vercel)

- Framework preset **Vite**, build `npm run build`, output `dist`.
- Env vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **`vercel.json`** provides the SPA rewrite (`/(.*) → /index.html`) so deep
  links like `/boards/:id` and `/friends` work, plus SW/manifest headers.
- Every push to `main` auto-deploys.
- After deploying, set the Supabase **Site URL / Redirect URLs** to the
  production domain (see §4). Use the **stable** production domain (Vercel →
  Settings → Domains), not per-deploy hashed URLs.
- If a visitor sees a Vercel login wall: Vercel → Settings → **Deployment
  Protection** → set to "Only Preview Deployments" (or off) so production is public.

### Install on iPhone
Open the production URL in **Safari** → Share → **Add to Home Screen** → keep
**"Open as Web App"** on (full-screen, own storage). Re-add if you installed
before the icon meta was deployed.

---

## 10. Session work log (chronological)

Build order and notable fixes (commit subjects in `git log`):

1. **Initial PWA + Supabase backend** (`93b8969`) — scaffold, schema, auth,
   boards, notes canvas, invite, realtime, README, generated icons.
2. **UI overhaul + bug fixes** (`f3debfe`) — cartoonish redesign, `lucide-react`
   icons (removed all emoji), resizable notes, profiles/friends/presence/live
   shadows, HEIC image conversion, in-app confirm/toast popups, author-name and
   board-duplication fixes.
3. **Vercel build fix** (`5fa7439`) — the pulled Python `.gitignore` ignored
   `lib/`, which excluded `src/lib/` from Git; anchored to `/lib/` and committed
   the missing Supabase client. Added `vercel.json`.
4. **iOS install polish** (`47aab01`) — Apple touch icon + standalone meta.
5. **Custom cursors** (`04101a4`, `51d6c2a`, `1806fb4`) — SVG arrow + pushpin;
   percent-encoded and ≤32px so browsers render them; applied consistently
   (notes, drag, disabled buttons) via CSS variables.
6. **Avatar cropping** (`bbd7635`) — `react-easy-crop` modal → square JPEG.
7. **Pan/zoom** (`5d947bc`) — initial native-scroll-based zoom + fit + persist.
8. **Mobile layout** (`9a71657`) — pin board to viewport, stop page overscroll,
   wrap toolbar buttons.
9. **Transform-based zoom** (`27cd4fc`) — pointer-anchored focal zoom (fixed the
   "always centered" anchor + cut-off notes).
10. **Mobile long-press note move + edge auto-pan** (`43cfab0`).
11. **Pan/auto-pan tuning** (`c1c1c60`) — free panning at all zooms; tamed the
    "note rockets off" auto-pan.
12. **Pan-lock attempts** (`b94d58c`, `1500cee`, reverted `e0362c0`).
13. **Unified gesture engine** (`60cc599`) — the current design in §7; fixed
    pan/zoom over notes, dead zones, and pan lock-ups by making the board own all
    gestures.

**Current HEAD:** `60cc599`. As of writing there are **unpushed commits** on
`main` — run `git push` to deploy them.

---

## 11. Known issues / caveats / risks

- **Storage buckets are public-read.** Anyone with a note-image or avatar URL can
  view it (uploads are access-controlled, reads are not). Fine for this app; if
  privacy is needed, switch to private buckets + signed URLs.
- **Presence exposes online status** to any signed-in user (only friends are
  surfaced in the UI). Acceptable trade-off; documented.
- **Live-shadow / activity payloads are client-trusted** (name/text in the
  broadcast could be spoofed by a malicious client). Durable data is still
  RLS-protected on write; only the ephemeral ghost could be faked.
- **Mobile gestures could not be verified in the dev environment** (no
  touchscreen). The unified engine (§7) is the sound design, but on-device
  testing is still the real confirmation — see §12.
- **PostgREST profile-embed limitation** — see the gotcha box in §5.
- **`heic-to` is a ~2 MB WASM chunk** — intentionally excluded from PWA precache
  (`workbox.globIgnores` in `vite.config.ts`) and lazy-loaded only when a HEIC
  file is picked.
- **The Python-derived `.gitignore`** is still in the repo. It's been patched
  (`/lib/` anchored), but be wary if adding new top-level dirs that collide with
  Python patterns (e.g. `build/`, `dist/`).

---

## 12. Suggested on-device test checklist (mobile)

1. Pan by dragging over notes, non-editable notes, and empty space — all should pan.
2. Two fingers → pinch-zoom + pan, even starting on notes.
3. Long-press your own note → it lifts (ring + scale + haptic) → drag it → release.
4. After moving a note, pan again → should still work (regression that was fixed).
5. Drag a note toward a screen edge → board auto-pans; note doesn't fly off.
6. Leave the board and return → same zoom + position restored.
7. First-ever open of a board → whole board fits/centers.
8. Tap a note body → edit text; tap a control → it acts (not a drag).

---

## 13. Ideas / next steps (not implemented)

- Private storage buckets + signed URLs for images/avatars.
- Note ordering/locking, multi-select, delete confirm bulk.
- Board-level roles beyond owner/editor (viewers).
- Server-side validation of activity broadcasts (or drop untrusted fields).
- Offline note editing queue (currently the app shell is cached, data is online).
- Real native wrapper (Capacitor/PWABuilder) if App Store distribution is ever wanted.
- Tests: there is currently no automated test suite; consider Vitest +
  React Testing Library for components and a Playwright pass for gestures.

---

## 14. Quick reference

| Thing | Where |
|---|---|
| Supabase client | `src/lib/supabase.ts` |
| DB schema | `supabase/schema.sql` |
| Gesture/zoom engine | `src/hooks/useBoardView.ts` |
| Realtime collab | `src/hooks/useBoardCollab.ts` |
| Board canvas | `src/pages/BoardPage.tsx` |
| Note component | `src/components/NoteCard.tsx` |
| In-app popups | `src/context/UIContext.tsx` |
| Icon generator | `scripts/gen_icons.py` |
| PWA/manifest config | `vite.config.ts` |
| SPA routing (Vercel) | `vercel.json` |
