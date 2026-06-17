"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/items";
import type { ItemType } from "@/lib/types";

/** Set a pending gear item's moderation status. Admin-only (re-checked + RLS). */
async function setItemStatus(
  itemId: string,
  status: "active" | "rejected",
  type?: ItemType,
  slug?: string,
): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;

  // `status` is no longer UPDATE-grantable to the `authenticated` role
  // (migration ...000013 closed the moderation-bypass hole), so write it via
  // the service-role client — same pattern as setUserAdmin/is_admin.
  const admin = createAdminClient();
  await admin.from("items").update({ status }).eq("id", itemId);

  revalidatePath("/admin");
  revalidatePath("/");
  if (type && slug) revalidatePath(`/${type}/${slug}`);
}

/** Approve a pending gear item — make it publicly visible. */
export async function approveGear(
  itemId: string,
  type?: ItemType,
  slug?: string,
): Promise<void> {
  await setItemStatus(itemId, "active", type, slug);
}

/** Reject a pending gear item — keep it hidden from the public. */
export async function rejectGear(
  itemId: string,
  type?: ItemType,
  slug?: string,
): Promise<void> {
  await setItemStatus(itemId, "rejected", type, slug);
}

/** The signed-in user's id, or null. */
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Grant or revoke admin on a user. Admin-only. Uses the service-role client
 * (profiles RLS only lets a user update their own row). You cannot demote
 * yourself — that would risk locking everyone out.
 */
export async function setUserAdmin(userId: string, makeAdmin: boolean): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;
  const me = await currentUserId();
  if (!makeAdmin && userId === me) return; // no self-demotion

  const admin = createAdminClient();
  await admin.from("profiles").update({ is_admin: makeAdmin }).eq("id", userId);
  revalidatePath("/admin");
}

/**
 * Delete a user account (cascades to their profile/votes/reviews/etc. via FK).
 * Admin-only. You cannot delete yourself.
 */
export async function deleteUser(userId: string): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;
  const me = await currentUserId();
  if (userId === me) return; // no self-deletion

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin");
}
