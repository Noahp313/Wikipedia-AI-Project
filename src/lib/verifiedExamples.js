// Worked examples checked by running code. Only used when the reader directly
// asks for examples and a quick Flash-Lite check says there's something to
// compute (examplesNeedChecking): a pre-pass (Gemini with code execution) writes the
// examples and recomputes their numbers before the article is written; the
// writer then places them with [[example:N]] placeholders, which the server
// swaps for the example text verbatim — so the checked numbers can't drift
// while the writer rewrites around them.

import { callGemini } from "./geminiClient";
import { levelInstructions } from "./explanationLevels";

const MODEL = "gemini-3.5-flash";
const GATE_MODEL = "gemini-3.1-flash-lite";
const MAX_EXAMPLES = 2;
// Code execution runs several model/code round trips. No retries on top: a
// timeout goes straight to the Flash-Lite fallback, so the worst case is ~2x this.
const TIMEOUT_MS = 60_000;

// "give me some examples", "a worked problem", "sample calculations" — but not
// "for example, …", which is just phrasing.
const REQUEST_PATTERN =
  /(?<!\bfor\s)\bexamples?\b|\bworked[- ](?:problems?|solutions?)\b|\bsample (?:problems?|calculations?)\b/i;

export function requestsExamples(text) {
  return typeof text === "string" && REQUEST_PATTERN.test(text);
}

// A cheap yes/no before the slow code-checked pass: is there anything in
// examples for this request that code could check? "Examples of Renaissance
// painters" has nothing to compute, so it skips straight to the writer.
const GATE_CONTEXT_CHARS = 2000;
export async function examplesNeedChecking({ request, context, source }) {
  const prompt = `
A reader asked for examples: "${request}"

${context ? `The article is about:\n"""\n${context.slice(0, GATE_CONTEXT_CHARS)}\n"""\n` : ""}
Would good examples for this request involve anything a computer could check by computing it — arithmetic,
formulas, algebra, calculus, probability, statistics, physics or chemistry calculations, logic, or the output of code?
Examples that are only descriptive (people, events, artworks, species, historical cases) have nothing to check.

Return ONLY JSON: { "checkable": true | false }`;
  try {
    const data = await callGemini({ source, prompt, model: GATE_MODEL, json: true, temperature: 0 });
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const checkable = JSON.parse(text).checkable;
    // Anything but a clear "no" gets checked — accuracy is the point
    return checkable !== false;
  } catch (err) {
    console.error("[verifiedExamples] gate failed, checking anyway:", err.message);
    return true;
  }
}

function buildPrompt({ request, context, level }) {
  return `
You are writing worked examples for an encyclopedia-style article, and checking them by running code.

The reader asked: "${request}"

${context ? `CONTEXT (what the article is about):\n"""\n${context}\n"""\n` : ""}
Write 1 or ${MAX_EXAMPLES} worked examples that best answer the request — one is usually enough; add a second only if it shows
something clearly different.

For every example that involves any calculation, algebra, calculus, probability, logic or other checkable result:
1. Work it out.
2. Write Python code that recomputes every number and the final answer independently (use sympy for symbolic
   math, fractions for exact arithmetic) and run it.
3. If the code disagrees with your working, trust the code and correct the example. If you can't make them agree,
   leave the example out.

Examples with nothing to compute (e.g. a historical illustration) don't need code.

${levelInstructions(level)}

When done, output ONLY the final examples in exactly this format — nothing after the last END:

### EXAMPLE
Title: <short title>
Checked: <yes if code confirmed every number and the final answer, otherwise no>
<the example in Markdown: the problem, the worked solution, then a final line starting with **Answer:**>
### END

Formatting inside each example:
- Markdown. ALL math in LaTeX: inline $...$, display $$...$$. Tables are fine where a grid helps.
- No headings (#), images, links, HTML or code blocks — the reader never sees the code.
`;
}

// Final text only (not thoughts), and whether any code actually ran successfully.
function readResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const codeRan = parts.some((p) => p.codeExecutionResult?.outcome === "OUTCOME_OK");
  return { text, codeRan };
}

