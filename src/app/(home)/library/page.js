"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient, signInWithGoogle } from "../../../lib/auth-client";
import { levelLabel } from "../../../lib/explanationLevels";
import {
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  LockIcon,
  SearchIcon,
  SpinnerIcon,
  XIcon,
} from "../../components/icons";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNSAVED_TTL_MS = 7 * DAY_MS; // mirrors CACHE_TTL_SECONDS in lib/cache.js

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function timeAgo(ms) {
  const minutes = Math.round((ms - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
  return relativeFormat.format(Math.round(hours / 24), "day");
}

function formatDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function expiryText(expiresAt) {
  const days = Math.ceil((expiresAt - Date.now()) / DAY_MS);
  return days <= 1 ? "Expires within a day" : `Expires in ${days} days`;
}

function LevelBadge({ level }) {
  return (
    <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">{levelLabel(level)}</span>
  );
}

// Visits newest first, each with the edits made during it, then the creation.
// Restoring a version happens on the article page (Previous sessions).
function ArticleHistory({ articleId }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/article-history?articleId=${encodeURIComponent(articleId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => !cancelled && setState({ status: "ready", ...data }))
      .catch((err) => {
        console.error("Failed to load article history:", err);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 px-4 pb-4 text-sm text-ink-faint">
        <SpinnerIcon size={14} /> Loading history…
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="px-4 pb-4 text-sm text-danger">Couldn&apos;t load the history.</p>;
  }

  const { sessions, createdAt } = state;

  return (
    <div className="px-4 pb-4">
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-faint">No edits yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-line pl-4">
          {sessions.map((s) => (
            <li key={s.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line-strong" />
              <p className="text-xs font-medium text-ink-muted">{formatDateTime(s.endedAt)}</p>
              {s.steps.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {s.steps.map((step, i) => (
                    <li key={i} className="truncate text-sm text-ink" title={step}>
                      {step}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-faint">Edited (details weren&apos;t recorded for this visit)</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {createdAt ? <p className="text-xs text-ink-faint">Created {formatDateTime(createdAt)}</p> : <span />}
        <Link href={`/article/${articleId}`} className="text-xs font-medium text-accent hover:underline">
          Open to restore a version →
        </Link>
      </div>
    </div>
  );
}

function RecentRow({ article, signedIn, onSave }) {
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(article);
    setSaving(false);
  };

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/article/${article.articleId}`} className="group min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink group-hover:text-accent">{article.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
            <span>Opened {timeAgo(article.openedAt)}</span>
            <LevelBadge level={article.level} />
            {article.saved ? (
              <span className="flex items-center gap-1 text-success">
                <CheckIcon size={12} /> Saved
              </span>
            ) : article.expiresAt && signedIn ? (
              <span className="text-warning">{expiryText(article.expiresAt)}</span>
            ) : null}
          </p>
        </Link>
        {signedIn && !article.saved && (
          <button onClick={handleSave} disabled={saving} className="btn btn-secondary px-2.5 py-1 text-xs">
            <BookmarkIcon size={13} />
            Save
          </button>
        )}
        <button
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="btn btn-ghost px-2 py-1 text-xs"
        >
          <ClockIcon size={14} />
          <span className="hidden sm:inline">History</span>
          <ChevronDownIcon size={13} className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>
      </div>
      {showHistory && <ArticleHistory articleId={article.articleId} />}
    </li>
  );
}

function SignInToSave() {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-ink-faint">
        <LockIcon size={18} />
      </span>
      <p className="text-sm font-medium text-ink">Sign in to save articles</p>
      <p className="mt-1 max-w-sm text-sm text-ink-faint">
        Saved articles are kept until you remove them, and you can open them from any device.
      </p>
      <button onClick={() => signInWithGoogle("/library")} className="btn btn-primary mt-4">
        Sign in with Google
      </button>
    </div>
  );
}

function SavedList({ articles, onUnsave }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("saved");

  if (articles.length === 0) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-sm font-medium text-ink">No saved articles yet</p>
        <p className="mt-1 text-sm text-ink-faint">Use Save on any article to keep it here.</p>
      </div>
    );
  }

  const needle = filter.trim().toLowerCase();
  const shown = articles
    .filter((a) => !needle || a.title.toLowerCase().includes(needle))
    .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : 0)); // "saved" keeps list order

  return (
    <>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            className="input py-1.5 pl-9 text-sm"
            placeholder="Filter saved articles"
            aria-label="Filter saved articles"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort saved articles"
          className="input w-auto cursor-pointer py-1.5 text-sm"
        >
          <option value="saved">Recently saved</option>
          <option value="title">A–Z</option>
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="px-1 text-sm text-ink-faint">No saved articles match “{filter.trim()}”.</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((article) => (
            <li key={article.articleId} className="group flex items-center hover:bg-subtle/60 transition-colors">
              <Link
                href={`/article/${article.articleId}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-sm text-ink"
              >
                <BookmarkIcon size={15} className="text-ink-faint group-hover:text-accent transition-colors" />
                <span className="truncate">{article.title}</span>
                <LevelBadge level={article.level} />
              </Link>
              <button
                onClick={() => onUnsave(article)}
                className="btn btn-ghost btn-icon mr-2 hover:text-danger focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                aria-label={`Remove ${article.title} from saved`}
                title="Remove from saved"
              >
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ListSkeleton({ rows = 3 }) {
  return (
    <div className="card divide-y divide-line animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-4 py-4">
          <div className="h-3 rounded bg-subtle" style={{ width: `${[55, 40, 65][i % 3]}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user ?? null;
  const signedIn = !!user && !user.isAnonymous;
  const userId = user?.id ?? null;
  // Tagged with the user it was fetched for, so a sign-in/out never shows a stale list
  const [fetched, setFetched] = useState({ userId: null, recent: [], saved: [] });

  useEffect(() => {
    if (!userId) return;
    fetch("/api/my-articles")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => setFetched({ userId, recent: data.recent ?? [], saved: data.saved ?? [] }))
      .catch((err) => {
        console.error("Failed to load my articles:", err);
        setFetched({ userId, recent: [], saved: [] });
      });
  }, [userId]);

  const loading = isPending || (userId !== null && fetched.userId !== userId);
  const recent = userId && fetched.userId === userId ? fetched.recent : [];
  const saved = userId && fetched.userId === userId ? fetched.saved : [];

  const handleSave = async (article) => {
    try {
      const res = await fetch("/api/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.articleId }),
      });
      if (!res.ok) throw new Error("Save failed");
      setFetched((prev) => ({
        ...prev,
        recent: prev.recent.map((a) => (a.articleId === article.articleId ? { ...a, saved: true, expiresAt: null } : a)),
        saved: [{ ...article, saved: true, expiresAt: null }, ...prev.saved],
      }));
    } catch (err) {
      console.error("Failed to save article:", err);
    }
  };

  const handleUnsave = async (article) => {
    // Optimistic — unsaving is low-stakes and the article stays openable for 7 days
    setFetched((prev) => ({
      ...prev,
      saved: prev.saved.filter((a) => a.articleId !== article.articleId),
      recent: prev.recent.map((a) =>
        a.articleId === article.articleId ? { ...a, saved: false, expiresAt: Date.now() + UNSAVED_TTL_MS } : a
      ),
    }));
    try {
      const res = await fetch(`/api/save-article?articleId=${encodeURIComponent(article.articleId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Unsave failed");
    } catch (err) {
      console.error("Failed to unsave article:", err);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">My articles</h1>

      {!isPending && user?.isAnonymous && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            You&apos;re not signed in. Your articles disappear when you close your browser.
          </p>
          <button onClick={() => signInWithGoogle("/library")} className="btn btn-secondary flex-shrink-0">
            Sign in to keep them
          </button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="label mb-3">Recently opened</h2>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : recent.length === 0 ? (
          <div className="card px-6 py-8 text-center">
            <p className="text-sm text-ink-faint">
              Nothing opened yet.{" "}
              <Link href="/" className="font-medium text-accent hover:underline">
                Search for a topic
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {recent.map((article) => (
              <RecentRow key={article.articleId} article={article} signedIn={signedIn} onSave={handleSave} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="label mb-3">Saved</h2>
        {loading ? <ListSkeleton /> : signedIn ? <SavedList articles={saved} onUnsave={handleUnsave} /> : <SignInToSave />}
      </section>
    </div>
  );
}
