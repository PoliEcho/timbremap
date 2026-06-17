import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import GearForm from "@/components/GearForm";
import MusicForm from "@/components/MusicForm";
import { getItemBySlug, isCurrentUserAdmin } from "@/lib/items";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Edit item",
  robots: { index: false, follow: false },
};

const GEAR_TYPES = ["headphones", "iem", "speaker"];
const MUSIC_TYPES = ["album", "song"];

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const item = await getItemBySlug(slug);
  const isAdmin = await isCurrentUserAdmin();
  if (!item || item.type !== type) notFound();

  const isGear = GEAR_TYPES.includes(item.type);
  const isMusic = MUSIC_TYPES.includes(item.type);
  // Gear: the creator or an admin may edit. Music: admins only.
  const canEdit = isGear ? item.created_by === user.id || isAdmin : isMusic && isAdmin;
  if (!canEdit) notFound();

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Edit {item.title}</h1>
        {isGear ? (
          <GearForm initial={item} showDescription={isAdmin} />
        ) : (
          <MusicForm initial={item} showDescription={isAdmin} />
        )}
      </div>
    </AppShell>
  );
}
