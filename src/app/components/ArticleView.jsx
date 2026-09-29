"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { slugify } from "../../lib/slugify";
import Link from "next/link";
import SaveArticleButton from "./SaveArticleButton";
import LevelPicker from "./LevelPicker";
import MarkdownContent from "./MarkdownContent";
import { normalizeLevel } from "../../lib/explanationLevels";
import { readNdjson } from "../../lib/readNdjson";
import { updateArticleAction } from "../../lib/actions/updateArticle";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChatIcon,
  CheckIcon,
  ExternalLinkIcon,
  MenuIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RedoIcon,
  SendIcon,
  SpinnerIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from "./icons";

// Ask-about context: parts of the article attached to the next chat message.
// Each is { id, heading, text } — text is a highlighted excerpt, or null for a
// whole section. Sent as text + heading (never offsets, which chat edits would
// invalidate).
const MAX_CONTEXTS = 5;
const MAX_EXCERPT_CHARS = 1000;

function clampExcerpt(text) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > MAX_EXCERPT_CHARS ? `${t.slice(0, MAX_EXCERPT_CHARS)}…` : t;
}

// Splits a selection into one excerpt per section it touches. Only section
// text counts (never headings), so a drag across sections yields one excerpt each.
function excerptsFromSelection(selection, container) {
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  const excerpts = [];

  container.querySelectorAll("[data-section-content]").forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const part = document.createRange();
    part.selectNodeContents(el);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    const text = clampExcerpt(part.toString());
    // range is kept client-side only, to keep the excerpt highlighted in the article
    if (text) excerpts.push({ heading: el.dataset.sectionContent, text, range: part });
  });

  return excerpts;
}

// Floating "Ask about this" button under a text selection in the article.
// Driven by selectionchange so it also works with touch selection handles on
// mobile, where it sits below the selection, clear of the native menu above it.
function SelectionAskButton({ containerRef, onAsk }) {
  const [pending, setPending] = useState(null); // { excerpts, top, left } in page coordinates

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const excerpts = excerptsFromSelection(selection, containerRef.current);
      if (excerpts.length === 0) {
        setPending(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const pageWidth = document.documentElement.clientWidth;
      setPending({
        excerpts,
        top: rect.bottom + window.scrollY + 8,
        left: Math.min(Math.max(rect.left + rect.width / 2, 90), pageWidth - 90) + window.scrollX,
      });
    };

    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [containerRef]);

  if (!pending) return null;

  const multiple = pending.excerpts.length > 1;

  return (
    <button
      type="button"
      // Keep the selection alive until the click lands
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        onAsk(pending.excerpts);
        window.getSelection()?.removeAllRanges();
        setPending(null);
      }}
      style={{ top: pending.top, left: pending.left }}
      className="btn btn-primary absolute z-30 -translate-x-1/2 rounded-full shadow-lg shadow-accent/25"
    >
      <ChatIcon size={14} />
      {multiple ? `Ask about these (${pending.excerpts.length})` : "Ask about this"}
    </button>
  );
}

