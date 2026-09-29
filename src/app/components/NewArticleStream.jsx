"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clearPendingArticle, peekPendingArticle } from "../../lib/pendingArticle";
import { readNdjson } from "../../lib/readNdjson";
import ArticleView from "./ArticleView";

const EMPTY_ARTICLE = { title: "", sections: [] };

function Notice({ title, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      <div className="mt-2 max-w-md text-sm text-ink-muted">{children}</div>
    </div>
  );
}

// Writes a new article in front of the reader: streams it into the normal
// article layout (read-only), then swaps in the real, interactive article and
// moves the URL to /article/[id] without a reload.
export default function NewArticleStream({ pendingId }) {
  // Read-only here (StrictMode may call initializers twice); cleared once started
  const [request] = useState(() => peekPendingArticle(pendingId));
  const [state, setState] = useState({ status: "writing", article: EMPTY_ARTICLE });
  const [attempt, setAttempt] = useState(0);
  const startedAttempt = useRef(-1);

  useEffect(() => {
    // Refs survive StrictMode's simulated remount, so this runs once per attempt.
    // The request isn't aborted on unmount: the server finishes and saves the
    // article anyway, and it shows up in My articles.
    if (!request || startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    clearPendingArticle(pendingId);

    const apply = (update) => setState((prev) => ({ ...prev, article: update(prev.article) }));

    (async () => {
      const res = await fetch("/api/create-user-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Couldn't write the article");
      }

      let finished = false;
      await readNdjson(res, (event) => {
        if (event.t === "start") {
          apply((a) => ({ ...a, sourceTopics: event.sourceTopics, level: event.level, images: event.images }));
        } else if (event.t === "title") {
          apply((a) => ({ ...a, title: event.title }));
        } else if (event.t === "section") {
          apply((a) => {
            const sections = [...a.sections];
            sections[event.i] = event.section;
            return { ...a, sections: sections.map((s) => s ?? { heading: "", content: "" }) };
          });
        } else if (event.t === "done") {
          finished = true;
          // Next's router picks this up, so back/refresh behave like a normal article page
          window.history.replaceState(null, "", `/article/${event.articleId}`);
          setState({ status: "done", article: event.article, articleId: event.articleId });
        } else if (event.t === "error") {
          throw new Error(event.message);
        }
      });
      if (!finished) throw new Error("The article was cut off before it finished.");
    })().catch((err) => {
      console.error("Article stream failed:", err);
      setState((prev) => ({ ...prev, status: "error", message: err.message }));
    });
  }, [request, pendingId, attempt]);

  if (!request) {
    return (
      <Notice title="This article isn't being written anymore">
        <p>
          It may have been interrupted by a reload. If it finished, you&apos;ll find it in{" "}
          <Link href="/library" className="font-medium text-accent hover:underline">
            My articles
          </Link>
          .
        </p>
        <Link href="/" className="btn btn-secondary mt-5">
          Back to search
        </Link>
      </Notice>
    );
  }

  if (state.status === "error") {
    return (
      <Notice title="Something went wrong while writing this article">
        <p>{state.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => {
              setState({ status: "writing", article: EMPTY_ARTICLE });
              setAttempt((n) => n + 1);
            }}
            className="btn btn-primary"
          >
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to search
          </Link>
        </div>
      </Notice>
    );
  }

  if (state.status === "done") {
    // A fresh mount (new key), so the interactive view starts its history from the final article
    return <ArticleView key={state.articleId} article={state.article} articleId={state.articleId} />;
  }

  return <ArticleView key="writing" article={state.article} writing />;
}
