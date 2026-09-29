// Section content is GitHub-flavored Markdown with LaTeX math, images picked
// from the article's Wikipedia image menu, and (rarely) a Mermaid diagram.
// Shared by the prompts (server) and the renderer (client), so no server-only imports.

import { effectiveFeatures } from "./features";

// Media limits, enforced on the server after generation (enforceMediaLimits) —
// the prompt asks for restraint, this guarantees it.
export const MAX_IMAGES_PER_SECTION = 1;
export const MAX_IMAGES_PER_ARTICLE = 2;
export const MAX_DIAGRAMS_PER_ARTICLE = 1;

// What media this request may use: the reader's selected features (see
// lib/features.js) plus anything they directly asked for. A direct request
// always wins, and gets one extra over the usual cap so "add a chart" works
// even when the article already has one.
export function mediaPolicy(selected, requested = []) {
  const features = effectiveFeatures(selected, requested);
  const extra = (id) => (requested.includes(id) ? 1 : 0);
  return {
    features,
    requested,
    maxImages: features.includes("images") ? MAX_IMAGES_PER_ARTICLE + extra("images") : 0,
    maxDiagrams: features.includes("charts") ? MAX_DIAGRAMS_PER_ARTICLE + extra("charts") : 0,
  };
}

// Prompt guidance for any "content" the model writes. Always Markdown, all math
// in LaTeX; tables and charts per the media policy (images are covered
// separately by imageMenuPrompt).
export function markdownGuidelines(policy) {
  const asked = (id) => policy.requested.includes(id);
  const on = (id) => policy.features.includes(id);

  const tables = asked("tables")
    ? `- The reader explicitly asked for a table — include one where it fits best (an explicit request always overrides their settings).`
    : on("tables")
    ? `- Tables: the default is NONE. Use one only when the reader's question is itself about data with a grid shape, so that prose would plainly be worse — e.g. a payoff matrix when the question is about a game's equilibrium, a truth table when it's about a logic operator, a side-by-side comparison when the reader asks to compare things. Never add a table just to summarize or restate text.`
    : `- Do NOT use tables — the reader turned them off.`;

  const chartHow = `Write it as a Mermaid code block ("\`\`\`mermaid" … "\`\`\`"): flowchart, timeline or mindmap for a process, cycle, sequence of stages or hierarchy; xychart-beta (bar/line) or pie for a numeric comparison, using only figures stated in the source material or firmly established. At most ~12 nodes or data points, short labels. Never diagram or chart anything you'd have to guess at.`;
  const charts = asked("charts")
    ? `- The reader explicitly asked for a diagram or chart — include one (an explicit request always overrides their settings). ${chartHow}`
    : on("charts")
    ? `- Diagrams and charts: the default is NONE. Add one only when the reader's question is centrally about something that is inherently visual — a multi-stage process or cycle, a hierarchy, or a numeric comparison — and a picture is much clearer than prose. At most ONE in the whole article. ${chartHow}`
    : `- Do NOT include diagrams or charts — the reader turned them off.`;

  const images = on("images") ? "" : `- Do NOT include images — the reader turned them off.\n`;

  return `FORMATTING — each section's "content" is ALWAYS GitHub-flavored Markdown:
- Paragraphs separated by a blank line ("\\n\\n"). Use Markdown wherever it makes the text clearer: bulleted or numbered lists for steps, procedures, sequences or three or more parallel items, and **bold** for a key term where it's first defined.
- ALL mathematics in LaTeX — every formula, equation, variable, symbol and operator: inline as $...$, and important equations on their own line as $$...$$. Never write math as plain text or Unicode symbols (write $\\hat{H} = \\hat{T} + \\hat{V}$, not "Ĥ = T̂ + V̂").
${tables}
${charts}
${images}- Never use headings (#), links, image URLs or HTML inside content — each section already has its own heading.
- This is JSON: escape every LaTeX backslash as \\\\ (write "\\\\frac", "\\\\theta", "\\\\nabla") and newlines as \\n.`;
}

// Images are only ever shown from Wikimedia's own hosts (full files and thumbnails).
export function isWikimediaUrl(url) {
  return typeof url === "string" && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url);
}

// The numbered image menu for a prompt, or "" when there are no images.
// images: the article's image list (see lib/wikiImages.js); ids are 1-based positions.
export function imageMenuPrompt(images, alreadyUsed, policy) {
  if (policy.maxImages === 0 || !images.some(Boolean)) return "";
  // Invalid entries are null placeholders that keep the numbering stable
  const menu = images
    .map((img, i) => (img ? `[${i + 1}] ${img.caption}` : null))
    .filter(Boolean)
    .join("\n");
  const remaining = Math.max(policy.maxImages - alreadyUsed, 0);
  const when = policy.requested.includes("images")
    ? `- The reader explicitly asked for an image — include the most relevant one from this list (an explicit request always overrides their settings). If none of them fits, don't force one.`
    : `- The default is NO image. Add one only when an image on this list is directly about what the reader asked — a diagram of the exact structure or process being explained, or a picture of the subject itself — and the text is clearly easier to follow with it. Never add one as decoration or because it's loosely related.
- At most ONE image in the article unless a second shows something clearly different that the text relies on.`;
  return `IMAGES — real images from Wikipedia and Wikimedia Commons, the ONLY images you may use:
${menu}
${when}
- Judge each image only by its caption. Skip any whose caption doesn't clearly match the subject, or that is in another language or says its labels are (e.g. "with Czech labels") — the reader needs English labels.
- Hard limit: one per section and ${remaining} more in the whole article; never reuse one.
- To add one, put ![short caption in your own words](image:N) on its own line in that section's content, right after the paragraph it illustrates.`;
}

