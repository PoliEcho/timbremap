import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AppShell from "@/components/AppShell";
import Compass from "@/components/Compass";
import Reviews from "@/components/Reviews";
import FavoriteButton from "@/components/FavoriteButton";
import {
  getItemBySlug,
  getItemStats,
  getVotes,
  getUserVote,
  getRecommendations,
  getReviews,
  getUserReview,
  getFavoriteInfo,
  isCurrentUserAdmin,
} from "@/lib/items";
import { createClient } from "@/lib/supabase/server";
import { deleteItem } from "@/app/actions/gear";
import { approveGear, rejectGear } from "@/app/actions/admin";
import { describePlacement } from "@/lib/compass";
import type { Item, ItemType, NearbyItem, ReviewWithAuthor } from "@/lib/types";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const ITEM_TYPES: ItemType[] = ["album", "song", "headphones", "iem", "speaker"];
const GEAR_TYPES: ItemType[] = ["headphones", "iem", "speaker"];

const REC_TYPES: { type: ItemType; label: string }[] = [
  { type: "album", label: "Albums" },
  { type: "song", label: "Songs" },
  { type: "headphones", label: "Headphones" },
  { type: "iem", label: "IEMs" },
  { type: "speaker", label: "Speakers" },
];

function isItemType(t: string): t is ItemType {
  return (ITEM_TYPES as string[]).includes(t);
}

/** The line under the title: artist for music, manufacturer for gear. */
function subtitle(item: Item): string | null {
  return GEAR_TYPES.includes(item.type) ? item.manufacturer : item.artist;
}

/** Format a gear price (assumed USD app-wide). */
function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