function ContextChip({ context, onRemove, disabled }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-accent/25 bg-accent-soft py-1 pl-2 pr-1 text-xs text-accent-ink">
      <span className="max-w-[8rem] truncate font-medium" title={context.heading}>
        {context.heading}
      </span>
      {context.text ? (
        <span className="min-w-0 max-w-[12rem] truncate text-ink-muted" title={context.text}>
          “{context.text}”
        </span>
      ) : (
        <span className="text-ink-faint">whole section</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${context.heading} from the question`}
        title="Remove"
        className="flex-shrink-0 rounded p-0.5 text-ink-faint hover:bg-accent/10 hover:text-ink disabled:opacity-40"
      >
        <XIcon size={12} />
      </button>
    </span>
  );
}

// One line per context, prefixed to the message text wherever the model sees
// chat history or searches for relevant sources.
function describeContexts(contexts, maxExcerpt = MAX_EXCERPT_CHARS) {
  return contexts
    .map((c) =>
      c.text
        ? `"${c.text.length > maxExcerpt ? `${c.text.slice(0, maxExcerpt)}…` : c.text}" (from the "${c.heading}" section)`
        : `the whole "${c.heading}" section`
    )
    .join("; ");
}

function BackButton() {
  return (
    <Link href="/" className="btn btn-ghost -ml-2 mb-6 text-ink-muted">
      <ArrowLeftIcon size={15} />
      Back to search
    </Link>
  );
}

function sourceStatusStyle(status) {
  switch (status) {
    case "source":
    case "wikipedia": // per-topic articles from generateArticle use this name
      return { label: "From source material", color: "bg-success" };
    case "hybrid":
      return { label: "Source material + AI general knowledge", color: "bg-warning" };
    case "generated":
      return { label: "AI general knowledge only (no source)", color: "bg-danger" };
    default:
      return { label: "Unknown origin", color: "bg-ink-faint" };
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
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ring-4 ring-canvas ${color}`}
          title={label}
          aria-label={label}
        />
      )}
      {section.userEdited && (
        <span
          className="flex-shrink-0 rounded-md bg-edited-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-edited"
          title="Edited by you"
        >
          User edited
        </span>
      )}
    </>
  );
}

