export type ItemType = "album" | "song" | "headphones" | "iem" | "speaker";
export type ItemStatus = "active" | "pending" | "rejected";

export interface Item {
  id: string;
  type: ItemType;
  slug: string;
  title: string;
  artist: string | null;
  album: string | null;
  manufacturer: string | null;
  price: number | null;
  genres: string[];
  description: string | null;
  image_url: string | null;
  release_date: string | null;
  external_source: string | null;
  external_id: string | null;
  created_by: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: string;
  user_id: string;
  item_id: string;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

/** A user's text review of an item. One per (user, item); editable. */
export interface Review {
  id: string;
  user_id: string;
  item_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** A review joined with its author's display name + like info, for rendering. */
export interface ReviewWithAuthor extends Review {
  author_name: string | null;
  like_count: number;
  liked_by_me: boolean;
}

export interface ItemStats {
  item_id: string;
  vote_count: number;
  avg_x: number | null;
  avg_y: number | null;
}

/** A recommendation row returned by the nearby_items RPC. */
export interface NearbyItem {
  id: string;
  slug: string;
  title: string;
  artist: string | null;
  image_url: string | null;
  type: ItemType;
  avg_x: number;
  avg_y: number;
  vote_count: number;
  distance: number;
}

/** Sort modes for the browse/home page. */
export type BrowseSort =
  | "most_voted"
  | "most_liked"
  | "most_reviewed"
  | "most_bassy"
  | "most_trebly"
  | "most_technical"
  | "most_atmospheric";

/** A row from the item_engagement view, used to render browse cards. */
export interface BrowseItem {
  id: string;
  type: ItemType;
  slug: string;
  title: string;
  artist: string | null;
  manufacturer: string | null;
  image_url: string | null;
  genres: string[];
  vote_count: number;
  like_count: number;
  review_count: number;
  avg_x: number | null;
  avg_y: number | null;
}

/**
 * A normalized search result. `deezer` results are imported on selection;
 * `local` results (user-submitted gear) already exist in the DB and are
 * navigated to directly. `externalId` carries the Deezer id, or the item slug
 * for local results.
 */
export interface SearchResult {
  source: "deezer" | "local";
  externalId: string;
  type: ItemType;
  title: string;
  artist: string | null;
  album?: string | null;
  genre?: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  /** Present on local results so the UI can link straight to the item page. */
  slug?: string;
}
