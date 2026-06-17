import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAlbum, getTrack, slugify } from "@/lib/deezer";
import { albumGenres, trackGenres } from "@/lib/lastfm";
import type {
  BrowseItem,
  BrowseSort,
  Item,
  ItemStats,
  ItemType,
  NearbyItem,
  Review,
  ReviewWithAuthor,
  Vote,
} from "@/lib/types";

/** Whether the signed-in user is an admin (profiles.is_admin). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return (data as { is_admin: boolean } | null)?.is_admin ?? false;
}

/** Fetch one item by its slug, or null. */
export async function getItemBySlug(slug: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Item) ?? null;
}

/** Aggregate placement (avg_x, avg_y) + vote_count for one item. */
export async function getItemStats(itemId: string): Promise<ItemStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_stats")
    .select("*")
    .eq("item_id", itemId)
    .maybeSingle();
  return (
    (data as ItemStats) ?? { item_id: itemId, vote_count: 0, avg_x: null, avg_y: null }
  );
}

/** Every vote for an item (the "all votes" view). */
export async function getVotes(itemId: string): Promise<Vote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("votes")
    .select("*")
    .eq("item_id", itemId);
  return (data as Vote[]) ?? [];
}

/** The signed-in user's vote for an item, if any. */
export async function getUserVote(itemId: string): Promise<Vote | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("votes")
    .select("*")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Vote) ?? null;
}

/**
 * All reviews for an item, most-liked first (then newest), with the author's
 * display name, like count, and whether the current user liked each.
 */
export async function getReviews(itemId: string): Promise<ReviewWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("item_id", itemId)
    .order("updated_at", { ascending: false });

  const reviews = (data as Review[]) ?? [];
  if (reviews.length === 0) return [];

  // Resolve author names separately — reviews.user_id → auth.users isn't a
  // PostgREST-embeddable path to profiles.
  const userIds = [...new Set(reviews.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  const nameById = new Map(
    ((profiles as { id: string; display_name: string | null }[] | null) ?? []).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  // Like counts + which the current user liked.
  const reviewIds = reviews.map((r) => r.id);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: likes } = await supabase
    .from("review_likes")
    .select("review_id, user_id")
    .in("review_id", reviewIds);
  const likeRows = (likes as { review_id: string; user_id: string }[] | null) ?? [];
  const countById = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const l of likeRows) {
    countById.set(l.review_id, (countById.get(l.review_id) ?? 0) + 1);
    if (user && l.user_id === user.id) likedByMe.add(l.review_id);
  }

  return reviews
    .map((r) => ({
      ...r,
      author_name: nameById.get(r.user_id) ?? null,
      like_count: countById.get(r.id) ?? 0,
      liked_by_me: likedByMe.has(r.id),
    }))
    .sort(
      (a, b) =>
        b.like_count - a.like_count ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
}

/** The signed-in user's review for an item, if any. */
export async function getUserReview(itemId: string): Promise<Review | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Review) ?? null;
}

/** Favorite ("like") count for an item + whether the current user favorited it. */
export async function getFavoriteInfo(
  itemId: string,
): Promise<{ count: number; favorited: boolean }> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("favorites")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let favorited = false;
  if (user) {
    const { data } = await supabase
      .from("favorites")
      .select("id")
      .eq("item_id", itemId)
      .eq("user_id", user.id)
      .maybeSingle();
    favorited = !!data;
  }
  return { count: count ?? 0, favorited };
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
}

/**
 * Every user (auth + profile), for the admin user-management table. Uses the
 * service-role client because auth.users (and emails) aren't exposed to the
 * anon/authenticated API. Caller must already be an admin.
 */
export async function listUsers(): Promise<AdminUser[]> {
  // Defense in depth: callers already gate on admin, but this function reaches
  // auth.users via the service-role client, so re-verify here too.
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users ?? [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, is_admin");
  const byId = new Map(
    ((profiles as { id: string; display_name: string | null; is_admin: boolean }[] | null) ??
      []).map((p) => [p.id, p]),
  );

  return users
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        display_name:
          p?.display_name ??
          ((u.user_metadata?.display_name as string | undefined) || null),
        is_admin: p?.is_admin ?? false,
        created_at: u.created_at,
      };
    })
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

