"use client";

import { useState, useEffect } from "react";
import { getUserId } from "../../lib/getUserId";

export default function SaveArticleButton({ articleId }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const userId = getUserId();
    if (!userId || !articleId) {
      setLoading(false);
      return;
    }

    fetch(`/api/save-article?userId=${userId}&articleId=${articleId}`)
      .then((res) => res.json())
      .then((data) => setSaved(!!data.saved))
      .catch((err) => console.error("Failed to check saved status:", err))
      .finally(() => setLoading(false));
  }, [articleId]);

  const handleToggle = async () => {
    const userId = getUserId();
    setWorking(true);

    // Optimistic update
    const nextSaved = !saved;
    setSaved(nextSaved);

    try {
      const res = await fetch(
        `/api/save-article${nextSaved ? "" : `?userId=${userId}&articleId=${articleId}`}`,
        nextSaved
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, articleId }),
            }
          : { method: "DELETE" }
      );

      if (!res.ok) throw new Error("Toggle failed");
    } catch (err) {
      console.error("Failed to toggle saved state:", err);
      setSaved(!nextSaved); // revert on failure
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="w-24 h-9 rounded-lg bg-gray-800 animate-pulse flex-shrink-0" />
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={working}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 disabled:opacity-50 ${
        saved
          ? "bg-gray-700 text-gray-300 hover:bg-red-900 hover:text-red-200 cursor-pointer"
          : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
      }`}
    >
      {saved ? "Saved ✓" : "Save Article"}
    </button>
  );
}