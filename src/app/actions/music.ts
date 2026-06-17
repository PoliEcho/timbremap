"use server";

import { redirect } from "next/navigation";
import { createMusicItem, adminUpdateItem, isCurrentUserAdmin } from "@/lib/items";
import type { ItemType } from "@/lib/types";

export type MusicState = { error: string } | null;

const MUSIC_TYPES: ItemType[] = ["album", "song"];

/** Split a comma-separated genres input into a clean, de-duplicated array. */
function parseGenres(raw: string): string[] {
  const seen = new Set<string>();
  for (const g of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    seen.add(g);
  }
  return [...seen];
}

/** Parse and validate the shared music form fields. */
function parseMusicForm(
  formData: FormData,
):
  | { error: string }
  | {
      type: "album" | "song";
      title: string;
      artist: string | null;
      album: string | null;
      genres: string[];
      releaseDate: string | null;
      imageUrl: string | null;
      description: string | null;
    } {
  const type = String(formData.get("type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const artist = String(formData.get("artist") ?? "").trim();
  const album = String(formData.get("album") ?? "").trim();
  const genres = parseGenres(String(formData.get("genres") ?? ""));
  const releaseDate = String(formData.get("release_date") ?? "").trim();
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!MUSIC_TYPES.includes(type as ItemType)) return { error: "Pick album or song." };
  if (!title) return { error: "A title is required." };

  return {
    type: type as "album" | "song",
    title,
    artist: artist || null,
    album: type === "song" ? album || null : null,
    genres,
    releaseDate: releaseDate || null,
    imageUrl: imageUrl || null,
    description: description || null,
  };
}

/** Create a user-submitted album/song (pending moderation), then redirect. */
export async function submitMusic(
  _prev: MusicState,
  formData: FormData,
): Promise<MusicState> {
  const parsed = parseMusicForm(formData);
  if ("error" in parsed) return parsed;

  const { item, error } = await createMusicItem(parsed);
  if (error || !item) return { error: error ?? "Could not submit." };
  redirect(`/${item.type}/${item.slug}`);
}

/** Admin-only edit of an album/song (title, metadata, description). */
export async function updateMusic(
  itemId: string,
  _prev: MusicState,
  formData: FormData,
): Promise<MusicState> {
  if (!(await isCurrentUserAdmin())) return { error: "Admins only." };

  const parsed = parseMusicForm(formData);
  if ("error" in parsed) return parsed;

  const { item, error } = await adminUpdateItem(itemId, parsed);
  if (error || !item) return { error: error ?? "Could not save changes." };
  redirect(`/${item.type}/${item.slug}`);
}
