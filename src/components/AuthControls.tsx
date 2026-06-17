import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/items";
import { logout } from "@/app/actions/auth";

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

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-zinc-400">
        Signed in as <span className="text-zinc-100">{name}</span>
      </span>
      <div className="flex items-center gap-3">
        <Link href="/my-votes" className="text-indigo-400 hover:underline">
          My Votes
        </Link>
        <span className="text-zinc-600">·</span>
        <Link href="/my-favorites" className="text-indigo-400 hover:underline">
          My Favorites
        </Link>
        <span className="text-zinc-600">·</span>
        <Link href="/submit-music" className="text-indigo-400 hover:underline">
          Submit music
        </Link>
        <span className="text-zinc-600">·</span>
        <Link href="/submit-gear" className="text-indigo-400 hover:underline">
          Submit gear
        </Link>
        {isAdmin && (
          <>
            <span className="text-zinc-600">·</span>
            <Link href="/admin" className="text-amber-400 hover:underline">
              Admin
            </Link>
          </>
        )}
        <span className="text-zinc-600">·</span>
        <form action={logout}>
          <button type="submit" className="text-zinc-400 hover:text-zinc-200">
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
