import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MusicForm from "@/components/MusicForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Submit music",
  robots: { index: false, follow: false },
};

export default async function SubmitMusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submit an album or song</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Can&apos;t find it via search? Add it by hand. Submissions are reviewed by an
            admin before they go public — once approved, anyone can place it on the compass.
          </p>
        </div>
        <MusicForm />
      </div>
    </AppShell>
  );
}
