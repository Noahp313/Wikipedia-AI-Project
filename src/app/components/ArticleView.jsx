"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    case "wikipedia": // per-topic articles from generateArticle use this name
      return { label: "From source material", color: "bg-green-500" };
    case "hybrid":
      return { label: "Source material + AI general knowledge", color: "bg-yellow-500" };
    case "generated":
      return { label: "AI general knowledge only (no source)", color: "bg-red-500" };
    default:
      return { label: "Unknown origin", color: "bg-gray-500" };
  }
}

// Provenance tags: the generation dot (sourceStatus) and a "User edited" tag
// are independent — a section shows whichever apply, or both.
function ProvenanceTags({ section }) {
  const hasGeneration = Boolean(section.sourceStatus);
  const { label, color } = sourceStatusStyle(section.sourceStatus);

  return (
    <>
      {hasGeneration && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} title={label} aria-label={label} />
      )}
      {section.userEdited && (
        <span
          className="flex-shrink-0 rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300"
          title="Edited by you"
        >
          User edited
        </span>
      )}
    </>
  );
}

function TableOfContents({ sections }) {
  return (
    <nav>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Contents
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {sections.map((s, i) => {
          const slug = slugify(s.heading);
          return (
            <li key={`${i}-${slug}`}>
              <a
                href={`#${slug}`}
                className="text-sm text-gray-300 hover:text-blue-400 transition-colors block"
              >
                {s.heading || <span className="italic text-gray-500">Untitled section</span>}
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
                {entry.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatSessionTime(ms) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Final states from earlier visits, newest first, plus the original generated
// article. Clicking one restores it as a new (undoable) step in this session.
function PreviousSessions({ sessions, original, onRestore, disabled }) {
  if (sessions.length === 0) return null;

  const items = [
    ...sessions.map((s) => ({ key: s.id, article: s.article, time: s.endedAt, label: null })),
    ...(original ? [{ key: "original", article: original.article, time: original.createdAt, label: "Original article" }] : []),
  ];

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Previous Sessions
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {items.map((item) => (
          <li key={item.key}>
            <button
              onClick={() => onRestore(item.article, item.label ?? formatSessionTime(item.time))}
              disabled={disabled}
              title={disabled ? "Finish editing to restore a past version" : "Restore this version"}
              className="block w-full text-left text-sm truncate text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
            >
              {/* Server and browser may format times in different time zones */}
              <span suppressHydrationWarning>{item.label ?? formatSessionTime(item.time)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleBody({ article, articleId, highlightedHeadings = [], onStartEdit, editDisabled = false }) {
  return (
    <article className="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-gray-700 pb-4 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">{article.title}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onStartEdit}
            disabled={editDisabled}
            title={editDisabled ? "Wait for the chat to finish before editing" : "Edit this article"}
            className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-300"
          >
            Edit
          </button>
          <SaveArticleButton articleId={articleId} />
        </div>
      </div>

      {article.sections.map((s) => {
        const slug = slugify(s.heading);
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
              <ProvenanceTags section={s} />
            </div>
            <p className="text-gray-200 leading-relaxed whitespace-pre-line">{s.content}</p>
          </section>
        );
      })}
    </article>
  );
}

// Textarea that grows to fit its content, so edit mode reads like the article.
function AutoTextarea({ value, onChange, className = "", ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none overflow-hidden rounded-md border border-gray-700 bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    />
  );
}

const EDIT_ICON_BUTTON =
  "px-2 py-1 rounded border border-gray-700 bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-800";

// Thin divider with an "Add section" button, shown between sections and at the end.
function AddSectionSlot({ onAdd }) {
  return (
    <div className="group flex items-center gap-3 -mt-4 mb-4">
      <div className="flex-1 border-t border-gray-800 group-hover:border-gray-600 transition-colors" />
      <button
        onClick={onAdd}
        className="px-2 py-0.5 rounded border border-gray-700 bg-gray-800 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
      >
        + Add section
      </button>
      <div className="flex-1 border-t border-gray-800 group-hover:border-gray-600 transition-colors" />
    </div>
  );
}

let newSectionCounter = 0;

function EditableArticleBody({ draft, error, onChange, onConfirm, onCancel }) {
  const setTitle = (title) => onChange({ ...draft, title });

  const updateSection = (draftId, field, value) =>
    onChange({
      ...draft,
      sections: draft.sections.map((s) => (s._draftId === draftId ? { ...s, [field]: value } : s)),
    });

  const moveSection = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...draft, sections });
  };

  const deleteSection = (draftId) =>
    onChange({ ...draft, sections: draft.sections.filter((s) => s._draftId !== draftId) });

  // New sections get a string _draftId so they can't collide with original indices;
  // _isNew tells confirmEditing there's no original section to diff against.
  const addSection = (index) => {
    const sections = [...draft.sections];
    sections.splice(index, 0, { heading: "", content: "", _draftId: `new-${newSectionCounter++}`, _isNew: true });
    onChange({ ...draft, sections });
  };

  return (
    <article className="max-w-3xl w-full">
      <div className="flex items-start justify-between gap-4 border-b border-gray-700 pb-4 mb-8">
        <AutoTextarea
          value={draft.title}
          onChange={setTitle}
          aria-label="Article title"
          className="text-4xl font-bold tracking-tight"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-sm text-white transition-colors"
          >
            Confirm edits
          </button>
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-red-400">{error}</p>}

      {draft.sections.length === 0 && (
        <p className="mb-8 text-sm text-gray-500">All sections deleted. Add a new one, or cancel to restore them.</p>
      )}

      {draft.sections.map((s, i) => {
        return (
          <div key={s._draftId}>
            <section className="mb-8 rounded-md border border-dashed border-gray-700 p-3">
              <div className="flex items-center gap-2 mb-3">
                <AutoTextarea
                  value={s.heading}
                  onChange={(v) => updateSection(s._draftId, "heading", v)}
                  aria-label={`Section ${i + 1} heading`}
                  placeholder="Section heading"
                  autoFocus={s._isNew}
                  className="text-2xl font-semibold"
                />
                <ProvenanceTags section={s} />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    title="Move section up"
                    aria-label="Move section up"
                    className={EDIT_ICON_BUTTON}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveSection(i, 1)}
                    disabled={i === draft.sections.length - 1}
                    title="Move section down"
                    aria-label="Move section down"
                    className={EDIT_ICON_BUTTON}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => deleteSection(s._draftId)}
                    title="Delete section"
                    aria-label="Delete section"
                    className={`${EDIT_ICON_BUTTON} hover:text-red-400`}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <AutoTextarea
                value={s.content}
                onChange={(v) => updateSection(s._draftId, "content", v)}
                aria-label={`Section ${i + 1} content`}
                placeholder="Section content"
                className="text-gray-200 leading-relaxed"
              />
            </section>
            {i < draft.sections.length - 1 && <AddSectionSlot onAdd={() => addSection(i + 1)} />}
          </div>
        );
      })}

      <button
        onClick={() => addSection(draft.sections.length)}
        className="w-full py-3 rounded-md border border-dashed border-gray-700 text-sm text-gray-400 hover:border-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
      >
        + Add section
      </button>
    </article>
  );
}

// Headings drive TOC anchors and highlight matching, so they must be present and unique.
function validateDraft(draft) {
  if (!draft.title.trim()) return "The article needs a title.";
  if (draft.sections.length === 0) return "The article needs at least one section.";

  const seen = new Set();
  for (const s of draft.sections) {
    const heading = s.heading.trim();
    if (!heading) return "Every section needs a heading.";
    if (!s.content.trim()) return `The "${heading}" section is empty — add some content or delete it.`;
    const slug = slugify(heading);
    if (seen.has(slug)) return `Two sections are both titled "${heading}" — headings must be unique.`;
    seen.add(slug);
  }

  return null;
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

function ArticleChatPanel({ articleId, article, onArticleUpdate, onMinimize, onBusyChange, disabled = false }) {
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
    if (!trimmed || isLoading || disabled) return;

    setInput("");
    setError(null);

    const historyForCall = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);
    onBusyChange?.(true);

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
      // Any chat edit has already been pushed to history by this point, so
      // edit mode can safely open on the fully-updated article.
      setIsLoading(false);
      onBusyChange?.(false);
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
          placeholder={disabled ? "Finish editing to use chat" : "Ask a question or request an expansion..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || disabled}
        />
        <button
          type="submit"
          disabled={isLoading || disabled || !input.trim()}
          className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

export default function ArticleView({ article: initialArticle, articleId, pastHistory = { original: null, sessions: [] } }) {
  // history is the full undo/redo stack for this page load only; historyIndex
  // points at the entry currently on screen. Each entry captures the full
  // article snapshot at that point, plus the headings that changed to produce
  // it (used to know what to highlight when stepping across that entry, in
  // either direction). Earlier visits live in pastHistory and are restored as
  // new steps rather than joining this stack.
  const [historyState, setHistoryState] = useState(() => ({
    entries: [
      {
        article: initialArticle,
        changedHeadings: [],
        label: pastHistory.sessions.length > 0 ? "Session start" : "Original article",
        timestamp: Date.now(),
      },
    ],
    index: 0,
  }));
  // Identifies this page load; every persisted change overwrites this session's snapshot.
  const [session] = useState(() => ({ id: crypto.randomUUID(), startedAt: Date.now() }));
  const [highlightedHeadings, setHighlightedHeadings] = useState([]);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [sources, setSources] = useState([]);
  // Non-null while in edit mode: a working copy of the article, committed to
  // history as a single entry on confirm or discarded on cancel.
  const [draft, setDraft] = useState(null);
  const [editError, setEditError] = useState(null);
  // Edit mode and chat are mutually exclusive: chat is disabled while editing,
  // and editing can't start while a chat request is still in flight.
  const [isChatBusy, setIsChatBusy] = useState(false);
  const isFirstRender = useRef(true);

  const { entries: history, index: historyIndex } = historyState;
  const article = history[historyIndex].article;
  const isEditing = draft !== null;

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
    // The highlight stays until the next content edit replaces it — updates
    // with no changed headings (e.g. a topic pulled in) leave it alone.
    if (meta.changedHeadings && meta.changedHeadings.length > 0) {
      setHighlightedHeadings(meta.changedHeadings);
    }
  };

  // Moves to an arbitrary point in history (undo/redo step by ±1, or a direct
  // jump from the Edit History list) and highlights whatever sections differ
  // between the old and new position — i.e. only the most recent step(s)
  // actually crossed, not everything ever changed across the whole history.
  const jumpToHistory = (targetIndex) => {
    if (isEditing) return;
    if (targetIndex < 0 || targetIndex >= history.length || targetIndex === historyIndex) return;

    const [lo, hi] = targetIndex > historyIndex ? [historyIndex + 1, targetIndex] : [targetIndex + 1, historyIndex];
    const crossedHeadings = [...new Set(history.slice(lo, hi + 1).flatMap((h) => h.changedHeadings))];

    setHistoryState((prev) => ({ ...prev, index: targetIndex }));
    setHighlightedHeadings(crossedHeadings);
  };

  // Restoring a past version is a normal history step, so it can be undone.
  // Highlights sections that are new or differ from what's on screen now.
  const restoreVersion = (snapshot, label) => {
    if (isEditing) return;
    const current = new Map(article.sections.map((s) => [s.heading, s.content]));
    const changedHeadings = snapshot.sections
      .filter((s) => current.get(s.heading) !== s.content)
      .map((s) => s.heading);

    handleArticleUpdate(snapshot, { changedHeadings, label: `Restored ${label}` });
  };

  const handleUndo = () => jumpToHistory(historyIndex - 1);
  const handleRedo = () => jumpToHistory(historyIndex + 1);

  const startEditing = () => {
    if (isChatBusy) return;
    setEditError(null);
    setDraft({
      title: article.title,
      // _draftId keeps React keys stable while headings are edited or sections reordered
      sections: article.sections.map((s, i) => ({ ...s, _draftId: i })),
    });
  };

  const cancelEditing = () => {
    setDraft(null);
    setEditError(null);
  };

  const confirmEditing = () => {
    const validationError = validateDraft(draft);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    const title = draft.title.trim();
    const changedHeadings = [];
    const sections = draft.sections.map(({ _draftId, _isNew, ...s }) => {
      const heading = s.heading.trim();
      // Added sections are user-written from scratch: no sourceStatus, just the userEdited tag
      if (_isNew) {
        changedHeadings.push(heading);
        return { heading, content: s.content, userEdited: true };
      }

      // _draftId is the section's original index, so compare against that exact section
      const original = article.sections[_draftId];
      const edited = heading !== original.heading || s.content !== original.content;
      if (!edited) return { ...s, heading };

      changedHeadings.push(heading);
      return { ...s, heading, userEdited: true };
    });

    const summarize = (a) => JSON.stringify([a.title, a.sections.map((s) => [s.heading, s.content])]);
    const hasChanges = summarize({ title, sections }) !== summarize(article);

    if (hasChanges) {
      // changedHeadings: sections whose heading or text changed; pure moves/deletes highlight nothing.

      handleArticleUpdate((prev) => ({ ...prev, title, sections }), { changedHeadings, label: "Manual edit" });
      setHighlightedHeadings(changedHeadings);
    }

    setDraft(null);
    setEditError(null);
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!article) return;
    updateArticleAction(articleId, article, session).catch((err) =>
      console.error("Failed to persist article update:", err)
    );
  }, [article, articleId, session]);

  useEffect(() => {
    if (!article?.sourceTopics || article.sourceTopics.length === 0) {
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
  }, [article?.sourceTopics]);

  if (!article || !Array.isArray(article.sections)) return null;

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
              canUndo={!isEditing && historyIndex > 0}
              canRedo={!isEditing && historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
            <TableOfContents sections={isEditing ? draft.sections : article.sections} />
            <UsedTopics topics={article.sourceTopics} />
            <Sources sources={sources} />
            <EditHistory history={history} historyIndex={historyIndex} onJump={jumpToHistory} />
            <PreviousSessions
              sessions={pastHistory.sessions}
              original={pastHistory.original}
              onRestore={restoreVersion}
              disabled={isEditing}
            />
          </div>
          {isEditing ? (
            <EditableArticleBody
              draft={draft}
              error={editError}
              onChange={setDraft}
              onConfirm={confirmEditing}
              onCancel={cancelEditing}
            />
          ) : (
            <ArticleBody
              article={article}
              articleId={articleId}
              highlightedHeadings={highlightedHeadings}
              onStartEdit={startEditing}
              editDisabled={isChatBusy}
            />
          )}
        </div>
        <div className={isChatMinimized ? "hidden" : "w-2/5 px-8 py-10"}>
          <ArticleChatPanel
            articleId={articleId}
            article={article}
            onArticleUpdate={handleArticleUpdate}
            onMinimize={() => setIsChatMinimized(true)}
            onBusyChange={setIsChatBusy}
            disabled={isEditing}
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