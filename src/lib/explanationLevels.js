// How technical an article or chat answer should be. Shared by the pickers
// (client) and the prompts (server), so it must stay free of server-only imports.
export const EXPLANATION_LEVELS = [
  { id: "simple", label: "Simple", description: "Everyday words, short sentences, analogies" },
  { id: "standard", label: "Standard", description: "Like a good encyclopedia" },
  { id: "expert", label: "Expert", description: "Technical depth and precise terminology" },
];

export const DEFAULT_LEVEL = "standard";

// Where the search box and Settings remember the last-used level.
export const LEVEL_STORAGE_KEY = "wikai-level";

export function normalizeLevel(level) {
  return EXPLANATION_LEVELS.some((l) => l.id === level) ? level : DEFAULT_LEVEL;
}

export function levelLabel(level) {
  return EXPLANATION_LEVELS.find((l) => l.id === normalizeLevel(level)).label;
}

const INSTRUCTIONS = {
  simple: `EXPLANATION LEVEL: SIMPLE — write for a curious 12-year-old or a complete beginner.
- Everyday words and short sentences. Avoid jargon; when a technical term is unavoidable, explain it in plain words the first time it appears.
- Use a concrete example or analogy where it genuinely helps understanding.
- Simplify, but never distort: every statement must still be accurate.`,
  standard: `EXPLANATION LEVEL: STANDARD — write for a general adult reader or a high-school / early-college student, like a good encyclopedia.
- Clear, precise language. Briefly define specialized terms the first time they appear.`,
  expert: `EXPLANATION LEVEL: EXPERT — write for a reader with a background in the field (upper-undergraduate level or beyond).
- Use precise technical terminology without defining basics; include mechanisms, formal definitions, quantitative detail, and important caveats or open questions where relevant.
- Prefer density and rigor over accessibility.`,
};

export function levelInstructions(level) {
  return INSTRUCTIONS[normalizeLevel(level)];
}
