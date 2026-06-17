"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createGearItem,
  updateGearItem,
  deleteOwnItem,
  adminUpdateItem,
  isCurrentUserAdmin,
} from "@/lib/items";
import type { ItemType } from "@/lib/types";

export type GearState = { error: string } | null;

const GEAR_TYPES: ItemType[] = ["headphones", "iem", "speaker"];

/** Parse and validate the shared gear form fields. */
function parseGearForm(
  formData: FormData,
): { error: string } | {
  type: "headphones" | "iem" | "speaker";
  title: string;
  manufacturer: string | null;
  price: number | null;
  releaseDate: string | null;
  imageUrl: string | null;
  description: string | null;
} {
  const type = String(formData.get("type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const manufacturer = String(formData.get("manufacturer") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const releaseDate = String(formData.get("release_date") ?? "").trim();
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!GEAR_TYPES.includes(type as ItemType)) return { error: "Pick a gear type." };
  if (!title) return { error: "A model name is required." };

  let price: number | null = null;
  if (priceRaw) {
    const parsed = Number(priceRaw);
    if (!Number.isFinite(parsed) || parsed < 0) return { error: "Enter a valid price." };
    price = parsed;
  }

  return {
    type: type as "headphones" | "iem" | "speaker",
    title,
    manufacturer: manufacturer || null,
    price,
    releaseDate: releaseDate || null,
    imageUrl: imageUrl || null,
    description: description || null,
  };
}

/** Create a user-submitted gear item from the form, then redirect to its page. */
export async function submitGear(_prev: GearState, formData: FormData): Promise<GearState> {
  const parsed = parseGearForm(formData);
  if ("error" in parsed) return parsed;

  const { item, error } = await createGearItem(parsed);
  if (error || !item) return { error: error ?? "Could not submit gear." };
  redirect(`/${item.type}/${item.slug}`);
}

/** Update a gear item the signed-in user created, then redirect to its page. */
export async function updateGear(
  itemId: string,
  _prev: GearState,
  formData: FormData,
): Promise<GearState> {
  const parsed = parseGearForm(formData);
  if ("error" in parsed) return parsed;

  // Description is admin-only and not UPDATE-grantable to `authenticated`, so an
  // admin's edit goes through the service-role path; a non-admin owner's edit
  // stays on the request-scoped, RLS-enforced path (and can't touch description).
  const isAdmin = await isCurrentUserAdmin();
  const { item, error } = isAdmin
    ? await adminUpdateItem(itemId, parsed)
    : await updateGearItem(itemId, parsed);
  if (error || !item) return { error: error ?? "Could not save changes." };
  redirect(`/${item.type}/${item.slug}`);
}

/** Delete an item the signed-in user created (RLS enforces ownership). */
export async function deleteItem(itemId: string, type: ItemType, slug: string): Promise<void> {
  await deleteOwnItem(itemId);
  revalidatePath(`/${type}/${slug}`);
  redirect("/");
}
