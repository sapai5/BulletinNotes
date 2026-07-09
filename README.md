# 📌 Bulletin Board Notes

An installable PWA where you create bulletin boards and pin freeform sticky
notes to them. Invite people by email to share a board — everyone sees each
other's notes update live. Built with **React + Vite + TypeScript + Tailwind**,
backed by **Supabase** (Postgres, Auth, Storage, Realtime).

## Features

- 🔐 **Sign in** with Google **or** email + password (your choice)
- 🗂️ Create **unlimited boards**, each with its own notes
- ✉️ **Invite members by email**; share a board with anyone who has signed up
- 📝 **Freeform draggable + resizable notes** you can place anywhere on a large canvas
- 🎨 Per-note **color picker**, **#tags**, and **image uploads**
- 👤 **Profile page** — set a username (shown to everyone) and upload a profile picture
- 🧑‍🤝‍🧑 **Friends tab** — add friends by email, accept/decline requests, and see who's **online right now**
- 👀 **Live "shadows"** — on a shared board you see a real-time ghost of what others are typing / moving / resizing, plus avatars of who's viewing
- ⚡ **Realtime sync** — notes others add/move/edit appear instantly
- 📲 **Installable** to your desktop/phone home screen (PWA)
- 🛡️ **Row-Level Security**: you only see boards you own or were invited to; only a note's author can edit it

---

## 1. Prerequisites

- **Node.js 18+** (built and tested on Node 24)
- A free **[Supabase](https://supabase.com)** account

## 2. Create your Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. The free tier is enough.
2. Once it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

## 3. Set up the database

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and click **Run**.

This creates all tables (`profiles`, `boards`, `board_members`, `notes`,
`friendships`), the Row-Level Security policies, the `note-images` and
`avatars` storage buckets, the invite / friend-request RPCs, and enables
Realtime. It's safe to re-run if you change something.

> **Already ran an older `schema.sql`?** If you set the app up before the
> profiles/friends update, just run [`supabase/002_friends_and_profiles.sql`](./supabase/002_friends_and_profiles.sql)
> to add the `avatars` bucket, the `friendships` table, and the friend RPC.
> (Re-running the full `schema.sql` also works.)

## 4. Configure authentication

In the dashboard under **Authentication → Providers**:

- **Email**: enabled by default. For quick local testing you can turn *off*
  "Confirm email" (**Authentication → Providers → Email**) so new sign-ups log
  in immediately. Leave it on for production.
- **Google** (optional but supported by the UI):
  1. Create OAuth credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth client ID, type *Web application*).
  2. Add the Supabase callback URL shown in the dashboard (looks like
     `https://<your-ref>.supabase.co/auth/v1/callback`) as an **Authorized redirect URI**.
  3. Paste the Google **Client ID** and **Client Secret** into Supabase →
     **Authentication → Providers → Google** and enable it.

Under **Authentication → URL Configuration**, set the **Site URL** to your app's
URL (`http://localhost:5173` for local dev, and your deployed URL for prod). Add
both to **Redirect URLs** if you use Google sign-in.

## 5. Configure the app

```bash
cp .env.example .env
```

Edit `.env` and fill in the two values from step 2:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

> The anon key is safe to expose in a client app — all access is enforced by
> Row-Level Security in the database.

## 6. Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, sign up, create a board, and start pinning notes.

---

## Installing as an app (PWA)

Run a production build and serve it (service workers only run on a built app):

```bash
npm run build
npm run preview
```

Then in a supported browser (Chrome/Edge/Safari):

- **Desktop**: click the install icon in the address bar, or browser menu → *Install Bulletin Board Notes*.
- **iOS Safari**: Share → *Add to Home Screen*.
- **Android Chrome**: menu → *Install app*.

## Deploying (free options)

Any static host works since this is a client-only SPA. The `dist/` folder is the
build output.

**Vercel / Netlify / Cloudflare Pages:**