/** Pending gear submissions awaiting moderation, with the submitter's name. */
export async function getPendingItems(): Promise<(Item & { submitter: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const items = (data as Item[]) ?? [];
  if (items.length === 0) return [];

  const userIds = [...new Set(items.map((i) => i.created_by).filter(Boolean))] as string[];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  const nameById = new Map(
    ((profiles as { id: string; display_name: string | null }[] | null) ?? []).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  return items.map((i) => ({
    ...i,
    submitter: i.created_by ? nameById.get(i.created_by) ?? null : null,
  }));
}

/** Most-voted items (home fallback list). */
export async function getMostVoted(limit = 20): Promise<(Item & { vote_count: number })[]> {
  const supabase = await createClient();
  const { data: stats } = await supabase
    .from("item_stats")
    .select("*")
    .order("vote_count", { ascending: false })
    .limit(limit);

  const rows = (stats as ItemStats[]) ?? [];
  const withVotes = rows.filter((s) => s.vote_count > 0);
  if (withVotes.length === 0) {
    // No votes yet anywhere — just show the most recently added items.
    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data as Item[]) ?? []).map((i) => ({ ...i, vote_count: 0 }));
  }

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("status", "active")
    .in("id", withVotes.map((s) => s.item_id));

  const byId = new Map((items as Item[] | null)?.map((i) => [i.id, i]) ?? []);
  return withVotes
    .map((s) => {
      const item = byId.get(s.item_id);
      return item ? { ...item, vote_count: s.vote_count } : null;
    })
    .filter((x): x is Item & { vote_count: number } => x !== null);
}

type SortColumn = { column: keyof BrowseItem; ascending: boolean; placementOnly?: boolean };

const SORTS: Record<BrowseSort, SortColumn> = {
  most_voted: { column: "vote_count", ascending: false },
  most_liked: { column: "like_count", ascending: false },
  most_reviewed: { column: "review_count", ascending: false },
  most_bassy: { column: "avg_y", ascending: true, placementOnly: true },
  most_trebly: { column: "avg_y", ascending: false, placementOnly: true },
  most_technical: { column: "avg_x", ascending: true, placementOnly: true },
  most_atmospheric: { column: "avg_x", ascending: false, placementOnly: true },
};

/**
 * Browse items for the home page, sorted and optionally filtered by genre/type.
 * Placement sorts (bassy/trebly/technical/atmospheric) only include voted items.
 */
