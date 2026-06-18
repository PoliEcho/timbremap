# MusicCompas — Project Guide

> This file is the source of truth for the MusicCompas project. It is written both as a
> product spec and as guidance for **Claude Code instances** working on this repo. Read it
> fully before making changes.
>
> **IMPORTANT — keep this file current.** Any time a decision is made, a feature is built,
> a schema changes, a convention is established, or a next-step is completed, update the
> relevant section here immediately. This file must reflect what exists *right now*, not
> what was planned at some earlier point. Outdated sections mislead future Claude instances.

---

## 1. What This Project Is

MusicCompas is a web app for placing music and audio gear on a two-axis "sound compass" —
think of a political compass, but for how something *sounds*. Registered users vote on where
an album, song, or piece of audio gear sits on the map, the app builds a community average,
and uses it to recommend other items that sit nearby.

### The Compass

```
                  Treble
                    │
                    │
   Technical ───────┼─────── Atmospheric
                    │
                    │
                   Bass
```

- **Vertical axis** — **Treble** (top) ↔ **Bass** (bottom)
- **Horizontal axis** — **Technical** (left) ↔ **Atmospheric** (right)

Every vote is a single point (X, Y) on this square. The cover art of the album/song — or the
product image for gear — is shown as the **background** of the compass, and placements are
drawn as **dots** on top of it.

### What Can Be Placed (collectively "objects" / "items")

- **Albums**
- **Songs**
- **Headphones**
- **IEMs**
- **Speakers**

### Voting

Any **registered user** can place a dot. For each item the app shows:

- **Average view** — a single dot at the mean of all votes (the consensus placement).
- **All votes view** — every individual vote drawn as a dot (spread / heat map of opinion).

A toggle switches between the two. Users can **add** or **change** their vote at any time.

### Recommendations

For any selected item, recommend the items closest to it on the compass — surfaced per
category (best matching song / album / headphones / IEM / speaker).

---

## 2. UI Layout

Two main areas (see the original sketch in project notes):

### Left column — Search & navigation
1. **Search** box at the top.
2. **Results list** — items matching the search. When nothing is searched, show the
   **most-voted objects**.
3. Selecting a result opens its **detail** here.
4. Account controls: **Login / Logout / Register** and **My Votes** (every item the user voted on).

### Right area — The Compass
A large square showing the selected item's cover/product image as the background, with vote
dots overlaid (average dot or all individual votes depending on the toggle).

### Item Detail
Type-specific metadata plus vote controls:
- **Product** (headphones / IEM / speaker): image, **manufacturer**, **release date**.
- **Song**: cover image, **artist**, **album**, **release date**.
- **Album**: cover image, **artist**, **release date**, representative song.

Every item detail also has: the **average / all-votes toggle**, **add / change my vote**
controls, and **recommendations** (best matching song, album, headphones, IEM, speaker).

### Accounts
- Visitors can browse and view compasses (public).
- Registering / logging in unlocks **voting** and the **My Votes** list.

---

## 3. Tech Stack (decided)

```
Next.js (React) on Vercel  →  Supabase (Postgres + Auth + Storage)
        frontend + API              database, users, images
```

- **Framework: Next.js (React).** Chosen for SSR/ISR (critical for SEO — see §5) and because
  it bundles frontend + lightweight API routes in one deployable project. React suits the
  interactive compass canvas and toggle views.
- **Backend/DB: Supabase.** Managed Postgres + built-in **Auth** (handles login/register/logout)
  + **Storage** (images) + auto-generated REST API. Removes most custom backend work.
- **Hosting frontend: Vercel** (free tier, first-class Next.js support).

### Hosting notes / rejected options
- **GitHub Pages is NOT usable for the app** — it serves static files only, no backend or DB.
  (Could host a purely static landing page, but not the app.)
- **Raw VPS (e.g. Oracle Cloud Always Free) was rejected for now** — too much ops overhead
  (Linux/nginx/backups) for this stage. Revisit only if full control is needed later.
- Alternatives considered: Neon (Postgres only), Railway/Render (DB + backend), SvelteKit or
  Vite+React (lighter frontends). Stack above is the default unless changed here.

---

## 4. Item Image & Metadata Sources

Different sources per item type:

### Music (albums, songs, artists, covers, release dates)
- **Deezer API** ⭐ — **currently the active source.** Simple, free, good cover art, no
  auth needed for search. Used for **album and song** import today (`/search/album`, `/album/{id}`,
  `/search/track`, `/track/{id}`).
- **Spotify Web API** — covers, artist, album, release date, popularity. Free, requires app
  registration. Preferred long-term but **not wired yet**.
