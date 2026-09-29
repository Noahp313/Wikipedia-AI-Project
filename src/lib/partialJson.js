// Parses the JSON object a model has written so far, while it's still
// streaming: an unfinished string value is kept (closed where it stops), while
// an unfinished key, number or literal — or a key still waiting for its value —
// is dropped. Returns null until there's at least an opening "{".
//
//   '{"title": "Pho'                  → { title: "Pho" }
//   '{"title": "Photo", "secti'       → { title: "Photo" }
//   '{"sections": [{"heading": "A", ' → { sections: [{ heading: "A" }] }
// Doubles any backslash that doesn't start a valid JSON escape. Models writing
// LaTeX inside JSON strings often emit "\sum" or "\hat{H}" with one backslash,
// which JSON.parse rejects outright — failing the whole response. (Escapes that
// happen to be valid, like "\theta" → tab, are repaired later by
// repairLatexEscapes in lib/markdown.js.)
export function fixJsonEscapes(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt]|[\s\S]?)/g, (match, next, offset) => {
    if (next.length === 5 || (next.length === 1 && `"\\/bfnrt`.includes(next))) return match;
    // Still streaming: an escape cut off at the very end may yet become valid
    if (/^\\(u[0-9a-fA-F]{0,3})?$/.test(text.slice(offset))) return match;
    return `\\\\${next}`;
  });
}

export function parsePartialJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const src = fixJsonEscapes(text.slice(start));

  // Frames for open objects/arrays. Objects track where the current key began
  // and what they expect next: "key" | "colon" | "value" | "comma".
  const stack = [];
  let inString = false;
  let stringIsKey = false;
  let stringStart = -1;
  let escapeAt = -1; // index of a backslash whose escape isn't finished yet
  let literalStart = -1;

  const top = () => stack[stack.length - 1];
  const valueDone = () => {
    const frame = top();
    if (frame) frame.state = "comma";
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escapeAt !== -1) {
        // This char is part of the escape; \uXXXX runs 4 hex digits past the u
        const end = escapeAt + (src[escapeAt + 1] === "u" ? 5 : 1);
        if (i === end) escapeAt = -1;
        continue;
      }
      if (ch === "\\") escapeAt = i;
      else if (ch === '"') {
        inString = false;
        if (stringIsKey) top().state = "colon";
        else valueDone();
      }
      continue;
    }

    if (literalStart !== -1 && /[\s,\]}]/.test(ch)) {
      literalStart = -1;
      valueDone();
    }

    if (ch === '"') {
      const frame = top();
      inString = true;
      stringStart = i;
      stringIsKey = frame?.type === "object" && frame.state === "key";
      if (stringIsKey) frame.keyStart = i;
    } else if (ch === "{") {
      stack.push({ type: "object", state: "key", keyStart: -1 });
    } else if (ch === "[") {
      stack.push({ type: "array", state: "value" });
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      valueDone();
    } else if (ch === ":") {
      top().state = "value";
    } else if (ch === ",") {
      top().state = top().type === "object" ? "key" : "value";
    } else if (!/\s/.test(ch) && literalStart === -1) {
      literalStart = i;
    }
  }

  if (stack.length === 0) {
    try {
      return JSON.parse(src);
    } catch {
      return null;
    }
  }

  let out = src;
  const frame = top();

  if (inString && !stringIsKey) {
    // Keep the partial value; drop an escape sequence that was cut off
    if (escapeAt !== -1) out = out.slice(0, escapeAt);
    out += '"';
  } else {
    let cut = out.length;
    if (inString) cut = stringStart; // partial key
    else if (literalStart !== -1) cut = literalStart; // partial number/true/null
    out = out.slice(0, cut);
    // A key with no value yet (`"key"` or `"key":`) goes too
    if (frame.type === "object" && frame.keyStart !== -1 && (inString || frame.state === "colon" || frame.state === "value")) {
      out = out.slice(0, frame.keyStart);
    }
  }

  out = out.replace(/[\s,]*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i].type === "object" ? "}" : "]";

  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}
