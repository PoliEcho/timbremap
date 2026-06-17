"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrowseItem, BrowseSort } from "@/lib/types";

// Must match the page size the home page uses for `initialItems` (page.tsx).
const PAGE_SIZE = 48;

interface BrowseGridProps {
  initialItems: BrowseItem[];
  sort: BrowseSort;
  genre: string;
  type: string;
}

async function fetchPage(
  sort: BrowseSort,
  genre: string,
  type: string,
  offset: number,
): Promise<BrowseItem[]> {
  const params = new URLSearchParams({
    sort,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (genre) params.set("genre", genre);
  if (type) params.set("type", type);
  const r = await fetch(`/api/browse?${params.toString()}`);
  const json: { items?: BrowseItem[] } = await r.json();
  return json.items ?? [];
}

/** The home browse grid with infinite scroll. First page is server-rendered. */
export default function BrowseGrid({ initialItems, sort, genre, type }: BrowseGridProps) {
  const [items, setItems] = useState<BrowseItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Filter changes navigate (server re-render) and remount this component, so
  // the only async work here is appending later pages of the current filter.
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const offset = items.length;
    setLoadingMore(true);
    fetchPage(sort, genre, type, offset)
      .then((rows) => {
        setItems((prev) => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [items.length, sort, genre, type, hasMore, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <BrowseCard key={item.id} item={item} />
        ))}
      </ul>
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
      {loadingMore && <p className="py-4 text-center text-sm text-zinc-500">loading more…</p>}
    </>
  );
}

function BrowseCard({ item }: { item: BrowseItem }) {
  return (
    <li>
      <Link
        href={`/${item.type}/${item.slug}`}
        className="flex h-full flex-col gap-2 rounded-xl border border-zinc-800 p-3 hover:bg-zinc-800"
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={`${item.title} cover`}
            width={300}
            height={300}
            className="aspect-square w-full rounded-lg object-cover"
            unoptimized
          />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-zinc-800" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
          <p className="truncate text-xs text-zinc-400">
            {item.artist ?? item.manufacturer ?? <span className="capitalize">{item.type}</span>}
          </p>
        </div>
        <div className="mt-auto flex items-center gap-3 text-xs text-zinc-500">
          <span>{item.vote_count} votes</span>
          {item.like_count > 0 && <span>♥ {item.like_count}</span>}
        </div>
      </Link>
    </li>
  );
}