// Shared shell for the sidebar's stacked lists.
function SidebarSection({ title, children }) {
  return (
    <div className="mt-8">
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

const SIDEBAR_LIST = "space-y-0.5 border-l border-line";
const SIDEBAR_ITEM =
  "-ml-px block w-full truncate border-l border-transparent py-1 pl-3 text-left text-[13px] leading-snug transition-colors";

function TableOfContents({ sections, onNavigate }) {
  return (
    <nav>
      <h3 className="label mb-2.5">Contents</h3>
      <ul className={SIDEBAR_LIST}>
        {sections.map((s, i) => {
          const slug = slugify(s.heading);
          return (
            <li key={`${i}-${slug}`}>
              <a
                href={`#${slug}`}
                onClick={onNavigate}
                className={`${SIDEBAR_ITEM} text-ink-muted hover:border-ink-faint hover:text-ink`}
              >
                {s.heading || <span className="italic text-ink-faint">Untitled section</span>}
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
    <SidebarSection title="Used topics">
      <div className="flex flex-wrap gap-1.5">
        {topics.map((topic) => (
          <span key={topic} className="rounded-md bg-subtle px-2 py-0.5 text-xs text-ink-muted">
            {topic}
          </span>
        ))}
      </div>
    </SidebarSection>
  );
}

function Sources({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <SidebarSection title="Sources">
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.topic}>
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-accent transition-colors"
            >
              <span className="truncate">{s.title}</span>
              <ExternalLinkIcon size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

function UndoRedoControls({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-8">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last change"
        aria-label="Undo last change"
        className="btn btn-secondary"
      >
        <UndoIcon size={14} />
        Undo
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo last undone change"
        aria-label="Redo last undone change"
        className="btn btn-secondary"
      >
        Redo
        <RedoIcon size={14} />
      </button>
    </div>
  );
}

function EditHistory({ history, historyIndex, onJump }) {
  if (!history || history.length <= 1) return null;

  return (
    <SidebarSection title="Edit history">
      <ul className={SIDEBAR_LIST}>
        {history.map((entry, i) => {
          const isCurrent = i === historyIndex;
          return (
            <li key={entry.timestamp}>
              <button
                onClick={() => onJump(i)}
                title={entry.label}
                className={`${SIDEBAR_ITEM} cursor-pointer ${
                  isCurrent
                    ? "border-accent font-medium text-accent"
                    : i > historyIndex
                    ? "text-ink-faint hover:border-ink-faint hover:text-ink"
                    : "text-ink-muted hover:border-ink-faint hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            </li>
          );
        })}
      </ul>
    </SidebarSection>
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
    <SidebarSection title="Previous sessions">
      <ul className={SIDEBAR_LIST}>
        {items.map((item) => (
          <li key={item.key}>
            <button
              onClick={() => onRestore(item.article, item.label ?? formatSessionTime(item.time))}
              disabled={disabled}
              title={disabled ? "Finish editing to restore a past version" : "Restore this version"}
              className={`${SIDEBAR_ITEM} cursor-pointer text-ink-muted hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:text-ink-muted`}
            >
              {/* Server and browser may format times in different time zones */}
              <span suppressHydrationWarning>{item.label ?? formatSessionTime(item.time)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

// Marks excerpts attached to the chat using the CSS Custom Highlight API, so
// React's text nodes are never split. A range is dropped once its text no
// longer matches (e.g. the section was edited), rather than marking the wrong words.
function useAskHighlight(askContexts) {
  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.highlights) return;
    const ranges = askContexts
      .filter((c) => c.text && c.range?.startContainer.isConnected && clampExcerpt(c.range.toString()) === c.text)
      .map((c) => c.range);
    CSS.highlights.set("ask-context", new Highlight(...ranges));
    return () => CSS.highlights.delete("ask-context");
  }, [askContexts]);
}

function ArticleBody({
  article,
  articleId,
  highlightedHeadings = [],
  onStartEdit,
  editDisabled = false,
  onAskSection,
  askContexts = [],
  articleRef,
  writing = false,
  streamingHeadings = [],
}) {
  useAskHighlight(askContexts);
  // Section currently being written (a new article, or a streaming chat edit) gets a caret
  const caretHeading = writing ? article.sections.at(-1)?.heading : streamingHeadings.at(-1);
  const askedHeadings = new Set(askContexts.filter((c) => c.text === null).map((c) => c.heading));

  return (
    <article ref={articleRef} className="min-w-0 flex-1 max-w-[46rem]">
      <header className="flex flex-col gap-4 border-b border-line pb-6 mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:mb-10">
        <h1 className="min-w-0 break-words text-3xl leading-[1.15] font-semibold tracking-tight text-ink sm:text-[2.5rem] sm:leading-[1.1]">
          {article.title || (writing && <span className="block h-10 w-2/3 animate-pulse rounded-lg bg-subtle" />)}
        </h1>
        {writing ? (
          <span className="flex flex-shrink-0 items-center gap-2 text-sm text-ink-faint sm:pt-3">
            <SpinnerIcon size={15} className="text-accent" />
            Writing article…
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0 sm:pt-1.5">
            <button
              onClick={onStartEdit}
              disabled={editDisabled}
              title={editDisabled ? "Wait for the chat to finish before editing" : "Edit this article"}
              className="btn btn-secondary"
            >
              <PencilIcon size={14} />
              Edit
            </button>
            <SaveArticleButton articleId={articleId} />
          </div>
        )}
      </header>

      {article.sections.map((s, i) => {
        const slug = slugify(s.heading);
        // Headings are still growing while an article is written, so key by position then
        const key = writing ? `writing-${i}` : slug;
        // Provenance isn't known until a section finishes streaming
        const live = writing || streamingHeadings.includes(s.heading);
        const isChanged = highlightedHeadings.includes(s.heading);
        // Whole section attached to the chat — takes precedence over the changed highlight
        const isAsked = askedHeadings.has(s.heading);

        return (
          <section
            id={slug}
            key={key}
            className={`group mb-10 scroll-mt-20 lg:scroll-mt-10 rounded-xl transition-colors ${
              isAsked
                ? "bg-ask-soft ring-1 ring-ask/40 p-3 -mx-3 sm:p-5 sm:-mx-5 duration-200"
                : isChanged
                ? "bg-accent-soft ring-1 ring-accent/25 p-3 -mx-3 sm:p-5 sm:-mx-5 duration-1000"
                : "duration-1000"
            }`}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink">
                <span className={isAsked ? "rounded bg-ask-mark px-1 -mx-1 box-decoration-clone" : ""}>{s.heading}</span>
              </h2>
              {(!live || s.sourceStatus) && <ProvenanceTags section={s} />}
              {isChanged && (
                <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">
                  Updated
                </span>
              )}
              {onAskSection && (
                // Always visible labeled pill; fills in solid on hover of the section
                <button
                  onClick={() => onAskSection(s.heading)}
                  title="Ask about this section"
                  aria-label={`Ask about the ${s.heading} section`}
                  className="btn ml-auto shrink-0 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink hover:border-accent hover:bg-accent hover:text-white [@media(hover:hover)]:group-hover:border-accent/50"
                >
                  <ChatIcon size={14} />
                  <span className="sm:hidden">Ask</span>
                  <span className="hidden sm:inline">Ask about this</span>
                </button>
              )}
            </div>
            <MarkdownContent
              data-section-content={s.heading}
              streaming={s.heading === caretHeading}
              images={article.images}
              className="text-[15.5px] leading-[1.75] text-ink-muted"
            >
              {s.content}
            </MarkdownContent>
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
      className={`w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 -mx-2.5 text-ink placeholder:text-ink-faint transition-colors hover:bg-subtle focus:bg-surface focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/10 ${className}`}
      {...props}
    />
  );
}

// Thin divider with an "Add section" button, shown between sections.
function AddSectionSlot({ onAdd }) {
  return (
    <div className="group flex items-center gap-3 my-3">
      <div className="flex-1 border-t border-transparent group-hover:border-line transition-colors" />
      <button
        onClick={onAdd}
        className="btn btn-ghost px-2 py-0.5 text-xs text-ink-faint opacity-60 group-hover:opacity-100"
      >
        <PlusIcon size={12} />
        Add section
      </button>
      <div className="flex-1 border-t border-transparent group-hover:border-line transition-colors" />
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
    <article className="min-w-0 flex-1 max-w-[46rem]">
      <div className="sticky top-14 z-20 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur sm:rounded-b-xl lg:top-0">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Editing article
        </span>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            <CheckIcon size={14} />
            Confirm edits
          </button>
        </div>
      </div>

      <div className="border-b border-line pb-6 mb-8">
        <AutoTextarea
          value={draft.title}
          onChange={setTitle}
          aria-label="Article title"
          className="text-3xl leading-[1.15] font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]"
        />
      </div>

      {error && (
        <p className="mb-6 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {draft.sections.length === 0 && (
        <p className="mb-8 text-sm text-ink-faint">All sections deleted. Add a new one, or cancel to restore them.</p>
      )}

      {draft.sections.map((s, i) => {
        return (
          <div key={s._draftId}>
            <section className="group/section card p-3 pl-5 sm:p-4 sm:pl-6 transition-shadow focus-within:shadow-md">
              <div className="flex items-center gap-2 mb-1">
                <AutoTextarea
                  value={s.heading}
                  onChange={(v) => updateSection(s._draftId, "heading", v)}
                  aria-label={`Section ${i + 1} heading`}
                  placeholder="Section heading"
                  autoFocus={s._isNew}
                  className="text-xl font-semibold tracking-tight"
                />
                <ProvenanceTags section={s} />
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-50 group-hover/section:opacity-100 group-focus-within/section:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    title="Move section up"
                    aria-label="Move section up"
                    className="btn btn-ghost btn-icon"
                  >
                    <ArrowUpIcon size={15} />
                  </button>
                  <button
                    onClick={() => moveSection(i, 1)}
                    disabled={i === draft.sections.length - 1}
                    title="Move section down"
                    aria-label="Move section down"
                    className="btn btn-ghost btn-icon"
                  >
                    <ArrowDownIcon size={15} />
                  </button>
                  <button
                    onClick={() => deleteSection(s._draftId)}
                    title="Delete section"
                    aria-label="Delete section"
                    className="btn btn-ghost btn-icon hover:bg-danger-soft hover:text-danger"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
              <AutoTextarea
                value={s.content}
                onChange={(v) => updateSection(s._draftId, "content", v)}
                aria-label={`Section ${i + 1} content`}
                placeholder="Section content (Markdown: **bold**, - lists, | tables |, $math$)"
                className="text-[15.5px] leading-[1.75] text-ink-muted"
              />
            </section>
            {i < draft.sections.length - 1 && <AddSectionSlot onAdd={() => addSection(i + 1)} />}
          </div>
        );
      })}

      <button
        onClick={() => addSection(draft.sections.length)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-4 text-sm text-ink-muted hover:border-accent/50 hover:bg-accent-soft hover:text-accent-ink transition-colors cursor-pointer"
      >
        <PlusIcon size={14} />
        Add section
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

function ChatMessage({ role, content, contexts = [] }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isUser
            ? "whitespace-pre-line rounded-br-md bg-accent text-white"
            : "rounded-bl-md bg-subtle text-ink"
        }`}
      >
        {contexts.length > 0 && (
          <div className="mb-1.5 space-y-1 border-l-2 border-white/40 pl-2 text-xs text-white/85">
            {contexts.map((c, i) => (
              <p key={i} className="line-clamp-2 whitespace-normal">
                {c.text ? `“${c.text}”` : "Whole section"}
                <span className="opacity-75"> — {c.heading}</span>
              </p>
            ))}
          </div>
        )}
        {isUser ? content : <MarkdownContent>{content}</MarkdownContent>}
      </div>
    </div>
  );
}

function ArticleChatPanel({
  articleId,
  article,
  onArticleUpdate,
  onMinimize,
  onBusyChange,
  disabled = false,
  disabledReason = "Finish editing to use chat",
  onStreamingEdits,
  contexts = [],
  onRemoveContext,
  onClearContexts,
  onSendContexts,
  inputRef,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  // Starts at the level the article was written at; applies to answers and chat edits.
  const [level, setLevel] = useState(() => normalizeLevel(article.level));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  // Whether the view should follow new messages. Cleared when the user scrolls
  // up to reread something, so a reply arriving doesn't yank them back down.
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return; // ignore while hidden (minimized / closed drawer)
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, error]);

  // Hiding the panel (display: none) resets its scroll position, and resizes
  // shift content — so re-pin to the newest message whenever the box resizes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  // Streams the answer: edits arrive as they're written (shown live via
  // onStreamingEdits), then "done" carries the validated result.
  const getAnswer = async ({ query, history, relevantSections, chatContextStatus, currentArticle, contexts }) => {
    const res = await fetch("/api/chatbot-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, history, relevantSections, chatContextStatus, currentArticle, contexts, level }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "chatbot-answer request failed");
    }

    const edits = [];
    let result = null;
    await readNdjson(res, (event) => {
      if (event.t === "edit") {
        edits[event.i] = { op: event.op, heading: event.heading, content: event.content };
        onStreamingEdits?.(edits.filter(Boolean));
      } else if (event.t === "done") {
        result = event;
      } else if (event.t === "error") {
        throw new Error(event.message);
      }
    });

    if (!result) throw new Error("The answer was cut off. Please try again.");
    return result; // { answer, article, articleChanged, changedHeadings }
  };

  const handleSend = (e) => {
    e.preventDefault();
    send(input.trim());
  };

  const send = async (trimmed) => {
    if (!trimmed || isLoading || disabled) return;

    setInput("");
    setError(null);

    // Attached parts of the article travel with this message only
    const sentContexts = contexts.map(({ heading, text }) => ({ heading, text }));
    onSendContexts?.();

    // Earlier turns keep their context as a text prefix so follow-ups like
    // "and the second one?" still make sense to the model.
    const historyForCall = messages.map(({ role, content, contexts: c = [] }) => ({
      role,
      content: c.length > 0 ? `[About: ${describeContexts(c, 300)}] ${content}` : content,
    }));
    // Topic and source lookups only see this text, so a bare "compare these"
    // needs the selected passages spelled out.
    const lookupText =
      sentContexts.length > 0 ? `${trimmed}\n\nReferring to: ${describeContexts(sentContexts, 300)}` : trimmed;

    // Sending always jumps to the bottom, even if the user had scrolled up.
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: trimmed, contexts: sentContexts }]);
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
          message: lookupText,
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
          query: lookupText,
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
          contexts: sentContexts,
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
      // The final article (if any) is in history now, replacing the live preview
      onStreamingEdits?.(null);
      // Any chat edit has already been pushed to history by this point, so
      // edit mode can safely open on the fully-updated article.
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <aside className="card flex h-full w-full flex-col overflow-hidden rounded-none border-0 sm:rounded-xl sm:border xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ChatIcon size={15} className="text-accent" />
          Ask about this article
        </h3>
        <button
          onClick={onMinimize}
          aria-label="Minimize chat"
          title="Minimize"
          className="btn btn-ghost btn-icon"
        >
          <MinusIcon size={15} className="hidden xl:block" />
          <XIcon size={16} className="xl:hidden" />
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <ChatIcon size={18} />
            </span>
            <p className="text-sm font-medium text-ink">Ask anything about this article</p>
            <p className="mt-1 text-sm text-ink-faint">
              Ask a question, or ask me to expand on something — edits appear in the article.
            </p>
            <p className="mt-3 text-xs text-ink-faint">
              Highlight text or use a section&apos;s <ChatIcon size={12} className="inline -mt-0.5" /> button to ask
              about it. Add several to compare them.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} contexts={m.contexts} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-subtle px-4 py-3" aria-label="Thinking">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-faint"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mx-3 mb-1 rounded-md bg-danger-soft px-3 py-1.5 text-xs text-danger">{error}</p>
      )}

      <form onSubmit={handleSend} className="p-3 border-t border-line">
        {contexts.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {contexts.map((c) => (
              <ContextChip key={c.id} context={c} onRemove={() => onRemoveContext?.(c.id)} disabled={isLoading} />
            ))}
            {contexts.length > 1 && (
              <button
                type="button"
                onClick={onClearContexts}
                disabled={isLoading}
                className="px-1 text-xs text-ink-faint hover:text-ink disabled:opacity-40"
              >
                Clear
              </button>
            )}
          </div>
        )}
        <div className="mb-2 flex items-center gap-2">
          <span className="label">Level</span>
          <LevelPicker value={level} onChange={setLevel} disabled={isLoading || disabled} />
        </div>
        <div className="relative">
          <input
            ref={inputRef}
            className="input rounded-xl py-2.5 pr-12 text-sm"
            placeholder={
              disabled
                ? disabledReason
                : contexts.length > 1
                ? "Ask about or compare the selected parts…"
                : contexts.length === 1
                ? "Ask about the selected part…"
                : "Ask a question or request an expansion…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || disabled}
          />
          <button
            type="submit"
            disabled={isLoading || disabled || !input.trim()}
            aria-label="Send"
            title="Send"
            className="btn btn-primary btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}

// Preview of chat edits while they stream in — mirrors the server's applyEdits
// (amend replaces a section's text; add appends, de-duplicating the heading) so
// the final article lands without anything jumping. Returns the preview and
// the headings being written.
function applyLiveEdits(article, edits) {
  const sections = [...article.sections];
  const used = new Set(sections.map((s) => s.heading));
  const headings = [];
  for (const edit of edits) {
    const idx = sections.findIndex((s) => s.heading === edit.heading);
    if (edit.op === "amend" && idx !== -1) {
      sections[idx] = { ...sections[idx], content: edit.content, sourceStatus: undefined };
      headings.push(edit.heading);
      continue;
    }
    let heading = edit.heading;
    for (let n = 2; used.has(heading); n++) heading = `${edit.heading} (${n})`;
    used.add(heading);
    sections.push({ heading, content: edit.content });
    headings.push(heading);
  }
  return { article: { ...article, sections }, headings };
}

// writing: the article is still being generated (see NewArticleStream) — shown
// read-only as it streams in, with editing, saving and chat disabled.
export default function ArticleView({
  article: initialArticle,
  articleId,
  pastHistory = { original: null, sessions: [] },
  writing = false,
}) {
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
  // null = default (docked open on xl, closed on smaller screens); see chatWrapperClass.
  const [isChatOpen, setIsChatOpen] = useState(null);
  // Contents drawer, only used below lg where the sidebar isn't docked.
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [sources, setSources] = useState([]);
  // Non-null while in edit mode: a working copy of the article, committed to
  // history as a single entry on confirm or discarded on cancel.
  const [draft, setDraft] = useState(null);
  const [editError, setEditError] = useState(null);
  // Edit mode and chat are mutually exclusive: chat is disabled while editing,
  // and editing can't start while a chat request is still in flight.
  const [isChatBusy, setIsChatBusy] = useState(false);
  // Parts of the article attached to the next chat message (see MAX_CONTEXTS).
  const [chatContexts, setChatContexts] = useState([]);
  // Contexts of the question in flight — kept highlighted until its answer lands.
  const [askedContexts, setAskedContexts] = useState([]);
  // Chat edits streaming in right now (null when none); shown over the current article
  const [liveEdits, setLiveEdits] = useState(null);
  const articleRef = useRef(null);
  const chatInputRef = useRef(null);
  const initialHistoryState = useRef(historyState);

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
    // Not mid-answer either: streaming edits are previewed on top of the current version
    if (isEditing || isChatBusy) return;
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

  // Attaches parts of the article to the chat (skipping exact duplicates, up
  // to MAX_CONTEXTS), then opens the chat — a drawer below xl — ready to type.
  const addChatContexts = (items) => {
    const next = [...chatContexts];
    for (const item of items) {
      if (next.length >= MAX_CONTEXTS) break;
      if (next.some((c) => c.heading === item.heading && c.text === item.text)) continue;
      next.push({ id: crypto.randomUUID(), heading: item.heading, text: item.text, range: item.range });
    }
    setChatContexts(next);
    setIsChatOpen(true);
    requestAnimationFrame(() => chatInputRef.current?.focus());
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

  // Keyed on historyState (which changes exactly when the shown article does)
  // so the session's step labels are saved alongside its snapshot. Compared
  // against the initial state rather than skipping the "first" run, which
  // StrictMode's double-run in development gets past.
  useEffect(() => {
    if (writing || !articleId || historyState === initialHistoryState.current) return;
    const { entries, index } = historyState;
    const current = entries[index].article;
    if (!current) return;
    const steps = entries.slice(1, index + 1).map((e) => e.label);
    updateArticleAction(articleId, current, { ...session, steps }).catch((err) =>
      console.error("Failed to persist article update:", err)
    );
  }, [historyState, articleId, session, writing]);

  // While writing, the topics come from the streamed article (known up front)
  const sourceTopics = writing ? initialArticle?.sourceTopics : article?.sourceTopics;

  useEffect(() => {
    if (!sourceTopics || sourceTopics.length === 0) {
      setSources([]);
      return;
    }

    let cancelled = false;

    fetch("/api/article-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics: sourceTopics }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSources(data.sources ?? []);
      })
      .catch((err) => console.error("Failed to load sources:", err));

    return () => {
      cancelled = true;
    };
  }, [sourceTopics]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setIsNavOpen(false);
      // Only collapse the chat if it was explicitly opened as a drawer.
      setIsChatOpen((open) => (open ? false : open));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!article || !Array.isArray(article.sections)) return null;

  const live = writing ? null : liveEdits?.length ? applyLiveEdits(article, liveEdits) : null;
  const shownArticle = writing ? initialArticle : live ? live.article : article;

  const canUndo = !isEditing && !isChatBusy && historyIndex > 0;
  const canRedo = !isEditing && !isChatBusy && historyIndex < history.length - 1;

  // isChatOpen === null means "not chosen yet": CSS decides (docked open on xl,
  // closed behind the floating button below), so there's no flash on hydration.
  const chatWrapperClass =
    isChatOpen === null ? "hidden xl:block" : isChatOpen ? "block" : "hidden";
  const fabClass = isChatOpen === null ? "xl:hidden" : isChatOpen ? "hidden" : "";

  return (
    <div className="min-h-screen">
      {/* Top bar below lg, where the sidebar collapses into a drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-canvas/85 px-2 backdrop-blur sm:px-4 lg:hidden">
        <button
          onClick={() => setIsNavOpen(true)}
          aria-label="Open contents"
          aria-expanded={isNavOpen}
          className="btn btn-ghost"
        >
          <MenuIcon size={16} />
          Contents
        </button>
        <Link href="/" className="btn btn-ghost btn-icon" aria-label="Back to search" title="Back to search">
          <ArrowLeftIcon size={16} />
        </Link>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={handleUndo} disabled={!canUndo} aria-label="Undo last change" title="Undo" className="btn btn-ghost btn-icon">
            <UndoIcon size={16} />
          </button>
          <button onClick={handleRedo} disabled={!canRedo} aria-label="Redo last undone change" title="Redo" className="btn btn-ghost btn-icon">
            <RedoIcon size={16} />
          </button>
        </div>
      </div>

      {/* Drawer backdrops (below the breakpoint where each panel docks) */}
      {isNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden" onClick={() => setIsNavOpen(false)} />
      )}
      {isChatOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] xl:hidden" onClick={() => setIsChatOpen(false)} />
      )}

      <div className="flex w-full">
        <div className="flex min-w-0 flex-1 justify-center gap-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-10 xl:gap-12">
          <div
            className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex-shrink-0 overflow-y-auto border-r border-line bg-surface p-6 shadow-xl transition-[transform,visibility] duration-200 ${
              isNavOpen ? "translate-x-0" : "invisible -translate-x-full"
            } lg:visible lg:sticky lg:top-10 lg:bottom-auto lg:z-auto lg:w-56 lg:max-w-none lg:max-h-[calc(100vh-5rem)] lg:translate-x-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:pr-2 lg:pb-4 lg:shadow-none`}
          >
            <div className="mb-2 flex justify-end lg:hidden">
              <button onClick={() => setIsNavOpen(false)} aria-label="Close contents" className="btn btn-ghost btn-icon -mr-2">
                <XIcon size={16} />
              </button>
            </div>
            <BackButton />
            <UndoRedoControls canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} />
            <TableOfContents
              sections={isEditing ? draft.sections : shownArticle.sections}
              onNavigate={() => setIsNavOpen(false)}
            />
            <UsedTopics topics={shownArticle.sourceTopics} />
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
              article={shownArticle}
              articleId={articleId}
              highlightedHeadings={live ? live.headings : highlightedHeadings}
              onStartEdit={startEditing}
              editDisabled={isChatBusy}
              onAskSection={writing ? undefined : (heading) => addChatContexts([{ heading, text: null }])}
              askContexts={[...chatContexts, ...askedContexts]}
              articleRef={articleRef}
              writing={writing}
              streamingHeadings={live ? live.headings : []}
            />
          )}
        </div>
        {/* Drawer below xl (full-width on phones), docked column on xl */}
        <div
          className={`${chatWrapperClass} fixed inset-y-0 right-0 z-50 w-full sm:w-[26rem] sm:p-3 xl:static xl:z-auto xl:flex-shrink-0 xl:p-0 xl:py-6 xl:pr-6`}
        >
          <ArticleChatPanel
            articleId={articleId}
            article={article}
            onArticleUpdate={handleArticleUpdate}
            onMinimize={() => setIsChatOpen(false)}
            onBusyChange={(busy) => {
              setIsChatBusy(busy);
              if (!busy) setAskedContexts([]);
            }}
            disabled={isEditing || writing}
            disabledReason={writing ? "Chat opens once the article is written" : undefined}
            onStreamingEdits={setLiveEdits}
            contexts={chatContexts}
            onRemoveContext={(id) => setChatContexts((prev) => prev.filter((c) => c.id !== id))}
            onClearContexts={() => setChatContexts([])}
            onSendContexts={() => {
              setAskedContexts(chatContexts);
              setChatContexts([]);
            }}
            inputRef={chatInputRef}
          />
        </div>
      </div>

      {/* Hidden in edit mode, where selecting text is for editing it */}
      {!isEditing && !writing && <SelectionAskButton containerRef={articleRef} onAsk={addChatContexts} />}

      <button
        onClick={() => setIsChatOpen(true)}
        aria-label="Ask about this article"
        className={`${fabClass} btn btn-primary fixed bottom-4 right-4 z-30 rounded-full p-3.5 shadow-lg shadow-accent/25 hover:-translate-y-0.5 transition-all sm:bottom-6 sm:right-6 sm:px-4 sm:py-3`}
      >
        <ChatIcon size={16} />
        <span className="hidden sm:inline">Ask about this article</span>
      </button>
    </div>
  );
}