function parseExamples(text, codeRan) {
  const blocks = [...text.matchAll(/### EXAMPLE\s*\n([\s\S]*?)\n\s*### END/g)].map((m) => m[1]);
  return blocks
    .map((block) => {
      const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
      const checkedLine = block.match(/^Checked:\s*(\w+)/m);
      const body = block
        .replace(/^Title:.*$/m, "")
        .replace(/^Checked:.*$/m, "")
        .trim();
      if (!title || !body) return null;
      // The model's "yes" only counts if code really ran in this response
      const checked = codeRan && checkedLine?.[1]?.toLowerCase() === "yes";
      return { title, body, checked };
    })
    .filter(Boolean)
    .slice(0, MAX_EXAMPLES);
}

// Returns [{ title, body, checked }], or [] if anything goes wrong — the
// writer then handles examples the old way rather than failing the request.
export async function generateVerifiedExamples({ request, context, level, source }) {
  try {
    const data = await callGemini({
      source,
      prompt: buildPrompt({ request, context, level }),
      model: MODEL,
      apiVersion: "v1beta",
      tools: [{ codeExecution: {} }],
      timeoutMs: TIMEOUT_MS,
      maxRetries: 0,
    });
    const { text, codeRan } = readResponse(data);
    const examples = parseExamples(text, codeRan);
    console.log(
      `[verifiedExamples] ${examples.length} example(s), ${examples.filter((e) => e.checked).length} checked, code ran: ${codeRan}`
    );
    return examples;
  } catch (err) {
    console.error("[verifiedExamples] failed, continuing without:", err.message);
    return [];
  }
}

// Prompt block for the writer, or "" when there are no examples.
export function examplesPrompt(examples) {
  if (examples.length === 0) return "";
  const list = examples
    .map(
      (e, i) =>
        `[${i + 1}] ${e.title}${e.checked ? " (calculations checked by code)" : ""}\n${e.body}`
    )
    .join("\n\n");
  return `WORKED EXAMPLES — the reader asked for examples. These have already been written${
    examples.some((e) => e.checked) ? " and their calculations checked" : ""
  }:
"""
${list}
"""
- Include each of them where it fits best by writing the placeholder [[example:N]] as its own paragraph
  (e.g. "...\\n\\n[[example:1]]\\n\\n..."). The app replaces the placeholder with the full example exactly as above.
- Never restate, rewrite or recompute these examples yourself, and don't write other worked examples of your own.
- You may introduce an example or draw a conclusion from it in the surrounding text.`;
}

const PLACEHOLDER = /\[\[example:(\d+)\]\]/g;
// An unfinished placeholder at the end of streamed text ("[[exam")
const PARTIAL_PLACEHOLDER = /\[\[[^\]\n]{0,12}$/;

function renderExample(example) {
  return `**Example: ${example.title}**\n\n${example.body}`;
}

// Swaps placeholders for example text. Each example appears at most once in
// the whole article: `used` is shared across the sections of one response.
// Returns the content, whether any example landed in it (inserted) and
// whether a code-checked one did (verified).
export function insertExamples(content, examples, used = new Set(), { partial = false } = {}) {
  if (typeof content !== "string" || (examples.length === 0 && !content.includes("[["))) {
    return { content, inserted: false, verified: false };
  }
  let inserted = false;
  let verified = false;
  let replaced = false;
  let text = partial ? content.replace(PARTIAL_PLACEHOLDER, "") : content;
  text = text.replace(PLACEHOLDER, (_, n) => {
    replaced = true;
    const example = examples[Number(n) - 1];
    if (!example || used.has(example)) return "";
    used.add(example);
    inserted = true;
    if (example.checked) verified = true;
    return renderExample(example);
  });
  // Tidy the gap a dropped placeholder leaves
  if (replaced && !partial) text = text.replace(/\n{3,}/g, "\n\n").trim();
  return { content: text, inserted, verified };
}

// A section holding a code-checked example gets the "verified example" tag.
// Any inserted example is AI-written, so the section can't be pure "source".
export function withExampleProvenance(section, inserted, verified) {
  return {
    ...section,
    ...(inserted && section.sourceStatus === "source" && { sourceStatus: "hybrid" }),
    ...(verified && { verifiedExamples: true }),
  };
}
