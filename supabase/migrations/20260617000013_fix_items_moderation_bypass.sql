-- SECURITY FIX: moderation bypass — a gear submitter could approve their own
-- pending item by flipping items.status to 'active'.
--
-- Root cause: the init migration ran `grant insert, update on public.items to
-- authenticated`, a TABLE-wide UPDATE (all columns, including status). RLS is
-- ROW-level, not column-level, so the "authenticated users can update items
-- they created" policy (created_by = auth.uid()) happily allowed
--   PATCH /rest/v1/items?id=eq.<own-pending-item> { "status": "active" }
-- straight through PostgREST, bypassing the admin-only approveGear flow.
-- Same bug class as the profiles is_admin escalation (migration ...000012).
--
-- Fix: revoke the table-wide UPDATE and re-grant UPDATE only on the columns a
-- creator legitimately self-edits (the ones updateGearItem writes). status,
-- created_by, external_source and external_id are intentionally excluded — they
-- are written only by the service-role client (createAdminClient / Deezer
-- import / setItemStatus), which bypasses column grants and RLS.
--
-- Rule: never grant table-wide UPDATE on a table with a moderation/role column —
-- use column grants. (See ...000012 for the profiles.is_admin variant.)

revoke update on public.items from authenticated;
grant update (type, title, manufacturer, price, image_url, release_date)
  on public.items to authenticated;
