"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, signInWithGoogle } from "../../lib/auth-client";
import { BookmarkIcon, CheckIcon, XIcon } from "./icons";

export default function SaveArticleButton({ articleId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const [saved, setSaved] = useState(false);
  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState(false);

  const isSignedIn = !!session?.user && !session.user.isAnonymous;
  // Set when the user clicked Save while anonymous and came back from Google sign-in
  const pendingSave = searchParams.get("save") === "1";

  useEffect(() => {
    if (!isSignedIn || !articleId) return;

    const request = pendingSave
      ? fetch("/api/save-article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId }),
        }).then((res) => ({ saved: res.ok }))
      : fetch(`/api/save-article?articleId=${articleId}`).then((res) => res.json());

    request
      .then((data) => setSaved(!!data.saved))
      .catch((err) => console.error("Failed to check saved status:", err))
      .finally(() => {
        setChecked(true);
        if (pendingSave) router.replace(`/article/${articleId}`, { scroll: false });
      });
  }, [articleId, isSignedIn, pendingSave, router]);

  const handleToggle = async () => {
    // Saving needs an account: sign in, then come back and finish the save.
    // The article moves to the new account during sign-in.
    if (!isSignedIn) {
      setWorking(true);
      await signInWithGoogle(`/article/${articleId}?save=1`);
      return;
    }

    setWorking(true);

    // Optimistic update
    const nextSaved = !saved;
    setSaved(nextSaved);

    try {
      const res = await fetch(
        `/api/save-article${nextSaved ? "" : `?articleId=${articleId}`}`,
        nextSaved
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ articleId }),
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

  const loading = isPending || (isSignedIn && !checked);

  if (loading) {
    return (
      <div className="w-[104px] h-[34px] rounded-lg bg-subtle animate-pulse flex-shrink-0" />
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={working}
      title={
        !isSignedIn ? "Sign in with Google to save this article" : saved ? "Remove from saved articles" : "Save this article"
      }
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
          {isSignedIn ? "Save" : "Sign in to save"}
        </>
      )}
    </button>
  );
}