- **MusicBrainz + Cover Art Archive** — fully open, no auth, but messier data.
- **Last.fm API** — good metadata, free.

### Audio gear (headphones, IEMs, speakers)
- **No clean free API exists.** Approach (**BUILT**):
  - **User-submitted gear** (type, model, manufacturer, price, release date, **image URL**) — fits
    the community model. Form at `/submit-gear` (shared `GearForm` component), item created via
    `createGearItem` (`src/lib/items.ts`). **Moderation-gated:** submissions are inserted
    `status='pending'` and stay private until an **admin** approves them at `/admin` (see the
    "Gear moderation" + "Admin role" conventions in §6).
  - **Images are pasted links, not uploads.** The earlier Storage-upload approach was dropped: the
    `next/image` optimizer refuses to fetch images that resolve to private IPs, so local Supabase
    Storage URLs (`127.0.0.1:54321`) never rendered in dev. Pasting a public image URL avoids this.
    The `gear-images` bucket migration is retained but currently unused.
  - **Editing:** the creator **or an admin** can edit (`updateGearItem`) or delete (`deleteOwnItem`)
    gear from the item page; RLS allows `created_by = auth.uid()` or `is_admin(auth.uid())`.
    Deezer-imported albums/songs have `created_by = null`, so non-admins see no edit/delete controls;
    admins can delete any item (Edit is gear-only).
  - Gear has no external source, so search hits the local DB (`searchGear`), not Deezer.
  - Optionally seed/scrape from ASR, Crinacle's database, or Head-Fi (check terms first).

**Practical rule:** auto-fetch music from Spotify/Deezer; allow user-submitted gear since no
good gear API exists.

---

## 5. SEO (important — design for it from the start)

Every item (album/song/gear) is a page that should rank on Google. This **only works if the
content is server-rendered** — a plain client-side React SPA ships near-empty HTML and ranks
poorly. This is a primary reason Next.js was chosen.

