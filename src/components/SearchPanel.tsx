"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { openDeezerItem } from "@/app/actions/vote";
import type { SearchResult } from "@/lib/types";

type SearchMode = "album" | "song" | "gear";

const MODES: { mode: SearchMode; label: string; placeholder: string }[] = [
  { mode: "album", label: "Albums", placeholder: "Search albums…" },
  { mode: "song", label: "Songs", placeholder: "Search songs…" },
  { mode: "gear", label: "Gear", placeholder: "Search submitted gear…" },
];

export default function SearchPanel() {
  const [mode, setMode] = useState<SearchMode>("album");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();

    const handle = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&type=${mode}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as { results: SearchResult[] };
        setResults(json.results ?? []);
      } catch {
        /* aborted or network error — ignore */
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, mode]);

  const placeholder = MODES.find((m) => m.mode === mode)!.placeholder;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => setMode(m.mode)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              mode === m.mode
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-indigo-500"
      />

      {loading && <p className="text-sm text-zinc-500">Searching…</p>}

      {mode === "gear" && !loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-zinc-500">
          No gear found.{" "}
          <Link href="/submit-gear" className="text-indigo-400 hover:underline">
            Submit it
          </Link>
          .
        </p>
      )}

      {(mode === "album" || mode === "song") &&
        !loading &&
        query.trim().length >= 2 &&
        results.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nothing found.{" "}
            <Link href="/submit-music" className="text-indigo-400 hover:underline">
              Submit it manually
            </Link>
            .
          </p>
        )}

      <ul className="flex flex-col gap-1">
        {results.map((r) => (
          <li key={`${r.source}-${r.externalId}`}>
            {r.source === "local" && r.slug ? (
              <Link
                href={`/${r.type}/${r.slug}`}
                className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-zinc-800"
              >
                <ResultBody r={r} />
              </Link>
            ) : (
              <form action={openDeezerItem.bind(null, r.type, r.externalId)}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-zinc-800"
                >
                  <ResultBody r={r} />
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultBody({ r }: { r: SearchResult }) {
  return (
    <>
      {r.imageUrl ? (
        <Image
          src={r.imageUrl}
          alt={`${r.title} cover`}
          width={44}
          height={44}
          className="rounded"
          unoptimized
        />
      ) : (
        <div className="h-11 w-11 rounded bg-zinc-800" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm text-zinc-100">{r.title}</span>
        <span className="block truncate text-xs text-zinc-400">{r.artist}</span>
      </span>
    </>
  );
}
