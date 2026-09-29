"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "../../lib/auth-client";
import { LibraryIcon, LockIcon, SearchIcon, SettingsIcon } from "./icons";

const TABS = [
  { href: "/", label: "Search", Icon: SearchIcon },
  { href: "/library", label: "My articles", Icon: LibraryIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

// Each tab is its own route, so back/forward, bookmarks and sign-in redirects
// land on the right one. My articles stays open to anonymous visitors (they
// can see this browser session's recent articles) but shows it needs sign-in to save.
export default function HomeTabs() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !!session?.user && !session.user.isAnonymous;

  return (
    <nav aria-label="Sections" className="flex rounded-xl bg-subtle p-1">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        const locked = href === "/library" && !isPending && !signedIn;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={locked ? "Sign in to save articles" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08)]"
                : locked
                ? "text-ink-faint hover:text-ink-muted"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon size={15} className="hidden sm:block" />
            {label}
            {locked && <LockIcon size={12} className="text-ink-faint" />}
          </Link>
        );
      })}
    </nav>
  );
}