/** Resolve the item for a (type, slug) pair, enforcing the canonical type. */
async function resolveItem(type: string, slug: string): Promise<Item | null> {
  if (!isItemType(type)) return null;
  const item = await getItemBySlug(slug);
  if (!item || item.type !== type) return null;
  return item;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}): Promise<Metadata> {
  const { type, slug } = await params;
  const item = await resolveItem(type, slug);
  if (!item) return { title: "Not found" };

  const stats = await getItemStats(item.id);
  const placement = describePlacement(stats.avg_x, stats.avg_y);
  const sub = subtitle(item);
  const titleText = sub ? `${item.title} by ${sub}` : item.title;
  const description =
    stats.vote_count > 0
      ? `Community sound-compass placement for ${titleText}: ${placement.toLowerCase()} (from ${stats.vote_count} vote${stats.vote_count === 1 ? "" : "s"}).`
      : `Be the first to place ${titleText} on the Timbremap sound compass.`;

  const ogType =
    item.type === "album" ? "music.album" : item.type === "song" ? "music.song" : "website";

  return {
    title: titleText,
    description,
    alternates: { canonical: `${siteUrl}/${type}/${slug}` },
    openGraph: {
      title: `${titleText} — Sound Compass`,
      description,
      type: ogType,
      url: `${siteUrl}/${type}/${slug}`,
      images: item.image_url ? [{ url: item.image_url }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${titleText} — Sound Compass`,
      description,
      images: item.image_url ? [item.image_url] : undefined,
    },
  };
}

/** Type-specific JSON-LD. Gear uses Product; no AggregateRating (see CLAUDE.md §6). */
function buildJsonLd(
  item: Item,
  slug: string,
  voteCount: number,
  reviews: ReviewWithAuthor[],
) {
  const url = `${siteUrl}/${item.type}/${slug}`;
  const interaction =
    voteCount > 0
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/VoteAction",
            userInteractionCount: voteCount,
          },
        }
      : {};
  const reviewLd =
    reviews.length > 0
      ? {
          review: reviews.map((r) => ({
            "@type": "Review",
            ...(r.author_name && {
              author: { "@type": "Person", name: r.author_name },
            }),
            datePublished: r.updated_at,
            reviewBody: r.body,
          })),
        }
      : {};

  if (GEAR_TYPES.includes(item.type)) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.title,
      category: item.type,
      ...(item.description && { description: item.description }),
      ...(item.manufacturer && {
        brand: { "@type": "Brand", name: item.manufacturer },
      }),
      ...(item.release_date && { releaseDate: item.release_date }),
      ...(item.image_url && { image: item.image_url }),
      ...(item.price !== null && {
        offers: {
          "@type": "Offer",
          price: item.price,
          priceCurrency: "USD",
        },
      }),
      url,
      ...interaction,
      ...reviewLd,
    };
  }

  if (item.type === "song") {
    return {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: item.title,
      ...(item.description && { description: item.description }),
      ...(item.artist && { byArtist: { "@type": "MusicGroup", name: item.artist } }),
      ...(item.album && { inAlbum: { "@type": "MusicAlbum", name: item.album } }),
      ...(item.genres.length > 0 && { genre: item.genres }),
      ...(item.release_date && { datePublished: item.release_date }),
      ...(item.image_url && { image: item.image_url }),
      url,
      ...interaction,
      ...reviewLd,
    };
  }

  // album
  return {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: item.title,
    ...(item.description && { description: item.description }),
    ...(item.artist && { byArtist: { "@type": "MusicGroup", name: item.artist } }),
    ...(item.genres.length > 0 && { genre: item.genres }),
    ...(item.release_date && { datePublished: item.release_date }),
    ...(item.image_url && { image: item.image_url }),
    url,
    ...interaction,
    ...reviewLd,
  };
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;
  const item = await resolveItem(type, slug);
  if (!item) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = await isCurrentUserAdmin();

  // Non-active items (pending/rejected gear) stay private — only the creator and
  // admins may view them.
  const isOwner = !!user && item.created_by === user.id;
  if (item.status !== "active" && !isOwner && !isAdmin) notFound();

  const [stats, votes, reviews] = await Promise.all([
    getItemStats(item.id),
    getVotes(item.id),
    getReviews(item.id),
  ]);
  const [userVote, userReview, favorite] = await Promise.all([
    getUserVote(item.id),
    getUserReview(item.id),
    getFavoriteInfo(item.id),
  ]);

  const recsByType = await Promise.all(
    REC_TYPES.map(async ({ type: recType, label }) => ({
      label,
      items: await getRecommendations(item.id, recType, 3),
    })),
  );
  const hasRecs = recsByType.some((r) => r.items.length > 0);

  const avg =
    stats.avg_x !== null && stats.avg_y !== null
      ? { x: stats.avg_x, y: stats.avg_y }
      : null;
  const placement = describePlacement(stats.avg_x, stats.avg_y);
  const sub = subtitle(item);

  const jsonLd = buildJsonLd(item, slug, stats.vote_count, reviews);

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="flex flex-col gap-8 lg:flex-row">
        {/* Detail column */}
        <div className="flex flex-col gap-5 lg:w-72">
          {item.image_url && (
            <Image
              src={item.image_url}
              alt={`${item.title} ${GEAR_TYPES.includes(item.type) ? "product image" : "cover art"}`}
              width={288}
              height={288}
              className="w-full rounded-xl"
              priority
              unoptimized
            />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
            {sub && <p className="text-zinc-400">{sub}</p>}
          </div>
          {item.description && (
            <p className="whitespace-pre-line text-sm text-zinc-300">{item.description}</p>
          )}
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Type</dt>
              <dd className="capitalize">{item.type}</dd>
            </div>
            {item.type === "song" && item.album && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Album</dt>
                <dd className="text-right">{item.album}</dd>
              </div>
            )}
            {item.genres.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">{item.genres.length > 1 ? "Genres" : "Genre"}</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {item.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200"
                    >
                      {g}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {GEAR_TYPES.includes(item.type) && item.price !== null && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Price</dt>
                <dd>{formatPrice(item.price)}</dd>
              </div>
            )}
            {item.release_date && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Released</dt>
                <dd>{item.release_date}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500">Votes</dt>
              <dd>{stats.vote_count}</dd>
            </div>
          </dl>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Community placement
            </p>
            <p className="mt-1 text-zinc-200">{placement}</p>
          </div>

          {item.status !== "active" && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm">
              <p className="font-medium text-amber-300">
                {item.status === "pending"
                  ? "Awaiting admin approval"
                  : "Rejected by an admin"}
              </p>
              <p className="mt-1 text-amber-200/70">
                {item.status === "pending"
                  ? "This submission isn't public yet. It won't appear in browse or search until approved."
                  : "This submission was rejected and isn't public."}
              </p>
              {isAdmin && item.status === "pending" && (
                <div className="mt-3 flex items-center gap-3">
                  <form action={approveGear.bind(null, item.id, item.type, item.slug)}>
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectGear.bind(null, item.id, item.type, item.slug)}>
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          <FavoriteButton
            itemId={item.id}
            type={item.type}
            slug={item.slug}
            count={favorite.count}
            favorited={favorite.favorited}
            isLoggedIn={!!user}
          />

          {(isOwner || isAdmin) && (
            <div className="flex items-center gap-3 text-sm">
              {/* Gear: editable by owner or admin. Music: admins only. */}
              {(GEAR_TYPES.includes(item.type) || isAdmin) && (
                <>
                  <Link
                    href={`/${item.type}/${item.slug}/edit`}
                    className="text-indigo-400 hover:underline"
                  >
                    Edit
                  </Link>
                  <span className="text-zinc-600">·</span>
                </>
              )}
              <form action={deleteItem.bind(null, item.id, item.type, item.slug)}>
                <button type="submit" className="text-zinc-400 hover:text-red-400">
                  Delete
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Compass + recommendations */}
        <div className="flex flex-1 flex-col gap-8">
          <Compass
            itemId={item.id}
            slug={item.slug}
            type={item.type}
            imageUrl={item.image_url}
            title={item.title}
            votes={votes.map((v) => ({ x: v.x, y: v.y }))}
            avg={avg}
            voteCount={stats.vote_count}
            userVote={userVote ? { x: userVote.x, y: userVote.y } : null}
            isLoggedIn={!!user}
          />

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Sounds similar</h2>
            {!hasRecs ? (
              <p className="text-sm text-zinc-500">
                Not enough votes yet to recommend similar items. Vote on more items to build
                the map.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {recsByType
                  .filter((r) => r.items.length > 0)
                  .map((r) => (
                    <div key={r.label}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {r.label}
                      </h3>
                      <ul className="flex flex-wrap gap-3">
                        {r.items.map((rec) => (
                          <RecCard key={rec.id} rec={rec} />
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <Reviews
            itemId={item.id}
            type={item.type}
            slug={item.slug}
            reviews={reviews}
            userReview={userReview}
            currentUserId={user?.id ?? null}
            isLoggedIn={!!user}
            isAdmin={isAdmin}
          />
        </div>
      </article>
    </AppShell>
  );
}

function RecCard({ rec }: { rec: NearbyItem }) {
  return (
    <li>
      <Link
        href={`/${rec.type}/${rec.slug}`}
        className="flex w-44 items-center gap-2 rounded-lg border border-zinc-800 p-2 hover:bg-zinc-800"
      >
        {rec.image_url ? (
          <Image
            src={rec.image_url}
            alt={`${rec.title} cover`}
            width={40}
            height={40}
            className="rounded"
            unoptimized
          />
        ) : (
          <div className="h-10 w-10 rounded bg-zinc-800" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm">{rec.title}</span>
          <span className="block truncate text-xs text-zinc-400">{rec.artist}</span>
        </span>
      </Link>
    </li>
  );
}
