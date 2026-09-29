"use client";

import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { isWikimediaUrl, repairLatexEscapes, trimIncompleteMarkdown } from "../../lib/markdown";
import MermaidDiagram from "./MermaidDiagram";

const remarkPlugins = [
  remarkGfm,
  // Math before breaks, so line breaks inside $$…$$ stay part of the formula
  [remarkMath, { singleDollarTextMath: true }],
  // Articles written before Markdown used single newlines as line breaks
  remarkBreaks,
];
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: false, errorColor: "var(--danger)" }]];

// react-markdown drops unknown URL schemes by default; keep our "image:N" refs
const urlTransform = (url) => (url.startsWith("image:") ? url : defaultUrlTransform(url));

// An image from the article's Wikipedia menu (see lib/wikiImages.js), with the
// credit line its license requires. Spans with display:block, since Markdown
// may put it inside a paragraph.
function SourcedImage({ image, alt }) {
  const caption = alt || image.caption;
  return (
    <span className="md-figure">
      {/* Wikimedia thumbnail at a known size; next/image would need remote config for little gain */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={caption}
        width={image.width}
        height={image.height}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className="md-caption">{caption}</span>
      <span className="md-credit">
        {[image.credit, image.license].filter(Boolean).join(" · ")}
        {image.descriptionUrl && (
          <>
            {" · "}
            <a href={image.descriptionUrl} target="_blank" rel="noopener noreferrer">
              Wikimedia Commons
            </a>
          </>
        )}
      </span>
    </span>
  );
}

// Sections already have headings, and model-written links/images can't be
// trusted — so headings render as bold lines, links as plain text, and only
// images from the article's own menu are shown.
function buildComponents(images) {
  const Subheading = ({ children }) => <span className="md-subheading">{children}</span>;
  return {
    h1: Subheading,
    h2: Subheading,
    h3: Subheading,
    h4: Subheading,
    h5: Subheading,
    h6: Subheading,
    a: ({ children }) => <>{children}</>,
    img: ({ src, alt }) => {
      const match = typeof src === "string" && src.match(/^image:(\d+)$/);
      const image = match ? images[Number(match[1]) - 1] : null;
      return image && isWikimediaUrl(image.url) ? <SourcedImage image={image} alt={alt} /> : null;
    },
    pre: ({ node, children, ...props }) => {
      const code = node?.children?.[0];
      const classes = code?.properties?.className;
      if (code?.tagName === "code" && Array.isArray(classes) && classes.includes("language-mermaid")) {
        return <MermaidDiagram code={(code.children ?? []).map((c) => c.value ?? "").join("")} />;
      }
      return <pre {...props}>{children}</pre>;
    },
    // Wide tables scroll sideways instead of widening the page
    table: ({ node: _node, ...props }) => (
      <div className="md-table">
        <table {...props} />
      </div>
    ),
  };
}

// Section content (GitHub-flavored Markdown + LaTeX math + menu images +
// Mermaid). `streaming` hides anything half-written and shows a caret after
// the last block. `images` is the article's image menu.
const NO_IMAGES = [];

export default function MarkdownContent({ children, streaming = false, images = NO_IMAGES, className = "", ...props }) {
  // Stable per image menu: new component types each render would remount
  // diagrams (re-running Mermaid) and drop text selections/highlights
  const components = useMemo(() => buildComponents(Array.isArray(images) ? images : []), [images]);
  let source = repairLatexEscapes(typeof children === "string" ? children : "");
  if (streaming) source = trimIncompleteMarkdown(source);

  return (
    <div className={`md ${streaming ? "md-streaming" : ""} ${className}`} {...props}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
