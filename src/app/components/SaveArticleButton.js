"use client";

import { useState, useEffect } from "react";
import { getUserId } from "../../lib/getUserId";
import { BookmarkIcon, CheckIcon, XIcon } from "./icons";

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
      <div className="w-[104px] h-[34px] rounded-lg bg-subtle animate-pulse flex-shrink-0" />
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={working}
      title={saved ? "Remove from saved articles" : "Save this article"}
      className={`group btn flex-shrink-0 ${
        saved ? "btn-secondary hover:bg-danger-soft hover:text-danger hover:border-danger/30" : "btn-primary"
      }`}
    >
      {saved ? (
        <>
          <CheckIcon size={15} className="group-hover:hidden" />
          <XIcon size={15} className="hidden group-hover:block" />
          <span className="group-hover:hidden">Saved</span>
          <span className="hidden group-hover:inline">Unsave</span>
        </>
      ) : (
        <>
          <BookmarkIcon size={15} />
          Save
        </>
      )}
    </button>
  );
}
