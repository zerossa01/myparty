# Rave Clone — Watch Party

Watch YouTube videos together with friends in real-time synced rooms with live chat
and presence. Built with Vite + React + Tailwind + Supabase — no accounts required.

---

## Local setup

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + anon key
npm run dev
```

Required env vars (in `.env`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Open http://localhost:5173.

---

## Supabase setup

1. **Create a project** at https://supabase.com.
2. **Enable anonymous auth**:
   *Authentication → Providers → Anonymous → toggle on.*
3. **Run the schema**:
   *SQL Editor → New query → paste `supabase/schema.sql` → Run.*
   This creates `rooms`, `users`, `messages`, applies RLS policies (anyone can
   read; only insert your own rows), and adds all three tables to the
   `supabase_realtime` publication so Realtime works automatically.
4. **Verify Realtime** is on for `rooms`, `users`, and `messages` under
   *Database → Replication → supabase_realtime*. The schema script handles this,
   but it's worth a glance.
5. Copy your project URL and `anon` key from
   *Project Settings → API* into your `.env`.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to https://vercel.com → **Import Project** → pick the repo.
3. Vercel auto-detects Vite. Leave the build settings as defaults
   (`npm run build`, output `dist`).
4. Add **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**.

The included `vercel.json` rewrites all paths to `index.html` so React Router
keeps working on direct navigation / refresh.

---

## How to use

1. **Open the app** and pick a display name + an emoji avatar. You're signed in
   anonymously — no email, no password.
2. **Create a room** with a name. You become the host and get a room code like
   `RAVE-4F2K`.
3. **Share the code** (or invite link) with friends. They join from the
   homepage and land in the same room.
4. **Paste a YouTube link** in the player input (host only). Press Play —
   everyone's player play/pause/seek stays in sync.
5. **Chat** in the right-side panel. Live presence shows who's watching;
   toasts pop when people join or leave.

---

## Tech notes

- Anonymous auth via `supabase.auth.signInAnonymously()`.
- Realtime sync for video playback uses **broadcast** channels.
- Realtime chat uses **postgres_changes** subscriptions.
- Realtime viewer list uses **presence**.
- YouTube playback uses the official IFrame API loaded dynamically (no
  wrapper libraries).
- All UI is Tailwind — no UI kit.

## Folder structure

```
src/
  components/   ChatPanel, OnboardingModal, PresenceToasts,
                RoomActions, VideoPlayer, ViewersBar
  hooks/        useAuth, useChat, usePresence, useSyncPlayer, useYouTube
  lib/          rooms.js, supabase.js, youtube.js
  pages/        HomePage.jsx, RoomPage.jsx
  index.css, main.jsx
supabase/
  schema.sql
vercel.json
```
