"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient, signInWithGoogle } from "../../lib/auth-client";
import { LibraryIcon, LogOutIcon, SettingsIcon, UserIcon } from "./icons";

function Avatar({ user, size = 28 }) {
  if (user.image) {
    return (
      // Google profile photo; plain img since it's tiny and from an external host
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full bg-subtle"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink"
      style={{ width: size, height: size }}
    >
      {(user.name || user.email || "?").charAt(0).toUpperCase()}
    </span>
  );
}

// Top-right identity + session menu. Everything configurable lives in Settings.
export default function AccountButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isPending) {
    return <div className="h-[34px] w-20 rounded-lg bg-subtle animate-pulse" />;
  }

  const user = session?.user;

  if (!user || user.isAnonymous) {
    return (
      <button onClick={() => signInWithGoogle(pathname)} className="btn btn-secondary">
        <UserIcon size={15} />
        Sign in
      </button>
    );
  }

  const handleSignOut = async () => {
    setOpen(false);
    await authClient.signOut();
    router.refresh();
  };

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex cursor-pointer items-center rounded-full p-0.5 ring-accent/40 hover:ring-2 focus-visible:outline-none focus-visible:ring-2"
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-2 w-64 p-1.5 shadow-lg">
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user.name || "Signed in"}</p>
              <p className="truncate text-xs text-ink-faint">{user.email}</p>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link href="/library" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <LibraryIcon size={15} />
            My articles
          </Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <SettingsIcon size={15} />
            Settings
          </Link>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" onClick={handleSignOut} className={itemClass}>
            <LogOutIcon size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
