import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/items";
import ProfileMenu from "@/components/ProfileMenu";

export default async function AuthControls() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link href="/login" className="text-indigo-400 hover:underline">
          Log in
        </Link>
        <span className="text-zinc-600">·</span>
        <Link href="/register" className="text-indigo-400 hover:underline">
          Register
        </Link>
      </div>
    );
  }

  const name =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "you";

  const isAdmin = await isCurrentUserAdmin();

  return <ProfileMenu name={name} isAdmin={isAdmin} />;
}
