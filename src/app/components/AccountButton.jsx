"use client";

import { useRouter } from "next/navigation";
import { authClient, signInWithGoogle } from "../../lib/auth-client";
import { LogOutIcon, UserIcon } from "./icons";

export default function AccountButton() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="h-[34px] w-20 rounded-lg bg-subtle animate-pulse" />;
  }

  const user = session?.user;

  if (!user || user.isAnonymous) {
    return (
      <button onClick={() => signInWithGoogle("/")} className="btn btn-secondary">
        <UserIcon size={15} />
        Sign in
      </button>
    );
  }

  const handleSignOut = async () => {
    await authClient.signOut();
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline max-w-[12rem] truncate text-sm text-ink-muted" title={user.email}>
        {user.name || user.email}
      </span>
      <button onClick={handleSignOut} className="btn btn-ghost btn-icon" aria-label="Sign out" title="Sign out">
        <LogOutIcon size={16} />
      </button>
    </div>
  );
}
