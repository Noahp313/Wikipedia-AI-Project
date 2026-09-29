"use client";

import { useEffect, useState } from "react";

let renderCount = 0;

function prefersDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// A model-written Mermaid diagram. Mermaid (~1 MB) is only loaded on pages that
// have one. Anything that doesn't parse renders nothing rather than an error box.
// The label says it's AI-generated: unlike images, nothing here is sourced.
export default function MermaidDiagram({ code }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++renderCount}`;

    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict", // sanitizes labels; no scripts or links
          theme: prefersDark() ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        if (!(await mermaid.parse(code, { suppressErrors: true }))) throw new Error("Invalid diagram");
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setState({ status: "ready", svg });
      })
      .catch((err) => {
        console.warn("Diagram not rendered:", err.message);
        // Mermaid can leave its error graphic attached to <body>
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setState({ status: "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.status === "failed") return null;

  return (
    <span className="md-figure">
      {state.status === "ready" ? (
        <span className="md-diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />
      ) : (
        <span className="block h-32 animate-pulse rounded-lg bg-subtle" />
      )}
      <span className="md-credit">AI-generated diagram</span>
    </span>
  );
}
