# Tauri + SvelteKit + TypeScript

This template should help get you started developing with Tauri, SvelteKit and TypeScript in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

---

# App Plan: Gesture Slot (Tauri + SvelteKit)

This README documents how we will implement the desktop app with a clear priority on Supabase-based auth and navigation.

## 1) Auth & Session (Client-side, reusable libs/stores)

- **Goal**
  - Add a Login page (`/login`).
  - If there is NO session, client-side redirect protected routes to `/login`.
  - If a session EXISTS and user visits `/login`, redirect to `/` (Home).

- **Auth Source: Supabase**
  - Provider: Supabase Auth (GoTrue) via `@supabase/supabase-js`.
  - Keys: use the project URL + anon key from `import.meta.env.VITE_*`.
  - Session persistence: handled by Supabase client (`persistSession: true`) in the webview.

- **Reusable client libs & stores**
  - `src/lib/supabaseClient.ts`: singleton `supabase` browser client.
  - Optional store: a lightweight Svelte store that tracks `session` and `user` using `supabase.auth.onAuthStateChange` for reactive UI.
  - Guards: implement in `+layout.svelte` or per-page `onMount` to redirect unauthenticated users to `/login`.

- **No SvelteKit server endpoints**
  - We do NOT use `/api/*` for auth in Tauri. All auth flows run in the renderer via the Supabase client.
  - `hooks.server.ts` stays minimal (no SSR redirects or cookie parsing).

- **Pages**
  - `/login` (public)
    - Email/password form.
    - On submit: call `supabase.auth.signInWithPassword` directly.
    - On success: client-side navigate to `/`.
    - Show inline error and a debug panel on failure.
  - `/` Home (protected)
    - On mount, read `supabase.auth.getUser()`; if missing, redirect to `/login`.
    - Show current user email and a logout button (`supabase.auth.signOut`).

- **No API Endpoints**
  - Auth does not rely on SvelteKit server routes.
  - Token refresh is handled by Supabase client SDK internally when `persistSession` is enabled.

- **Tauri specifics**
  - Network calls run from the embedded webview; CORS is not an issue for Supabase when called directly from the app.
  - Tokens live in the renderer (managed by Supabase SDK). For stronger isolation later, migrate sensitive actions to Tauri commands.

## 2) Minimal Routing Rules

- **Public**: `/login`.
- **Protected**: `/` (Home), future game routes.
- **Redirects (client-side)**
  - No session → on mount, navigate to `/login`.
  - Has session → visiting `/login` → navigate to `/`.

## 3) Next Steps (after auth)

- Implement Game Home UI (reels, controls, basic state machine).
- Add camera/gesture module (desktop-friendly implementation) behind a feature flag.
- Add sounds and result overlay.

## 4) Dev Commands

- Install prerequisites: Rust (cargo), Xcode CLT on macOS.
- Run dev: `pnpm tauri dev`.
- Build: `pnpm tauri build`.


# Game Structure

Layout: 3-column slot machine (each column shows 3 visible items at once)

Gesture: `Do Action` is Both Arm Raise or pressing enter

Tables:

- **spinner_items**
  - `id text primary key` - has a counterpart in /static/items/*.{mp4/png/webm}
  - `label text`
  - `is_active boolean default true`
  - `chance integer default 1`
  
- **spinner_draws**
  - `id uuid primary key`
  - `created_at timestamptz default now()`
  - `draw_1 text references spinner_items(id)`
  - `draw_2 text references spinner_items(id)`
  - `draw_3 text references spinner_items(id)`
  - `is_forced boolean default false`
  - `code text` — nullable hex string (set when revealed)
  - `used_at timestamptz`

Game States:

- `Idle` - waiting for `Do Action`
- `Spinning` - reels are spinning
- `Stop1` - first reel stopped using `Do Action`
- `Stop2` - second reel stopped using `Do Action`
- `Stop3` - third reel stopped using `Do Action`
- `Result` - result shown, on `Do Action`, go back to `Spinning`
- `Result_Win` - result is shown and next spin is locked for 60s, can not `do action` for 60s
- `Result_Lose` - result is show and no lock to go back to spinning

Data Flow:

this app uses supabase for data storage, the tables are defined above.

This app has 2 pages: Login Page, and Game Page.

Login Page:

- User logs in using their email and password.
- User is redirected to the Game Page.

Game Page:
- user has no session, it should go to Login Page.
- User can start the game by pressing the `Do Action` button.
- User can stop the game by pressing the `Do Action` button.
- User can restart the game by pressing the `Do Action` button.

During `Idle` or `Result` state, user can only press the `Do Action` button, this will bring to the spinning state.

During the spinning state, app will try to pull if there is a forced draw, if there is a forced draw, it will use the forced draw to determine the result, otherwise it will create a random result.
this will automatically create a randomized result to be inserted into the `spinner_draws` table.
this means the spinner reels are just for show or pretend that user is getting a chance to win.

on `Stop1`, `Stop2`, `Stop3` state, user can only press the `Do Action` button, this will bring to the result state. and display the draws one at a time.

on the reels the draw is displayed as an image, in the middle of the reel. there should always be an image both on top of the reel and bottom of the reel. One strategy is to separate the layers between show the result of the reel and the spinning animation. If stop is executed the spinning animation will be hidden and display the result.

## Components

1. Game - controls the game states, and gesture detection
2. Reel (3 Reels) - displays the items
3. Item - items from spinner_items table