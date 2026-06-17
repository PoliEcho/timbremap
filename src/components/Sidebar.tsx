import Link from "next/link";
import Image from "next/image";
import SearchPanel from "@/components/SearchPanel";
import SidebarList from "@/components/SidebarList";
import AuthControls from "@/components/AuthControls";
import SidebarShell from "@/components/SidebarShell";
import { getBrowseItems, getGenres } from "@/lib/items";

export default async function Sidebar() {
  const [items, genres] = await Promise.all([
    getBrowseItems({ sort: "most_voted", limit: 30 }),
    getGenres(),
  ]);

  return (
    <SidebarShell>
      {/* Scrollable area: logo, search, item list */}
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        <Link href="/" className="hidden md:block">
          <Image
            src="/timbermap-logo.png"
            alt="TimbreMap"
            width={180}
            height={56}
            unoptimized
            priority
            className="h-auto w-40"
          />
        </Link>

        <SearchPanel />

        <SidebarList initialItems={items} genres={genres} />
      </div>

      {/* Pinned, non-scrolling footer */}
      <div className="shrink-0 border-t border-zinc-800 p-5">
        <AuthControls />
      </div>
    </SidebarShell>
  );
}
