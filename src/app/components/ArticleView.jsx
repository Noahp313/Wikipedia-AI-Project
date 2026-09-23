"use client";

import { useEffect, useRef, useState } from "react";
import { slugify } from "../../lib/slugify";
import Link from "next/link";
import SaveArticleButton from "./SaveArticleButton";
import { updateArticleAction } from "../../lib/actions/updateArticle";

function BackButton() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
    >
      ← Back to search
    </Link>
  );
}

function sourceStatusStyle(status) {
  switch (status) {
    case "source":
      return { label: "Source", color: "bg-green-500" };
    case "hybrid":
      return { label: "Hybrid", color: "bg-yellow-500" };
    case "generated":
      return { label: "Generated", color: "bg-red-500" };
    default:
      return { label: "Unknown", color: "bg-gray-500" };
  }
}

function TableOfContents({ sections }) {
  return (
    <nav>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Contents
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {sections.map((s) => {
          const slug = slugify(s.heading);
          return (
            <li key={slug}>
              <a
                href={`#${slug}`}
                className="text-sm text-gray-300 hover:text-blue-400 transition-colors block"
              >
                {s.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UsedTopics({ topics }) {
  if (!topics || topics.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Used Topics
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {topics.map((topic) => (
          <li key={topic} className="text-sm text-gray-300">
            {topic}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sources({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Sources
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {sources.map((s) => (
          <li key={s.topic} className="text-sm">
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-blue-400 transition-colors underline decoration-gray-600 hover:decoration-blue-400 underline-offset-2"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UndoRedoControls({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last change"
        aria-label="Undo last change"
        className="flex-1 px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-300"
      >
        ↶ Undo
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo last undone change"
        aria-label="Redo last undone change"
        className="flex-1 px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-300"
      >
        Redo ↷
      </button>
    </div>
  );
}

function EditHistory({ history, historyIndex, onJump }) {
  if (!history || history.length <= 1) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Edit History
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {history.map((entry, i) => {
          const isCurrent = i === historyIndex;
          return (
            <li key={entry.timestamp}>
              <button
                onClick={() => onJump(i)}
                title={entry.label}
                className={`block w-full text-left text-sm truncate transition-colors ${
                  isCurrent ? "text-blue-400 font-semibold" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {i === 0 ? "Original article" : entry.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ArticleBody({ article, articleId, highlightedHeadings = [] }) {
  return (
    <article className="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-gray-700 pb-4 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">{article.title}</h1>
        <SaveArticleButton articleId={articleId} />
      </div>

      {article.sections.map((s) => {
        const slug = slugify(s.heading);
        const { label, color } = sourceStatusStyle(s.sourceStatus);
        const isChanged = highlightedHeadings.includes(s.heading);

        return (
          <section
            id={slug}
            key={slug}
            className={`mb-8 scroll-mt-10 rounded-md transition-colors duration-1000 ${
              isChanged ? "bg-blue-500/10 ring-1 ring-blue-500/40 p-3 -m-3" : ""
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <h2 className={`text-2xl ${isChanged ? "font-bold text-blue-100" : "font-semibold"}`}>
                {s.heading}
                {isChanged && (
                  <span className="ml-2 align-middle text-xs font-normal text-blue-400">Updated</span>
                )}
              </h2>
              <span className={`w-2 h-2 rounded-full ${color}`} title={label} />
            </div>
            <p className="text-gray-200 leading-relaxed whitespace-pre-line">{s.content}</p>
          </section>
        );
      })}
    </article>
  );
}

function ChatMessage({ role, content }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-700 text-gray-100"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function ArticleChatPanel({ articleId, article, onArticleUpdate, onMinimize }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const detectRelevance = async ({ query, usedTopics, history, currentTopic }) => {
    const res = await fetch("/api/chatbot-detect-relevance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, usedTopics, history, currentTopic }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "detect-relevance request failed");
    }

    return res.json(); // { relevantSections, chatContextStatus }
  };

  const getAnswer = async ({ query, history, relevantSections, chatContextStatus, currentArticle }) => {
    const res = await fetch("/api/chatbot-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, history, relevantSections, chatContextStatus, currentArticle }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "chatbot-answer request failed");
    }

    return res.json(); // { answer, article, articleChanged }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError(null);

    const historyForCall = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);

    // sourceTopics as of this turn; may get extended below if new topics are processed
    let usedTopics = article.sourceTopics;
    let topicsExtended = false;

    try {
      const newTopicRes = await fetch("/api/identify-new-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sourceTopics: article.sourceTopics,
        }),
      });

      if (!newTopicRes.ok) {
        const err = await newTopicRes.json();
        throw new Error(err.error || "Explain request failed");
      }

      const { newTopicNecessary, newTopics } = await newTopicRes.json();

      if (newTopicNecessary) {
        console.log("New topic needed:", newTopics);

        try {
          const res = await fetch("/api/process-topics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topics: newTopics }),
          });

          if (!res.ok && res.status !== 207) {
            throw new Error(`process-topics failed: ${res.status}`);
          }

          const { processed } = await res.json();

          const failed = processed.filter((p) => p.status === "error");
          const succeeded = processed.filter((p) => p.status !== "error");

          if (failed.length > 0) {
            console.warn("Some topics failed to process:", failed);
            const failedNames = failed.map((f) => f.topic).join(", ");
            setError(`Couldn't fully process: ${failedNames}`);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `I ran into trouble looking into ${failedNames}. The rest of your answer may be incomplete — feel free to ask again.`,
              },
            ]);
          }

          if (succeeded.length > 0) {
            const newTopicNames = succeeded.map((p) => p.topic);
            usedTopics = [...usedTopics, ...newTopicNames];
            topicsExtended = true;
          }
        } catch (err) {
          console.error("Failed to process new topics:", err);
          setError(err.message);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "I couldn't look into that topic further, but here's what I have so far." },
          ]);
        }
      }

      // Relevance detection against whatever topics are in play now
      let relevantSections = [];
      let chatContextStatus = "no-relevant-sections";

      try {
        const relevance = await detectRelevance({
          query: trimmed,
          usedTopics,
          history: historyForCall,
          currentTopic: article.title,
        });
        relevantSections = relevance.relevantSections;
        chatContextStatus = relevance.chatContextStatus;
      } catch (err) {
        console.error("Relevance detection failed:", err);
        setError(err.message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong while figuring out what's relevant. Please try again." },
        ]);
        // Still record the newly-pulled-in topic even though the rest of the turn failed.
        if (topicsExtended) {
          onArticleUpdate(
            { ...article, sourceTopics: usedTopics },
            { changedHeadings: [], label: trimmed }
          );
        }
        return;
      }

      // Answer the question and apply any article edits — but only push a new
      // history entry when something actually changed (a content edit, or a
      // new topic pulled in), so pure Q&A turns don't create empty history
      // steps or trigger a redundant Redis write.
      try {
        const { answer, article: updatedArticle, articleChanged, changedHeadings } = await getAnswer({
          query: trimmed,
          history: historyForCall,
          relevantSections,
          chatContextStatus,
          currentArticle: article,
        });

        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);

        if (articleChanged) {
          onArticleUpdate(
            { ...updatedArticle, sourceTopics: usedTopics },
            { changedHeadings: changedHeadings || [], label: trimmed }
          );
        } else if (topicsExtended) {
          onArticleUpdate(
            { ...article, sourceTopics: usedTopics },
            { changedHeadings: [], label: trimmed }
          );
        }
      } catch (err) {
        console.error("Answer generation failed:", err);
        setError(err.message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong while answering that. Please try again." },
        ]);
        // Still record the newly-pulled-in topic even though the answer step failed.
        if (topicsExtended) {
          onArticleUpdate(
            { ...article, sourceTopics: usedTopics },
            { changedHeadings: [], label: trimmed }
          );
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="sticky top-10 self-start h-[calc(100vh-5rem)] w-full rounded-lg border border-gray-700 bg-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Ask about this article</h3>
        <button
          onClick={onMinimize}
          aria-label="Minimize chat"
          title="Minimize"
          className="text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700 leading-none"
        >
          −
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask a question, or ask me to expand on something in this article.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-1 text-xs text-red-400">{error}</p>
      )}

      <form onSubmit={handleSend} className="p-3 border-t border-gray-700 flex gap-2">
        <input
          className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask a question or request an expansion..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

export default function ArticleView({ article: initialArticle, articleId }) {
  // history is the full undo/redo stack; historyIndex points at the entry
  // currently on screen. Each entry captures the full article snapshot at
  // that point, plus the headings that changed to produce it (used to know
  // what to highlight when stepping across that entry, in either direction).
  const [historyState, setHistoryState] = useState(() => ({
    entries: [{ article: initialArticle, changedHeadings: [], label: "Original article", timestamp: Date.now() }],
    index: 0,
  }));
  const [highlightedHeadings, setHighlightedHeadings] = useState([]);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [sources, setSources] = useState([]);
  const isFirstRender = useRef(true);

  const { entries: history, index: historyIndex } = historyState;
  const article = history[historyIndex].article;

  if (!article || !Array.isArray(article.sections)) return null;

  const flashHighlight = (headings) => {
    setHighlightedHeadings(headings || []);
    if (headings && headings.length > 0) {
      // clear after a few seconds so the highlight doesn't linger forever
      setTimeout(() => setHighlightedHeadings([]), 6000);
    }
  };

  // Pushes a new history entry from the current position — using a functional
  // update so this stays correct even if called more than once in a row before
  // a re-render lands (e.g. two chat turns' effects resolving back to back).
  const handleArticleUpdate = (nextArticleOrUpdater, meta = {}) => {
    setHistoryState((prev) => {
      const prevArticle = prev.entries[prev.index].article;
      const nextArticle =
        typeof nextArticleOrUpdater === "function" ? nextArticleOrUpdater(prevArticle) : nextArticleOrUpdater;

      const truncated = prev.entries.slice(0, prev.index + 1);
      const entries = [
        ...truncated,
        {
          article: nextArticle,
          changedHeadings: meta.changedHeadings || [],
          label: meta.label || "Edited",
          timestamp: Date.now(),
        },
      ];

      return { entries, index: entries.length - 1 };
    });
    flashHighlight(meta.changedHeadings);
  };

  // Moves to an arbitrary point in history (undo/redo step by ±1, or a direct
  // jump from the Edit History list) and highlights whatever sections differ
  // between the old and new position — i.e. only the most recent step(s)
  // actually crossed, not everything ever changed across the whole history.
  const jumpToHistory = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= history.length || targetIndex === historyIndex) return;

    const [lo, hi] = targetIndex > historyIndex ? [historyIndex + 1, targetIndex] : [targetIndex + 1, historyIndex];
    const crossedHeadings = [...new Set(history.slice(lo, hi + 1).flatMap((h) => h.changedHeadings))];

    setHistoryState((prev) => ({ ...prev, index: targetIndex }));
    flashHighlight(crossedHeadings);
  };

  const handleUndo = () => jumpToHistory(historyIndex - 1);
  const handleRedo = () => jumpToHistory(historyIndex + 1);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    updateArticleAction(articleId, article).catch((err) =>
      console.error("Failed to persist article update:", err)
    );
  }, [article, articleId]);

  useEffect(() => {
    if (!article.sourceTopics || article.sourceTopics.length === 0) {
      setSources([]);
      return;
    }

    let cancelled = false;

    fetch("/api/article-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics: article.sourceTopics }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSources(data.sources ?? []);
      })
      .catch((err) => console.error("Failed to load sources:", err));

    return () => {
      cancelled = true;
    };
  }, [article.sourceTopics]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="flex w-full">
        <div
          className={`${
            isChatMinimized ? "w-full" : "w-3/5"
          } flex gap-10 px-8 py-10 transition-[width] duration-300`}
        >
          <div className="sticky top-10 self-start w-56 flex-shrink-0">
            <BackButton />
            <UndoRedoControls
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
            <TableOfContents sections={article.sections} />
            <UsedTopics topics={article.sourceTopics} />
            <Sources sources={sources} />
            <EditHistory history={history} historyIndex={historyIndex} onJump={jumpToHistory} />
          </div>
          <ArticleBody article={article} articleId={articleId} highlightedHeadings={highlightedHeadings} />
        </div>
        <div className={isChatMinimized ? "hidden" : "w-2/5 px-8 py-10"}>
          <ArticleChatPanel
            articleId={articleId}
            article={article}
            onArticleUpdate={handleArticleUpdate}
            onMinimize={() => setIsChatMinimized(true)}
          />
        </div>
      </div>

      {isChatMinimized && (
        <button
          onClick={() => setIsChatMinimized(false)}
          className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 text-sm font-medium shadow-lg transition-colors"
        >
          Ask about this article
        </button>
      )}
    </div>
  );
}