// Valid JSON escapes that a missed LaTeX backslash turns into control
// characters: "\theta" → tab + "heta", "\frac" → form feed + "rac", etc.
// Only repaired inside math, and for \n only before common commands, since a
// real newline can legitimately precede a letter.
// Inline spans may contain single newlines (a broken "\nabla" is one) but not blank lines
const MATH_SPAN = /\$\$[\s\S]*?\$\$|\$(?:[^$\n]|\n(?!\n))*?\$/g;
const BROKEN_NEWLINE =
  /\n(?=(?:abla|eq|e|u|ot|i|leq|geq|mid|parallel|subset|subseteq|exists|ewline|atural|ormalsize)(?![a-zA-Z]))/g;

export function repairLatexEscapes(markdown) {
  if (typeof markdown !== "string" || !markdown.includes("$")) return markdown;
  return markdown.replace(MATH_SPAN, (span) =>
    span
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/\r/g, "\\r")
      .replace(/\x08/g, "\\b")
      .replace(BROKEN_NEWLINE, "\\n")
  );
}

const IMAGE_REF = /!\[([^\]\n]*)\]\(image:(\d+)\)/g;
const DIAGRAM_BLOCK = /```mermaid[\s\S]*?```/g;

export function countImageRefs(sections) {
  return sections.reduce((n, s) => n + ((typeof s.content === "string" && s.content.match(IMAGE_REF)) || []).length, 0);
}

// The menu images the article actually shows, in reading order, once each —
// for the Sources panel. Only images the renderer would display count.
export function usedImages(sections, images) {
  if (!Array.isArray(images)) return [];
  const used = new Map();
  for (const s of sections) {
    if (typeof s.content !== "string") continue;
    for (const [, , n] of s.content.matchAll(IMAGE_REF)) {
      const image = images[Number(n) - 1];
      if (image && isWikimediaUrl(image.url) && !used.has(image.file)) used.set(image.file, image);
    }
  }
  return [...used.values()];
}

export function countDiagrams(sections) {
  return sections.reduce((n, s) => n + ((typeof s.content === "string" && s.content.match(DIAGRAM_BLOCK)) || []).length, 0);
}

// A GFM table: a pipe row followed by its |---| separator row
const TABLE = /^[ \t]*\|.*\|[ \t]*\n[ \t]*\|?[ \t]*:?-{3,}/gm;

export function countTables(sections) {
  return sections.reduce((n, s) => n + ((typeof s.content === "string" && s.content.match(TABLE)) || []).length, 0);
}

const UNMET_NOTES = {
  tables: "No table was added — nothing here fit one.",
  images: "I couldn't find a suitable image in Wikipedia or Wikimedia Commons for this. A diagram might work instead — ask for one.",
  charts: "No chart was added — there wasn't a clear structure or reliable figures to draw.",
};

// A reader who directly asked for a feature is told when the article ends up
// without it, rather than the request silently not happening. Built from what
// the article actually contains, so it never claims something that isn't there.
export function unmetRequestNote(requested, sections) {
  const count = { tables: countTables, images: countImageRefs, charts: countDiagrams };
  return requested
    .filter((id) => count[id](sections) === 0)
    .map((id) => UNMET_NOTES[id])
    .join(" ");
}

// Drops image references that aren't on the menu, repeat an image, or exceed
// the per-section / per-article caps, and diagrams past the cap — including
// everything of a kind the policy doesn't allow. Earlier sections win, so
// existing media stays put when a later section adds more.
export function enforceMediaLimits(sections, images, policy) {
  const used = new Set();
  let imageCount = 0;
  let diagramCount = 0;

  return sections.map((section) => {
    if (typeof section.content !== "string") return section;
    let inSection = 0;

    const content = section.content
      .replace(IMAGE_REF, (ref, _alt, n) => {
        const id = Number(n);
        const allowed =
          images[id - 1] &&
          !used.has(id) &&
          inSection < MAX_IMAGES_PER_SECTION &&
          imageCount < policy.maxImages;
        if (!allowed) return "";
        used.add(id);
        inSection += 1;
        imageCount += 1;
        return ref;
      })
      .replace(DIAGRAM_BLOCK, (block) => (diagramCount++ < policy.maxDiagrams ? block : ""))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return content === section.content ? section : { ...section, content };
  });
}

// While content is still streaming in, hide whatever hasn't finished yet so it
// doesn't flash as broken output: an unclosed diagram block, a half-written
// image reference, or a formula whose closing $ hasn't arrived.
export function trimIncompleteMarkdown(markdown) {
  let out = markdown;

  const fences = (out.match(/```/g) ?? []).length;
  if (fences % 2 === 1) out = out.slice(0, out.lastIndexOf("```"));

  out = out.replace(/!\[[^\]\n]*(\]\([^)\n]*)?$/, "");

  const displayCount = (out.match(/\$\$/g) ?? []).length;
  if (displayCount % 2 === 1) return out.slice(0, out.lastIndexOf("$$"));

  const lastBlock = out.slice(out.lastIndexOf("\n") + 1).replace(/\$\$/g, "");
  const inlineCount = (lastBlock.match(/(?<!\\)\$/g) ?? []).length;
  if (inlineCount % 2 === 1) return out.slice(0, out.lastIndexOf("$"));

  return out;
}