export async function getBrowseItems(opts: {
  sort?: BrowseSort;
  genre?: string | null;
  type?: ItemType | null;
  limit?: number;
  offset?: number;
}): Promise<BrowseItem[]> {
  const sort = opts.sort ?? "most_voted";
  const { column, ascending, placementOnly } = SORTS[sort];
  const supabase = await createClient();

  let query = supabase
    .from("item_engagement")
    .select("*")
    .eq("status", "active");

  if (opts.type) query = query.eq("type", opts.type);
  if (opts.genre) query = query.contains("genres", [opts.genre]);
  if (placementOnly) query = query.not(column, "is", null);

  const limit = opts.limit ?? 48;
  const offset = opts.offset ?? 0;

  query = query
    .order(column, { ascending, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data } = await query;
  return (data as BrowseItem[]) ?? [];
}

/** Distinct genres present across all items, for the browse genre filter. */
export async function getGenres(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("genres")
    .eq("status", "active");
  const set = new Set<string>();
  for (const row of (data as { genres: string[] | null }[] | null) ?? []) {
    for (const g of row.genres ?? []) set.add(g);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Search user-submitted gear in the local DB (no external API exists). */
export async function searchGear(query: string, limit = 12): Promise<Item[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const pattern = `%${q}%`;
  const { data } = await supabase
    .from("items")
    .select("*")
    .in("type", ["headphones", "iem", "speaker"])
    .eq("status", "active")
    .or(`title.ilike.${pattern},manufacturer.ilike.${pattern}`)
    .limit(limit);
  return (data as Item[]) ?? [];
}

/** Nearest items of a given type to the target item (recommendations). */
export async function getRecommendations(
  itemId: string,
  type: ItemType,
  limit = 3,
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("nearby_items", {
    target_item: itemId,
    result_type: type,
    max_results: limit,
  });
  return (data as NearbyItem[]) ?? [];
}

/**
 * Import a Deezer album into `items` (idempotent on external id) and return it.
 * Uses the service-role client so it works regardless of who is signed in.
 */
export async function importDeezerAlbum(externalId: string): Promise<Item | null> {
  const admin = createAdminClient();

  // Already imported?
  const { data: existing, error: fetchErr } = await admin
    .from("items")
    .select("*")
    .eq("external_source", "deezer")
    .eq("external_id", externalId)
    .maybeSingle();
  if (fetchErr) console.error("[importDeezerAlbum] fetch existing failed:", fetchErr);
  if (existing) return existing as Item;

  const album = await getAlbum(externalId);
  if (!album) {
    console.error("[importDeezerAlbum] Deezer getAlbum returned null for id:", externalId);
    return null;
  }

  const base = slugify(`${album.artist ?? ""} ${album.title}`) || `album-${externalId}`;
  const slug = await uniqueSlug(admin, base, externalId);

  // Granular genres from Last.fm; fall back to Deezer's broad genre.
  const lastfm = await albumGenres(album.artist, album.title);
  const genres = lastfm.length > 0 ? lastfm : album.genre ? [album.genre] : [];

  const { data, error } = await admin
    .from("items")
    .insert({
      type: "album",
      slug,
      title: album.title,
      artist: album.artist,
      genres,
      image_url: album.imageUrl,
      release_date: album.releaseDate,
      external_source: "deezer",
      external_id: externalId,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[importDeezerAlbum] insert failed:", error);
    // Lost a race — fetch the row that won.
    const { data: row, error: retryErr } = await admin
      .from("items")
      .select("*")
      .eq("external_source", "deezer")
      .eq("external_id", externalId)
      .maybeSingle();
    if (retryErr) console.error("[importDeezerAlbum] retry fetch failed:", retryErr);
    return (row as Item) ?? null;
  }
  return data as Item;
}

/**
 * Import a Deezer track into `items` (idempotent on external id) and return it.
 * Mirrors importDeezerAlbum but sets type "song" and the album column.
 */
export async function importDeezerSong(externalId: string): Promise<Item | null> {
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("items")
    .select("*")
    .eq("external_source", "deezer")
    .eq("external_id", externalId)
    .maybeSingle();
  if (fetchErr) console.error("[importDeezerSong] fetch existing failed:", fetchErr);
  if (existing) return existing as Item;

  const track = await getTrack(externalId);
  if (!track) {
    console.error("[importDeezerSong] Deezer getTrack returned null for id:", externalId);
    return null;
  }

  const base = slugify(`${track.artist ?? ""} ${track.title}`) || `song-${externalId}`;
  const slug = await uniqueSlug(admin, base, externalId);

  // Granular genres from Last.fm (track tags, then album); fall back to Deezer.
  const lastfm = await trackGenres(track.artist, track.title, track.album ?? null);
  const genres = lastfm.length > 0 ? lastfm : track.genre ? [track.genre] : [];

  const { data, error } = await admin
    .from("items")
    .insert({
      type: "song",
      slug,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      genres,
      image_url: track.imageUrl,
      release_date: track.releaseDate,
      external_source: "deezer",
      external_id: externalId,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[importDeezerSong] insert failed:", error);
    const { data: row, error: retryErr } = await admin
      .from("items")
      .select("*")
      .eq("external_source", "deezer")
      .eq("external_id", externalId)
      .maybeSingle();
    if (retryErr) console.error("[importDeezerSong] retry fetch failed:", retryErr);
    return (row as Item) ?? null;
  }
  return data as Item;
}

// Either the service-role client or a request-scoped server client works here —
// uniqueSlug only reads/uses the `items` table via select.
type ItemsClient = SupabaseClient | ReturnType<typeof createAdminClient>;

async function uniqueSlug(
  client: ItemsClient,
  base: string,
  suffix: string,
): Promise<string> {
  const { data } = await client.from("items").select("id").eq("slug", base).maybeSingle();
  if (!data) return base;
  // Disambiguate with a short suffix (external id, or a random token for gear).
  return `${base}-${suffix.slice(-6)}`;
}

/**
 * Create a user-submitted gear item (headphones / IEM / speaker). Auto-approved
 * (status "active"). Runs as the signed-in user via the request-scoped client so
 * RLS records `created_by`. Returns the created item or an error message.
 */
export async function createGearItem(input: {
  type: Extract<ItemType, "headphones" | "iem" | "speaker">;
  title: string;
  manufacturer: string | null;
  price: number | null;
  releaseDate: string | null;
  imageUrl: string | null;
}): Promise<{ item?: Item; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to submit gear." };

  const base =
    slugify(`${input.manufacturer ?? ""} ${input.title}`) || `gear-${input.type}`;
  // Gear has no external id; disambiguate with a token derived from the user id.
  const slug = await uniqueSlug(supabase, base, user.id.replace(/-/g, ""));

  const { data, error } = await supabase
    .from("items")
    .insert({
      type: input.type,
      slug,
      title: input.title,
      manufacturer: input.manufacturer,
      price: input.price,
      image_url: input.imageUrl,
      release_date: input.releaseDate,
      created_by: user.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { item: data as Item };
}

/**
 * Create a user-submitted music item (album / song). Like gear, it is inserted
 * `status='pending'` and stays private until an admin approves it. Runs as the
 * signed-in user via the request-scoped client so RLS records `created_by` and
 * forces the pending status. Returns the created item or an error message.
 */
export async function createMusicItem(input: {
  type: Extract<ItemType, "album" | "song">;
  title: string;
  artist: string | null;
  album: string | null;
  genres: string[];
  releaseDate: string | null;
  imageUrl: string | null;
}): Promise<{ item?: Item; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to submit music." };

  const base = slugify(`${input.artist ?? ""} ${input.title}`) || `${input.type}`;
  // Music submissions have no external id; disambiguate with the user id.
  const slug = await uniqueSlug(supabase, base, user.id.replace(/-/g, ""));

  const { data, error } = await supabase
    .from("items")
    .insert({
      type: input.type,
      slug,
      title: input.title,
      artist: input.artist,
      album: input.type === "song" ? input.album : null,
      genres: input.genres,
      image_url: input.imageUrl,
      release_date: input.releaseDate,
      created_by: user.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { item: data as Item };
}

/**
 * Admin-only edit of any item's editable fields, including columns the
 * `authenticated` role cannot UPDATE (artist/album/genres/description — see
 * migrations ...000013/...000014). Uses the service-role client, which bypasses
 * column grants and RLS, so callers MUST re-check `isCurrentUserAdmin()` first
 * (the actions do). `slug`/`status`/`created_by`/`external_*` are never touched
 * here — slug stays stable for SEO; status changes go through setItemStatus.
 */
export async function adminUpdateItem(
  itemId: string,
  patch: {
    type?: ItemType;
    title?: string;
    artist?: string | null;
    album?: string | null;
    genres?: string[];
    manufacturer?: string | null;
    price?: number | null;
    description?: string | null;
    releaseDate?: string | null;
    imageUrl?: string | null;
  },
): Promise<{ item?: Item; error?: string }> {
  // Defense in depth: this bypasses RLS via the service-role client and can
  // write admin-only columns, so re-verify the caller is an admin.
  if (!(await isCurrentUserAdmin())) return { error: "Admins only." };
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.artist !== undefined) update.artist = patch.artist;
  if (patch.album !== undefined) update.album = patch.album;
  if (patch.genres !== undefined) update.genres = patch.genres;
  if (patch.manufacturer !== undefined) update.manufacturer = patch.manufacturer;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.releaseDate !== undefined) update.release_date = patch.releaseDate;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;

  const { data, error } = await admin
    .from("items")
    .update(update)
    .eq("id", itemId)
    .select("*")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Item not found." };
  return { item: data as Item };
}

/**
 * Update a gear item the signed-in user created. RLS restricts the write to the
 * owner (`created_by = auth.uid()`), so a non-owner gets zero rows back.
 */
export async function updateGearItem(
  itemId: string,
  input: {
    type: Extract<ItemType, "headphones" | "iem" | "speaker">;
    title: string;
    manufacturer: string | null;
    price: number | null;
    releaseDate: string | null;
    imageUrl: string | null;
  },
): Promise<{ item?: Item; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({
      type: input.type,
      title: input.title,
      manufacturer: input.manufacturer,
      price: input.price,
      image_url: input.imageUrl,
      release_date: input.releaseDate,
    })
    .eq("id", itemId)
    .select("*")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "You can only edit gear you submitted." };
  return { item: data as Item };
}

/** Delete an item the signed-in user created. RLS enforces ownership. */
export async function deleteOwnItem(itemId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", itemId);
}
