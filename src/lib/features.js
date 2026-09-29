// Optional content features the reader can switch on or off from the search
// bar. On = used only when clearly relevant to the question (still capped, see
// lib/markdown.js); off = never used. Stored on the article so later chat edits follow the same choice.
// Shared by client and server, so no server-only imports.
export const FEATURES = [
  { id: "tables", label: "Tables", description: "Comparisons, data and worked examples" },
  { id: "images", label: "Images", description: "Real images from Wikipedia" },
  { id: "charts", label: "Charts", description: "Diagrams and simple charts (AI-generated)" },
];

export const ALL_FEATURES = FEATURES.map((f) => f.id);

// Where the search bar remembers the selection, as a comma-separated list
// ("" = none selected).
export const FEATURES_STORAGE_KEY = "wikai-features";

// Valid ids only, in canonical order. Anything that isn't an array (e.g. an
// article created before features existed) gets every feature.
export function normalizeFeatures(features) {
  if (!Array.isArray(features)) return [...ALL_FEATURES];
  return ALL_FEATURES.filter((id) => features.includes(id));
}

// A reader who directly asks for a feature ("with a table", "add a chart",
// "show a picture") always gets it, whatever the selection. Loose on purpose:
// a false positive only lifts the restriction — the prompt still asks the model
// to use the feature only where it fits.
const REQUEST_PATTERNS = {
  tables: /\b(tables?|tabular|matrix|matrices)\b/i,
  images: /\b(images?|pictures?|photos?|photographs?|illustrations?|figures?)\b/i,
  charts: /\b(charts?|graphs?|diagrams?|flow ?charts?|plots?|timelines?|mind ?maps?|visuali[sz]\w*)\b/i,
};

export function requestedFeatures(text) {
  if (typeof text !== "string") return [];
  return ALL_FEATURES.filter((id) => REQUEST_PATTERNS[id].test(text));
}

// What the model may use for this request: the selection plus anything asked for.
export function effectiveFeatures(selected, requested) {
  return ALL_FEATURES.filter((id) => selected.includes(id) || requested.includes(id));
}

export function parseStoredFeatures(stored) {
  return typeof stored === "string" ? normalizeFeatures(stored.split(",")) : [...ALL_FEATURES];
}
