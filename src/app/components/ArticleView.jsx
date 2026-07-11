// components/article/ArticleView.jsx
import { slugify } from "../../lib/slugify";
import Link from "next/link";

function BackButton() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-md border border-gray-700 bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
    >
      ← Back to search
    </Link>
  );
}

function sourceStatusStyle(status) {
  switch (status) {
    case "source":
      return { label: "Source", color: "bg-green-500" };
    case "hybrid":
      return { label: "Hybrid", color: "bg-yellow-500" };
    case "generated":
      return { label: "Generated", color: "bg-red-500" };
    default:
      return { label: "Unknown", color: "bg-gray-500" };
  }
}

function TableOfContents({ sections }) {
  return (
    <nav className="sticky top-10 self-start w-56 flex-shrink-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Contents
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {sections.map((s) => {
          const slug = slugify(s.heading);
          return (
            <li key={slug}>
              <a
                href={`#${slug}`}
                className="text-sm text-gray-300 hover:text-blue-400 transition-colors block"
              >
                {s.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ArticleBody({ article }) {
  return (
    <article className="max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight border-b border-gray-700 pb-4 mb-8">
        {article.title}
      </h1>

      {article.sections.map((s) => {
        const slug = slugify(s.heading);
        const { label, color } = sourceStatusStyle(s.sourceStatus);
        return (
          <section id={slug} key={slug} className="mb-8 scroll-mt-10">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-2xl font-semibold">{s.heading}</h2>
              <span
                className={`w-2 h-2 rounded-full ${color}`}
                title={label}
              />
            </div>
            <p className="text-gray-200 leading-relaxed whitespace-pre-line">
              {s.content}
            </p>
          </section>
        );
      })}
    </article>
  );
}

function ArticleChatPanel() {
  return (
    <aside className="sticky top-10 self-start h-[calc(100vh-5rem)] w-full rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center">
      <p className="text-sm text-gray-500">Chat coming soon</p>
    </aside>
  );
}

export default function ArticleView({ article }) {
  if (!article || !Array.isArray(article.sections)) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="flex w-full">
        {/* Left: TOC + Article — widened from 1/2 to 3/5 */}
        <div className="w-3/5 flex gap-10 px-8 py-10">
          <div className="w-56 flex-shrink-0">
            <BackButton />
            <TableOfContents sections={article.sections} />
          </div>
          <ArticleBody article={article} />
        </div>

        {/* Right: Chat — narrowed from 1/2 to 2/5 */}
        <div className="w-2/5 px-8 py-10">
          <ArticleChatPanel />
        </div>
      </div>
    </div>
  );
}
