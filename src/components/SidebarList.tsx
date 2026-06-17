"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrowseItem, BrowseSort } from "@/lib/types";

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "most_voted", label: "Most voted" },
  { value: "most_liked", label: "Most liked" },
  { value: "most_reviewed", label: "Most reviews" },
  { value: "most_bassy", label: "Most bassy" },
  { value: "most_trebly", label: "Most trebly" },
  { value: "most_technical", label: "Most technical" },
  { value: "most_atmospheric", label: "Most atmospheric" },
];

// Must match the page size the server uses for `initialItems` (Sidebar.tsx).
const PAGE_SIZE = 30;

const selectClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500";

interface SidebarListProps {
  initialItems: BrowseItem[];
  genres: string[];
}

async function fetchPage(
  sort: BrowseSort,
  genre: string,
  offset: number,
): Promise<BrowseItem[]> {
  const params = new URLSearchParams({
    sort,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (genre) params.set("genre", genre);
  const r = await fetch(`/api/browse?${params.toString()}`);
  const json: { items?: BrowseItem[] } = await r.json();
  return json.items ?? [];
}

/** The sidebar's sortable + genre-filterable item list, with infinite scroll. */
export default function SidebarList({ initialItems, genres }: SidebarListProps) {
  const [sort, setSort] = useState<BrowseSort>("most_voted");
  const [genre, setGenre] = useState("");
  const [items, setItems] = useState<BrowseItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Generation token: bumped on every filter change so a slow in-flight
  // page-load can't append rows belonging to a stale sort/genre.
  const genRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset and load page 0 when the controls change.
  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;

    // The default view is already server-rendered in `initialItems`.
    if (sort === "most_voted" && genre === "") {
      setItems(initialItems);
      setHasMore(initialItems.length === PAGE_SIZE);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchPage(sort, genre, 0)
      .then((rows) => {
        if (genRef.current !== gen) return;
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => {
        if (genRef.current === gen) setLoading(false);
      });
  }, [sort, genre, initialItems]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const gen = genRef.current;
    const offset = items.length;
    setLoadingMore(true);
    fetchPage(sort, genre, offset)
      .then((rows) => {
        if (genRef.current !== gen) return;
        setItems((prev) => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => {
        if (genRef.current === gen) setLoadingMore(false);
      });
  }, [items.length, sort, genre, hasMore, loading, loadingMore]);

  // Trigger loadMore as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)!.label;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          aria-label="Sort items"
          value={sort}
          onChange={(e) => setSort(e.target.value as BrowseSort)}
          className={selectClass}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by genre"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className={selectClass}
        >
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {sortLabel}
        {loading && <span className="ml-2 normal-case text-zinc-600">updating…</span>}
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing matches — try another sort or genre, or search above.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/${item.type}/${item.slug}`}
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-zinc-800"
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={`${item.title} cover`}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-zinc-800" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">{item.title}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {item.artist ?? item.manufacturer}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {sort === "most_liked"
                      ? item.like_count > 0 && `♥ ${item.like_count}`
                      : sort === "most_reviewed"
                        ? item.review_count > 0 && `${item.review_count}★`
                        : item.vote_count > 0 && item.vote_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
          {loadingMore && (
            <p className="py-2 text-center text-xs text-zinc-600">loading more…</p>
          )}
        </>
      )}
    </div>
  );
}