1. Push this folder to a Git repo and import it, or use their CLI.
2. Build command: `npm run build` — Output directory: `dist`.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **SPA routing**: configure a catch-all rewrite to `/index.html` so deep links
   like `/boards/:id` work:
   - **Netlify** — add a `_redirects` file with: `/*  /index.html  200`
   - **Vercel** — add a rewrite in `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
   - **Cloudflare Pages** — SPA fallback is handled automatically for `dist`.
5. After deploying, update Supabase **Authentication → URL Configuration** with
   your production URL.

---

## How it works

### Data model

| Table | Purpose |
|---|---|
| `profiles` | Mirrors `auth.users` (auto-populated by a trigger). Holds your username (`display_name`) and `avatar_url`. |
| `boards` | A bulletin board owned by one user. |
| `board_members` | Who can access a board and their role (`owner` / `editor`). |
| `notes` | A sticky note: text, color, tags, image URL, position (`x`,`y`), size, and `z_index`. |
| `friendships` | Friend links between users (`pending` → `accepted`). |

### Security model

- **Boards** are visible only to their owner and invited members.
- **Notes** are readable by any board member, but only the **author** can edit
  them; the author or the **board owner** can delete them.
- **Invites** go through a `SECURITY DEFINER` RPC (`invite_member_by_email`) so
  the app never needs broad read access to everyone's email address. Only a
  board **owner** can invite.
- **Storage**: note images live in the public `note-images` bucket under a
  `<board_id>/` folder; upload/replace/delete is restricted to members of that
  board via storage policies.

### Realtime

`BoardPage` opens a Supabase Realtime channel filtered to the current board and
listens for `INSERT`/`UPDATE`/`DELETE` on `notes` (and membership changes), so
collaborators see changes without refreshing. Local edits are applied
optimistically and de-duplicated by note `id`.

On top of that, three realtime mechanisms power presence and live collaboration:

- **Global presence** (`PresenceProvider`) — every signed-in client joins one
  `online-users` channel and tracks itself, so the Friends tab can show who is
  online.
- **Board presence** (`useBoardCollab`) — a per-board `board-collab-<id>`
  channel tracks who is currently *viewing* the board (the avatar stack in the
  toolbar).
- **Live "shadows"** — the same board channel *broadcasts* ephemeral `activity`
  events while you type, drag, or resize a note (throttled). Other viewers
  render a translucent `GhostNote` with your name and live content. Nothing is
  persisted until you finish; missed "end" events expire after 5s.

## Project structure

```
supabase/schema.sql                    # Full setup — run this in Supabase SQL editor
supabase/002_friends_and_profiles.sql  # Incremental migration (avatars + friends)
scripts/gen_icons.py                   # Regenerates the PWA PNG icons (stdlib only)
src/
  lib/supabase.ts          # Supabase client + bucket names
  context/
    AuthContext.tsx        # Session + auth actions (email/password, Google)
    ProfileContext.tsx     # Current user's profile (username, avatar) + refresh
    PresenceContext.tsx    # Global online-users presence
  hooks/
    useBoardCollab.ts      # Board presence (viewers) + live activity broadcast
  types.ts                 # Shared TypeScript types
  App.tsx                  # Auth-gated router
  pages/
    AuthPage.tsx           # Sign in / sign up
    BoardsPage.tsx         # Create / list / delete / leave boards
    BoardPage.tsx          # The canvas + realtime + ghosts + viewers
    ProfilePage.tsx        # Edit username + upload avatar
    FriendsPage.tsx        # Add friends, requests, online status
  components/
    NoteCard.tsx           # Draggable, resizable, editable sticky note
    GhostNote.tsx          # Translucent live "shadow" of someone else's note
    Avatar.tsx             # Picture or initial fallback + online dot
    MembersDialog.tsx      # Invite by email + roster
    AppHeader.tsx          # Nav (Boards / Friends / Profile)
    Spinner.tsx
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally (test the PWA) |
| `npm run typecheck` | Type-check only |

## Troubleshooting

- **"Missing Supabase environment variables"** — you didn't create `.env` (see step 5). Restart the dev server after editing it.
- **Google sign-in redirects back to the sign-in page** — check the redirect URI in Google Cloud and the Site/Redirect URLs in Supabase match your app URL exactly.
- **"No user found with email…" when inviting** — the invitee must sign up once first so a `profiles` row exists.
- **Notes don't sync live** — make sure you ran the whole `schema.sql` (the last block enables Realtime), and that Realtime is on for your project.
