"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUserId } from "../../lib/getUserId";

export default function RecentArticles() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const id = getUserId();
    setUserId(id);
    if (!id) {
      setLoading(false);
      return;
    }

    fetch(`/api/recent-articles?userId=${id}`)
      .then((res) => res.json())
      .then((data) => setArticles(data.articles ?? []))
      .catch((err) => console.error("Failed to load recent articles:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (articleId) => {
    // Optimistic update — remove from UI immediately
    setArticles((prev) => prev.filter((a) => a.articleId !== articleId));

    try {
      const res = await fetch(
        `/api/save-article?userId=${userId}&articleId=${articleId}`,
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
      <div className="mt-8 w-full max-w-xl animate-pulse space-y-2">
        <div className="h-3 w-32 bg-gray-800 rounded" />
        <div className="h-3 w-48 bg-gray-800 rounded" />
        <div className="h-3 w-40 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!articles.length) return null;

  return (
    <div className="mt-8 w-full max-w-xl">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Saved Articles
      </h2>
      <ul className="space-y-2">
        {articles.map((article) => (
          <li
            key={article.articleId}
            className="flex items-center justify-between group"
          >
            <Link
              href={`/article/${article.articleId}`}
              className="text-gray-200 hover:text-white hover:underline transition-colors"
            >
              {article.title}
            </Link>
            <button
              onClick={() => handleRemove(article.articleId)}
              className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-2"
              aria-label={`Remove ${article.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}