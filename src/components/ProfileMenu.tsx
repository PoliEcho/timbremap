"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

const LINKS = [
  { href: "/my-votes", label: "My Votes" },
  { href: "/my-favorites", label: "My Favorites" },
  { href: "/submit-music", label: "Submit music" },
  { href: "/submit-gear", label: "Submit gear" },
];

/** The signed-in account menu: a single trigger that opens a dropdown of links. */
export default function ProfileMenu({
  name,
  isAdmin,
}: {
  name: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800"
      >
        <span className="min-w-0 truncate text-zinc-400">
          Signed in as <span className="text-zinc-100">{name}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-zinc-500 transition-transform ${open ? "" : "rotate-180"}`}
          aria-hidden
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden border border-zinc-800 bg-zinc-950 shadow-lg"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-indigo-400 hover:bg-zinc-800"
            >
              {l.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-amber-400 hover:bg-zinc-800"
            >
              Admin
            </Link>
          )}
          <form action={logout} className="border-t border-zinc-800">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
