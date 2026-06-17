"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

/**
 * Responsive shell around the sidebar. On desktop the sidebar is a static
 * left column; on mobile it collapses behind a hamburger button and slides in
 * as an overlay drawer.
 */
export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (e.g. picking an item).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4 md:hidden">
        <Link href="/">
          <Image
            src="/timbermap-logo.png"
            alt="TimbreMap"
            width={140}
            height={44}
            unoptimized
            priority
            className="h-auto w-32"
          />
        </Link>
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="p-2 text-zinc-100"
        >
          {open ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar / mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85%] flex-col border-r border-zinc-800 bg-background transition-transform duration-200 md:static md:z-auto md:h-screen md:max-w-none md:translate-x-0 md:bg-transparent lg:w-96 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {children}
      </aside>
    </>
  );
}
