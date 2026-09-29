"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "../../lib/auth-client";
import { BookmarkIcon, XIcon } from "./icons";

export default function RecentArticles() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user && !session.user.isAnonymous ? session.user.id : null;
  // Tagged with the user it was fetched for, so a sign-in/out never shows a stale list
  const [fetched, setFetched] = useState({ userId: null, articles: [] });

  useEffect(() => {
    if (!userId) return;
    fetch("/api/recent-articles")
      .then((res) => res.json())
      .then((data) => setFetched({ userId, articles: data.articles ?? [] }))
      .catch((err) => {
        console.error("Failed to load recent articles:", err);
        setFetched({ userId, articles: [] });
      });
  }, [userId]);

  const loading = isPending || (userId !== null && fetched.userId !== userId);
  const articles = userId && fetched.userId === userId ? fetched.articles : [];

  const handleRemove = async (articleId) => {
    // Optimistic update — remove from UI immediately
    setFetched((prev) => ({ ...prev, articles: prev.articles.filter((a) => a.articleId !== articleId) }));

    try {
      const res = await fetch(
        `/api/save-article?articleId=${articleId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Unsave failed");
    } catch (err) {
      console.error("Failed to remove article:", err);
      // Could re-fetch here to resync on failure, but leaving it
      // removed client-side is fine for a low-stakes list entry
    }
  };

  if (loading) {
    return (
      <div className="mt-12 w-full animate-pulse">
        <div className="h-3 w-28 rounded bg-subtle mb-4" />
        <div className="card divide-y divide-line">
          {[48, 64, 40].map((w) => (
            <div key={w} className="px-4 py-3.5">
              <div className="h-3 rounded bg-subtle" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!articles.length) return null;

  return (
    <div className="mt-12 w-full">
      <h2 className="label mb-3">Saved articles</h2>
      <ul className="card divide-y divide-line overflow-hidden">
        {articles.map((article) => (
          <li
            key={article.articleId}
            className="flex items-center justify-between group hover:bg-subtle/60 transition-colors"
          >
            <Link
              href={`/article/${article.articleId}`}
              className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 text-sm text-ink"
            >
              <BookmarkIcon size={15} className="text-ink-faint group-hover:text-accent transition-colors" />
              <span className="truncate">{article.title}</span>
            </Link>
            <button
              onClick={() => handleRemove(article.articleId)}
              className="btn btn-ghost btn-icon mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
              aria-label={`Remove ${article.title}`}
              title="Remove from saved"
            >
              <XIcon size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
