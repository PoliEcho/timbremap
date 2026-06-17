-- SECURITY FIX: privilege escalation — any authenticated user could set their
-- own profiles.is_admin = true.
--
-- Root cause: the init migration ran `grant update on public.profiles to
-- authenticated`, which is a TABLE-wide UPDATE (all columns, including
-- is_admin). RLS policies are ROW-level, not column-level, so the
-- "users update their own profile" policy happily allowed
--   PATCH /rest/v1/profiles?id=eq.<self> { "is_admin": true }
-- straight through the PostgREST API, bypassing the app's setUserAdmin guard.
--
-- Fix: revoke the table-wide grant and re-grant UPDATE only on the columns a
-- user is allowed to self-edit. is_admin is intentionally excluded — it is only
-- ever written by the service-role client (createAdminClient / setUserAdmin),
-- which bypasses column grants and RLS.

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Remediate any accounts that exploited this. Demote everyone except the known
-- legitimate admin. Re-grant intended admins explicitly afterward if needed.
update public.profiles
set is_admin = false
where id <> (select id from auth.users where email = 'oskar.smotex@gmail.com');
