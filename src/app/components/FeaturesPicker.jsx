"use client";

import { useEffect, useRef, useState } from "react";
import { FEATURES } from "../../lib/features";
import { CheckIcon, SlidersIcon } from "./icons";

function summary(selected) {
  if (selected.length === FEATURES.length) return "All";
  if (selected.length === 0) return "Text only";
  return FEATURES.filter((f) => selected.includes(f.id))
    .map((f) => f.label)
    .join(", ");
}

// The Tables / Images / Charts checkboxes — used in the search-bar popover and
// in Settings (both edit the same saved selection).
export function FeatureCheckboxes({ value, onChange }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((f) => f !== id) : FEATURES.map((f) => f.id).filter((f) => f === id || value.includes(f)));

  return (
    <div>
      {FEATURES.map((feature) => {
        const checked = value.includes(feature.id);
        return (
          <button
            key={feature.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => toggle(feature.id)}
            className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-subtle"
          >
            <span
              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                checked ? "border-accent bg-accent text-white" : "border-line-strong"
              }`}
            >
              {checked && <CheckIcon size={11} strokeWidth={3} />}
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">{feature.label}</span>
              <span className="block text-xs text-ink-faint">{feature.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Search-bar button for which extras an article may include (tables, images,
// charts) — any combination, including none. Asking for one directly in the
// query always includes it regardless (see lib/features.js).
export default function FeaturesPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SlidersIcon size={14} />
        <span className="hidden sm:inline">Features:</span>
        <span className="max-w-[9rem] truncate text-ink">{summary(value)}</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label="Include in the article"
          className="card absolute left-0 top-full z-30 mt-2 w-64 p-1.5 shadow-lg"
        >
          <p className="label px-2.5 pb-1 pt-1.5">Include when it fits</p>
          <FeatureCheckboxes value={value} onChange={onChange} />
          <p className="border-t border-line px-2.5 pb-1 pt-2 text-xs text-ink-faint">
            Asking for one in your search (e.g. “with a table”) always includes it.
          </p>
        </div>
      )}
    </div>
  );
}