### Requirements / checklist
| Item | What to do |
|------|-----------|
| **Server rendering** | Use Next.js SSR/SSG/**ISR** for all item pages. ISR = static page per item, periodically refreshed as votes change. The big win. |
| **Clean URLs** | `/album/dark-side-of-the-moon`, not `/?id=123`. Use slugs. |
| **Per-page titles/descriptions** | e.g. "Dark Side of the Moon — Sound Compass & Reviews \| MusicCompas". |
| **Open Graph / Twitter cards** | So shared links show cover + compass. |
| **Structured data (JSON-LD)** | `MusicAlbum`, `Product`, and **`AggregateRating`** (maps perfectly to vote averages) → rich results. |
| **Sitemap.xml** | Auto-generate, listing every item. |
| **robots.txt** | Allow crawling; block private pages like `/my-votes`. |
| **Image alt text** | Descriptive alt on cover/product images. |
| **Canonical tags** | Avoid duplicate-content issues. |

### Nuance — the interactive compass
The canvas dots are client-side JS and Google won't "see" them; that's fine. Make sure the
**text content** (artist, album, release date, **average placement described in words**,
recommendations as links) is in the server-rendered HTML. Render the average placement as text
too (e.g. "Community placement: slightly bassy, atmospheric") — good for SEO *and*
accessibility.

---

## 6. Data Model (BUILT — see `supabase/migrations/`)

Implemented in Postgres via the Supabase CLI. Migrations:
- `supabase/migrations/20260617000000_init.sql` — full schema (tables, views, functions, RLS, trigger).
- `supabase/migrations/20260617000001_service_role_grants.sql` — explicit `service_role` grants on `items`, `votes`, `item_stats`, and `nearby_items` so server-side admin-client imports work.
- `supabase/migrations/20260617000002_gear_images_bucket.sql` — public `gear-images` Storage bucket + `storage.objects` policies (public read; authenticated insert/update/delete) for user-submitted gear images.
- `supabase/migrations/20260617000003_gear_price_and_reviews.sql` — adds `items.price` (gear) and the `reviews` table (+ RLS, grants, updated_at trigger).
- `supabase/migrations/20260617000004_item_delete_policy.sql` — lets a creator delete their own items (delete RLS policy + grant); update was already allowed in init.
- `supabase/migrations/20260617000005_review_likes.sql` — `review_likes` table (+ RLS, grants). Likes reorder reviews.
- `supabase/migrations/20260617000006_favorites.sql` — `favorites` table (+ RLS, grants). "Like = favorite" on any item.
- `supabase/migrations/20260617000007_item_genre.sql` — adds `items.genre` (text). **Superseded by 9.**
- `supabase/migrations/20260617000008_engagement_view.sql` — `item_engagement` view (per item: vote/like/review counts + avg_x/avg_y + card columns). Backs browse. **Recreated by 9.**
- `supabase/migrations/20260617000009_item_genres_array.sql` — replaces `items.genre` with `items.genres text[]` (GIN-indexed; multiple genres/tags per item), migrates existing values, and recreates `item_engagement` with `genres`.
- `supabase/migrations/20260617000010_admin_and_moderation.sql` — adds `profiles.is_admin` (bool) + an `is_admin(uid)` SECURITY DEFINER helper, admin RLS override policies (update/delete **any** item; delete **any** review), tightens the items insert policy so non-admins may only insert `status='pending'` gear, and bootstraps the first admin (`oskar.smotex@gmail.com`).
- `supabase/migrations/20260617000011_profiles_service_role_grant.sql` — grants `service_role` full table privileges on `profiles` (admin user-management needs them; `service_role` bypasses RLS but still needs table grants).
- `supabase/migrations/20260617000012_fix_profiles_admin_escalation.sql` — **SECURITY FIX (privilege escalation).** The init migration's table-wide `grant update on public.profiles to authenticated` let any logged-in user `PATCH /rest/v1/profiles?id=eq.<self> {is_admin:true}` straight through PostgREST — **RLS is row-level, not column-level**, so the own-row update policy passed it through, bypassing `setUserAdmin`'s app guard. Fix revokes the table-wide UPDATE and re-grants UPDATE only on `display_name`; `is_admin` is now writable solely via the service-role client. Also demotes all non-bootstrap admins to remediate exploited accounts. **Rule: never grant table-wide UPDATE on a table with a privilege/role column — use column grants.**
- `supabase/migrations/20260617000014_item_description.sql` — adds `items.description` (text, any item type; shown on the item page + emitted as JSON-LD `description`). **Admin-only writable:** deliberately *not* added to the `authenticated` column-level UPDATE grant, so (like `artist`/`album`/`genres`) it's writable only via the service-role client (`adminUpdateItem`). Manual music submissions still INSERT fine — only UPDATE was narrowed in `…000013`; the insert RLS policy forces non-admins to `status='pending'`.
- `supabase/migrations/20260617000013_fix_items_moderation_bypass.sql` — **SECURITY FIX (moderation bypass).** Same bug class as `…000012`: the init migration's table-wide `grant insert, update on public.items to authenticated` let a gear submitter `PATCH /rest/v1/items?id=eq.<own-pending-item> {status:'active'}` straight through PostgREST — the own-item update RLS policy (`created_by = auth.uid()`) passed it because **RLS is row-level, not column-level**, self-approving their pending gear and bypassing the admin `approveGear` flow. Fix revokes the table-wide UPDATE and re-grants UPDATE only on the columns `updateGearItem` writes (`type, title, manufacturer, price, image_url, release_date`); `status`/`created_by`/`external_*` are now writable solely via the service-role client. Paired code change: `setItemStatus` (approve/reject in `src/app/actions/admin.ts`) now uses `createAdminClient()` instead of the request-scoped client, since `status` is no longer UPDATE-grantable to `authenticated`. **Rule: never grant table-wide UPDATE on a table with a moderation/role column — use column grants.**
- `supabase/migrations/20260617000015_input_limits_and_rate_limit.sql` — **SECURITY hardening (input-size DoS + spam/rate limiting).** Adds upper-bound CHECK constraints (`reviews.body` ≤ 5000, `items.description` ≤ 10000, `items.title` ≤ 300, `items.genres` ≤ 20 entries / bounded total size — per-genre length is enforced in the action since CHECKs can't use subqueries; caps mirror `src/lib/limits.ts`). Adds a `rate_events` table (RLS-enabled, **no** `authenticated`/`anon` policies — direct access denied) and a `check_rate_limit(action, max, window)` `SECURITY DEFINER` (`search_path=''`) function that records + counts a caller's events in a sliding window and returns allow/deny. Called from server actions via the request-scoped client's `.rpc(...)` through the `checkRateLimit` helper (`src/lib/ratelimit.ts`, fails open on infra error): votes/favorites/review-likes 60/min, reviews 30/hr, gear+music submissions 20/day.

- `supabase/migrations/20260617000016_oauth_display_name.sql` — widens `handle_new_user` so OAuth
  signups (Google) get a sensible `display_name`: it now falls back through `raw_user_meta_data`'s
  `display_name` → `full_name` → `name` → email prefix (Google supplies `full_name`/`name`, not the
  `display_name` our email/password signup sets).

- **profiles** — `id` (FK `auth.users`), `display_name`, `is_admin` (bool, default false),
  `created_at`. Auto-created on signup via the `handle_new_user` trigger (always non-admin); flip
  `is_admin` manually to grant admin. Auth itself is handled by Supabase Auth. **`is_admin` is
  writable only by the service-role client** — `authenticated` has a column-level UPDATE grant on
  `display_name` only (migration `…000012`), so users cannot self-escalate via the public API even
  though RLS lets them update their own row.
- **items** — `id`, `type` (`album|song|headphones|iem|speaker` enum), `slug` (unique), `title`,
  `artist`, `album`, `manufacturer`, `price` (numeric, gear only — assumed USD), `genres`
  (`text[]`, music only — multiple subgenre tags from Last.fm), `description` (text, any type —
  **admin-only**, shown on the item page), `image_url`, `release_date`, `external_source` (`deezer`),
  `external_id`, `created_by`, `status` (`active|pending|rejected`), timestamps. Unique on
  (`external_source`, `external_id`). **`authenticated` may UPDATE only `type, title, manufacturer,
  price, image_url, release_date` (column grant, migration `…000013`); `artist`, `album`, `genres`,
  `description`, `status`, `created_by`, `external_*` are writable only via the service-role client**
  (`adminUpdateItem`/`createMusicItem`'s insert/Deezer import/`setItemStatus`).
- **votes** — `id`, `user_id`, `item_id`, `x`, `y` (doubles, **CHECK in [-1, 1]**), timestamps.
  **Unique (user_id, item_id)** — re-voting upserts the same row.
- **reviews** — `id`, `user_id`, `item_id`, `body` (text, non-empty), timestamps.
  **Unique (user_id, item_id)** — one editable review per user per item; re-submitting upserts.
  No comments. World-readable; users write only their own (RLS). Author display name is
  resolved with a separate `profiles` query (no PostgREST-embeddable FK path reviews→profiles).
- **review_likes** — `id`, `user_id`, `review_id`, `created_aost:3000.t`. **Unique (user_id, review_id)**.
  World-readable (counts are public); users write only their own. Reviews are ordered most-liked
  first (then newest) in `getReviews`.
- **favorites** — `id`, `user_id`, `item_id`, `created_at`. **Unique (user_id, item_id)**. The
  app's "like" = favorite: one heart per item. World-readable so per-item like counts feed the
  "most liked" browse sort; the My Favorites page filters by user.
- **item_stats** (view) — per item: `vote_count`, `avg_x`, `avg_y`. This is the **average
  placement**, computed on the fly.
- **item_engagement** (view) — per item: `vote_count`, `like_count`, `review_count`, `avg_x`,
  `avg_y`, `genre`, `type` + card columns. Backs `getBrowseItems`/the browse home page.
- **nearby_items(target, type, limit)** (function) — recommendations: nearest items of a type by
  Euclidean distance on the average placement.
- **RLS**: items/votes/profiles/reviews/review_likes/favorites are world-readable; a user may only
  write their own votes/profile/reviews/likes/favorites; authenticated users may insert items but
  only with `status='pending'` (gear submissions set `created_by`) unless they're an admin.
  **Admins** (`is_admin(auth.uid())`) may update/delete any item and delete any review. Deezer
  imports are written server-side with the service-role key (`src/lib/items.ts`), which bypasses
  RLS and so inserts `status='active'` directly.

### Decided conventions (defaults — change here if revisited)
- **Auth (BUILT):** email/password **and Google OAuth**, both via Supabase Auth. Email/password
  uses the `login`/`register` server actions (`src/app/actions/auth.ts`). **Google** uses the
  PKCE flow: the `signInWithGoogle` server action calls `supabase.auth.signInWithOAuth({ provider:
  'google', redirectTo: <origin>/auth/callback })` and redirects to Google; the callback route
  (`src/app/auth/callback/route.ts`) `exchangeCodeForSession`s and redirects to `next` (default `/`),
  or back to `/login?error=…` on failure (surfaced via `AuthForm`'s `initialError`). The "Continue
  with Google" button lives in `AuthForm.tsx` (shown on both login + register). **Config:** the
  provider is enabled in `supabase/config.toml` (`[auth.external.google]`) reading
  `SUPABASE_AUTH_GOOGLE_CLIENT_ID`/`SUPABASE_AUTH_GOOGLE_SECRET` from env for local dev (set them
  before `supabase start`); in hosted Supabase, configure it under Authentication → Providers.
  Google's name populates `display_name` via the trigger (migration `…000016`).
  **Email confirmation:** email/password signup requires confirming the email first
  (`enable_confirmations = true` in `config.toml`; in hosted Supabase it's the Email provider's
  "Confirm email" toggle). `register` returns no session in that case, so it shows a "check your
  email" message instead of redirecting; the confirmation email links to `/auth/confirm`
  (`src/app/auth/confirm/route.ts`), which `verifyOtp`s the `token_hash` and redirects to `/`. The
  hosted email template must point at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
  Locally, confirmation emails are caught by Inbucket (`http://localhost:54324`).
- **Coordinates:** `x` = Technical(−1) ↔ Atmospheric(+1), `y` = Bass(−1) ↔ Treble(+1), floats in `[-1, 1]`.
- **Average placement:** mean (not median/density).
- **Recommendations:** Euclidean nearest by category, top 3.
- **Routing:** every item lives at **`/[type]/[slug]`** — one dynamic route
  (`src/app/[type]/[slug]/page.tsx`) serves all five types. `type` is validated against the enum
  and must match `item.type` (else `notFound()`), keeping URLs canonical. Album URLs are unchanged
  (`/album/<slug>`). Recommendation cards, the sidebar, My Votes, My Favorites, the browse home
  grid, and the sitemap all link `/${type}/${slug}`.
- **Sorting/filtering lives in two places, both backed by `getBrowseItems`:**
  - **Sidebar list** (`src/components/SidebarList.tsx`, client) — on every page, with sort + genre
    dropdowns; re-fetches from `/api/browse` (`src/app/api/browse/route.ts`) on change. This is the
    primary, always-visible browse UI. Server-rendered initial list comes from `Sidebar.tsx`.
  - **Home page** (`/`, `src/app/page.tsx`) — a server component reading `searchParams`
    ({ sort, genre, type }) into a responsive grid; controls in `src/components/BrowseControls.tsx`
    push to the URL.
  - Sort modes: `most_voted`, `most_liked`, `most_reviewed`, `most_bassy`/`most_trebly` (avg_y),
    `most_technical`/`most_atmospheric` (avg_x — placement sorts only include voted items).
    Filters: `genre` (music-only) and `type`.
- **Layout/scroll:** desktop pins the shell to the viewport (`body md:h-screen md:overflow-hidden`,
  `AppShell md:h-screen`), so the sidebar and `<main>` (`md:overflow-y-auto`) scroll independently.
  The sidebar (`Sidebar.tsx`) is split into a **scrollable area** (logo + search + list,
  `flex-1 overflow-y-auto`) and a **pinned, non-scrolling footer** (`AuthControls`, `shrink-0
  border-t`) — the auth/account footer stays fixed at the bottom while only the list scrolls.
  **Mobile is a hamburger drawer:** `SidebarShell.tsx` (client) wraps the sidebar content; on
  mobile it renders a top bar with the logo + a hamburger button and slides the sidebar in as a
  fixed overlay drawer (backdrop, body-scroll lock, auto-close on route change); on desktop (`md:`)
  the drawer is `static` and always visible. Mobile `<main>` keeps normal page scroll.
- **Submission + moderation (BUILT):** **any registered user can submit gear *and* music by hand.**
  Gear → `/submit-gear` (`GearForm` → `submitGear` → `createGearItem`); albums/songs → `/submit-music`
  (`MusicForm` → `submitMusic` → `createMusicItem`). Both insert `status='pending'` and stay
  **private** — the item page `notFound()`s for anyone but the creator/admin, and all public surfaces
  filter `status='active'` (browse, search, recommendations, genres, sitemap, `getMostVoted`). The
  creator/admin sees an "Awaiting admin approval" banner on the item page. Admins approve/reject from
  the **`/admin`** queue (`getPendingItems` + `approveGear`/`rejectGear` in `src/app/actions/admin.ts`),
  or via inline Approve/Reject on the pending item page. Rejected items get `status='rejected'` (still
  hidden). **Deezer-imported** albums/songs are still written server-side with the service-role key and
  go straight to `status='active'` (auto-approved) — manual submission is the fallback for items search
  can't find. The `/submit-music` empty-state link surfaces from album/song search (`SearchPanel`).
- **Admin role (BUILT):** an admin is a profile with `is_admin = true`. **This supersedes the old
  `ADMIN_EMAILS` plan** — admin status lives in the DB so RLS can enforce it (see §6 RLS). The
  source of truth is the `is_admin(uid)` SECURITY DEFINER helper used by policies; the app checks it
  via `isCurrentUserAdmin()` (`src/lib/items.ts`). Admin powers: approve/reject submissions,
  **edit any item** — gear (creator can too) *and* albums/songs (**admin-only**: title, artist, album,
  genres, release date, image, description), delete any item, delete any review (`Reviews.tsx` shows
  Delete on others' reviews; `deleteReview` takes a `reviewId` and deletes by id for admins), and
  **user administration** (see below). Admin edits route through **`adminUpdateItem`** (service-role,
  re-checks `isCurrentUserAdmin()`) because `artist`/`album`/`genres`/`description` aren't
  UPDATE-grantable to `authenticated`; a non-admin gear owner's edit stays on the request-scoped
  `updateGearItem`. The item-page **Edit** link shows for gear (owner/admin) and music (admin only);
  the edit page (`/[type]/[slug]/edit`) renders `GearForm` for gear and `MusicForm` for music and
  reveals the description field only to admins (`showDescription`). Admins get an **Admin** nav link (`AuthControls`); `/admin` is
  `notFound()` for non-admins and disallowed in `robots.ts`. **Granting admin:** either from the
  `/admin` Users table (below), or register the account then `update public.profiles set
  is_admin = true where id = …` (the bootstrap migration does this for `oskar.smotex@gmail.com` if
  the account already exists; otherwise re-run the UPDATE after signup).
- **User administration (BUILT):** the `/admin` page has a **Users** section listing every account
  (`listUsers()` in `src/lib/items.ts`) with grant/revoke-admin and delete-account controls
  (`setUserAdmin`/`deleteUser` in `src/app/actions/admin.ts`). These write via the **service-role
  client** (`createAdminClient`) because (a) profiles RLS only lets a user update their *own* row,
  and (b) listing emails / deleting auth users needs `auth.admin`. Both actions re-check
  `isCurrentUserAdmin()` and **guard against self-demotion / self-deletion** (anti-lockout).
  Deleting a user cascades to their rows via FK `on delete cascade`.
- **Description (BUILT):** free-text `items.description` on **any** item type, shown on the item page
  (`whitespace-pre-line`) and emitted as JSON-LD `description`. **Admin-only edit** — set via the edit
  form's description field (revealed only to admins) → `adminUpdateItem` (service-role); the column is
  not UPDATE-grantable to `authenticated`, so non-admin creators cannot set it.
- **Streaming links (BUILT):** every item page shows a "Listen on" row linking to **Tidal,
  Spotify, Apple Music, YouTube Music, and Deezer** (`StreamingLinks.tsx`, URLs built in
  `src/lib/streaming.ts`). These are **pre-filled search links** (query = artist/manufacturer +
  title) since the app only stores a Deezer external id — except **Deezer**, which deep-links to
  the exact `/album/{id}` or `/track/{id}` when the item was Deezer-imported. Shown on **all item
  types** (gear too); no API keys needed. Open in a new tab.
- **Price:** gear only, stored in `items.price`, **assumed USD app-wide** (no multi-currency).
  Shown on the gear page and emitted as a JSON-LD `Offer`. Add a currency column if other
  currencies are ever needed.
- **Reviews:** one editable text review per user per item, on every item type. No rating field
  (the compass placement is the structured signal). The user's own review renders as a normal card
  with **Edit** (inline toggle) + Delete; others render with a like button. Add/edit via the
  `saveReview` action (upsert), remove via `deleteReview`; UI in `src/components/Reviews.tsx`.
- **Review likes:** any user can like any other review (`review_likes` table); likes reorder the
  list (most-liked first, then newest). Toggle via `toggleReviewLike`; counts come from
  `getReviews`.
- **Item likes / favorites:** one concept — a heart on the item page (`FavoriteButton` +
  `toggleFavorite` action, `favorites` table). Liked items show in **My Favorites**
  (`/my-favorites`, mirrors `/my-votes`; both blocked in `robots.ts`). Per-item like counts feed
  the "most liked" browse sort.
- **Genres:** music-only, stored as `items.genres text[]` (multiple subgenre tags per item).
  Granular genres come from **Last.fm top tags** (`src/lib/lastfm.ts`, `albumGenres`/`trackGenres`),
  filtered against a curated `GENRE_ALLOWLIST` to drop folksonomy noise (top ~4 matches kept).
  Requires `LASTFM_API_KEY` (free; `.env.local`); **without it, import falls back to Deezer's broad
  genre** (e.g. just "Rock"). Gear has no genres. The browse genre filter matches items whose
  `genres` array `contains` the selected value (`getBrowseItems`); `getGenres()` flattens distinct
  values. Emitted as a `genre` array in `MusicAlbum`/`MusicRecording` JSON-LD. Backfill existing
  items with `node scripts/backfill-genres.mjs` (keep its allowlist in sync with `lastfm.ts`).
- **Images:** item `<Image>`s use `unoptimized` everywhere (browse grid, item page, sidebar,
  search, recommendations, compass background, My Votes/Favorites). The Next optimizer fetches
  arbitrary user-pasted gear hosts server-side and often fails (hotlink protection, bad
  content-type), so optimization is bypassed for item images.
- **Theming (BUILT — centralized in `src/app/globals.css`):** the visual identity is a dark
  green theme — background `#191A19`, all text `#D8E9A8` (muted tints via `color-mix`), accent
  green `#4E9F3D`, **Noto Serif** font (`next/font`, `--font-noto-serif`), **all sharp edges**
  (a global `*{border-radius:0 !important}` reset, which also defeats `rounded-full` pills), and
  a **soft SVG-noise grain** overlay (`body::after`, opacity ~0.06). Rather than edit every
  component, the theme **overrides the stock Tailwind palette tokens** the components already use,
  inside `@theme inline`: `indigo-400/500/600` → accent greens; `zinc-100..600` → text tints;
  `zinc-700..950` → surface/border shades. This split works because zinc usage is cleanly ranged
  (100–600 = text only, 700–950 = surfaces/borders only) — **re-verify with a grep before adding
  any `bg-zinc-100..600` or `text-zinc-700..950`.** To retheme any other color, add its
  `--color-*` override to that block. **Still hard-coded (intentionally, for the user to pick):**
  `emerald-500/600` (your-vote dot + Save button), `rose-400/500` (favorite/destructive),
  `amber-*` (warnings/admin/pending banners), `red-400` (errors), `white/10`/`white/25` (compass
  grid lines). Logo: `public/timbermap-logo.png` (sidebar wordmark, `Sidebar.tsx`). Favicon:
  `public/favicon.png` (wired via `metadata.icons` in `layout.tsx`; the default
  `src/app/favicon.ico` was removed).
- **JSON-LD (type-aware, built in `[type]/[slug]/page.tsx`):** albums emit `MusicAlbum`, songs emit
  `MusicRecording` (+ `inAlbum` when known), gear emits `Product` (+ `brand`, + `offers` when priced).
  All emit `description` when set and include a vote `InteractionCounter` and a `review` array when
  reviews exist.
  **XSS rule — never `JSON.stringify` straight into `dangerouslySetInnerHTML`.** The JSON-LD
  `<script>` is serialized with **`safeJsonLd`** (`src/lib/jsonld.ts`), which escapes `<`/`>`/`&`
  to `\uXXXX`. Plain `JSON.stringify` leaves `</script>` intact, so a `</script><script>…` payload
  in any user field (review body, title, artist, description, display name) breaks out of the
  script tag and executes — this was a live stored XSS (fixed). Route every `application/ld+json`
  block through `safeJsonLd`.
  **`AggregateRating` is intentionally NOT used** — the compass is a 2-axis placement, not a 1–5
  quality score, so a synthetic rating would be invalid structured data. Revisit if a real rating
  dimension is added.

---

## 7. Guidance for Claude Instances

- **This file is the spec.** When the user makes a new decision (stack, schema, source, naming),
  **update the relevant section here** so it stays the single source of truth. Note rejected
  options and *why*, like §3 does.
- **The MVP is built** — the repo is a real git project with working code. Check what exists
  before writing anything; don't assume files are missing or need to be created from scratch.
- **Working directory:** `/home/osuku/Work/MusicCompas`.
- **Default decisions already made:** Next.js + Supabase + Vercel; Deezer for music metadata
  (Spotify planned but not wired); user-submitted gear; SEO via SSR/ISR. Don't re-litigate
  these unless asked — build on them.
- **Open decisions to raise with the user when relevant:** averaging method (mean vs median vs
  density), recommendation algorithm details, Spotify integration timing. (Gear moderation is now
  built — `is_admin`-gated `/admin` queue; see §6.)
- **SEO is a first-class requirement**, not an afterthought — keep item pages server-rendered
  and keep meaningful text in the HTML.
- Keep product terminology consistent: *object/item*, *vote/placement*, *average placement*,
  *compass*, *recommendation* (see glossary below).

### Glossary
| Term | Meaning |
|------|---------|
| **Object / Item** | An album, song, or piece of gear placeable on the compass. |
| **Vote / Placement** | A single user's (X, Y) point for one item. |
| **Average placement** | The mean of all votes for an item. |
| **Compass** | The treble/bass × technical/atmospheric square. |
| **Recommendation** | Another item near the selected one on the compass. |
| **Like / Favorite** | A heart on an item; liked items appear in My Favorites. One concept. |
| **Review like** | A like on someone's review; reorders reviews most-liked first. |

---

## 8. Status

**Albums, songs, and user-submitted gear all built end-to-end.** Next.js 16 (App Router) + TS +
Tailwind 4, Supabase (local via the CLI/Docker stack), Deezer for album + song metadata.
Implemented: a **browse home page** (sort by most voted/liked/reviewed/bassy/trebly/technical/
atmospheric + genre & type filters), album/song search+import (Deezer) plus **manual album/song +
gear submission** (`/submit-music`, `/submit-gear`), one
`/[type]/[slug]` item page for all types, interactive compass with voting + average/all-votes
toggle, gear price, **multiple genre tags** (music, from Last.fm top tags w/ Deezer fallback),
**admin-only item description**, per-item text reviews (own review editable
inline, **likes reorder reviews**), **item likes/favorites + My Favorites**, email/password + **Google OAuth** auth,
My Votes, recommendations, **admin moderation** (gear *and* manual music submit as `pending`;
`is_admin`-gated `/admin` approval queue + inline admin edit/delete of any item — incl. album/song
title/metadata/description — and any review),
**viewport-pinned layout** (independent sidebar/content scroll on desktop), and full type-aware
SEO (SSR, metadata, OG, JSON-LD, sitemap, robots). See `README.md` for how to run it.

**Notable implementation facts for future Claude instances:**
- Next.js 16 specifics: `params`/`searchParams` and `cookies()`/`headers()` are **async**; the
  request hook is `src/proxy.ts` (the old `middleware.ts` convention is deprecated).
- Music source is currently **Deezer only** (no auth) for both albums and songs. Spotify not wired.
- **Routing is unified at `/[type]/[slug]`** (see §6 conventions). There is no longer an
  `/album/[slug]` folder — that route is served by the dynamic page. Recommendation cards link
  `/${rec.type}/${rec.slug}`.
- **Search** (`/api/search?q=&type=`): `album`/`song` hit Deezer and import on click via the
  `openDeezerItem` server action; `gear` searches the local DB (`searchGear`) and links straight to
  the existing item. The toggle lives in `src/components/SearchPanel.tsx`.
- **Submission/editing**: gear → `/submit-gear` (`GearForm` → `submitGear` → `createGearItem`);
  music → `/submit-music` (`MusicForm` → `submitMusic` → `createMusicItem`, `src/app/actions/music.ts`).
  Both forms are client components; image is a **pasted URL** (no upload). The edit page
  `/[type]/[slug]/edit` renders `GearForm` for gear, `MusicForm` for music. **Edit routing:** a
  non-admin gear owner's edit → `updateGear` → `updateGearItem` (request-scoped, RLS-enforced); an
  **admin's** edit of anything → `adminUpdateItem` (service-role) — `updateGear` branches on
  `isCurrentUserAdmin()`, and `updateMusic` is admin-only. `deleteItem` → `deleteOwnItem`. On the item
  page: Edit shows for gear (creator/admin) and music (admin only); Delete for creator/admin (any
  item). The admin description field is gated behind `showDescription`.
- **Admin moderation**: gear *and* music submit as `status='pending'` and stay hidden until approved
  (Deezer imports are auto-`active`). Admins (`profiles.is_admin`, checked via `isCurrentUserAdmin()`)
  approve/reject at **`/admin`** (`getPendingItems`, `approveGear`/`rejectGear` in
  `src/app/actions/admin.ts`) or inline on the pending item page, can edit any item / delete any item,
  and can delete any review (`deleteReview(reviewId,…)`). Pending/rejected item pages `notFound()` for
  non-owner/non-admin viewers. See §6 "Admin role".
- `next.config.ts` allows **any** image host (`https://**` and `http://**`) for `next/image`, AND
  every item-image `<Image>` uses **`unoptimized`** — the optimizer fetches arbitrary user-pasted
  gear hosts server-side and often fails (hotlink protection, bad content-type, private IPs), so
  bypassing it is what makes pasted gear images actually render. See the "Images" convention in §6.

### Next steps (not built)
- **Hosted Supabase + Vercel deploy** (see README "Deploying"). Mostly account setup; the code,
  migrations, and image host config are deploy-ready.
- **Admin UX polish** (optional) — the moderation queue is built (`/admin`); could add bulk
  actions, an admin-management UI (granting `is_admin` from the app instead of SQL), and email
  notifications to submitters on approve/reject.
- Spotify integration; richer gear metadata seeding (ASR/Crinacle/Head-Fi).
