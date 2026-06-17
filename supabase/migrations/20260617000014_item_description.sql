-- Free-text description for any item, shown on the item page.
--
-- Admin-only writable. We intentionally do NOT add `description` to the
-- column-level UPDATE grant for `authenticated` (see migration ...000013): a
-- non-admin gear owner must not be able to edit it. Admin edits write
-- `description` (and the music metadata columns artist/album/genres, which are
-- likewise not authenticated-UPDATE-grantable) via the service-role client
-- (`adminUpdateItem` in src/lib/items.ts), which bypasses column grants and RLS.
--
-- Manual music submissions still INSERT fine: the table-wide INSERT grant from
-- the init migration is intact (only UPDATE was narrowed in ...000013), and the
-- insert RLS policy forces non-admins to `status='pending'`.

alter table public.items add column if not exists description text;
