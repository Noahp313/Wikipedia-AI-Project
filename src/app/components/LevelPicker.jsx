"use client";

import { EXPLANATION_LEVELS } from "../../lib/explanationLevels";

// Segmented control for the explanation level (Simple / Standard / Expert).
export default function LevelPicker({ value, onChange, disabled = false, className = "" }) {
  return (
    <div
      role="radiogroup"
      aria-label="Explanation level"
      className={`inline-flex items-center rounded-lg bg-subtle p-0.5 ${className}`}
    >
      {EXPLANATION_LEVELS.map((level) => {
        const active = value === level.id;
        return (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={level.description}
            onClick={() => onChange(level.id)}
            disabled={disabled}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08)]" : "text-ink-faint hover:text-ink"
            }`}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
