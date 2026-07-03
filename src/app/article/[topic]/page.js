"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

/**
 * Article page component - Displays AI-generated Wikipedia-style articles.
 * Dynamic route component that fetches and renders articles based on URL topic parameter.
 *
 * Features:
 * - Fetches AI-generated article content from API
 * - Displays article with table of contents and sections
 * - Shows quick facts sidebar
 * - Caches articles on server for performance
 * - Handles loading and error states
 *
 * @returns {React.ReactElement} Article page with generated content
 */
export default function ArticlePage() {
  // Get the dynamic topic parameter from the URL (e.g., [topic] from /article/[topic])
  const params = useParams();
  const topic = params?.topic ?? "";

  // Convert URL slugs (e.g., "artificial-intelligence") into readable titles ("artificial intelligence")
  const title = topic.replace(/-/g, " ");

  // Router for navigation (back button)
  const router = useRouter();

  // State: Parsed article content with sections and metadata
  const [jsonResult, setJsonResult] = useState(null);
  // State: Loading indicator while fetching article
  const [loading, setLoading] = useState(true);
  // State: Error message if fetch fails
  const [error, setError] = useState(null);

  /**
   * Fetch article content from the API route.
   * Runs whenever the topic changes.
   */
  useEffect(() => {
    async function loadArticle() {
      try {
        setLoading(true);

        // Request the AI-generated article from the internal API route
        const res = await fetch("/api/article", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ topic }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Request failed");
        }

        const json = await res.json();
        setJsonResult(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    // Only fetch when a valid topic is present in the URL
    if (topic) {
      loadArticle();
    }
  }, [topic]);

  // Show loading state while fetching article
  if (loading) return <div className="p-10 text-white">Loading article...</div>;

  // Show error state if fetch failed
  if (error) return <div className="p-10 text-red-500">Error: {error}</div>;

  return (
    <main className="min-h-screen bg-gray-900 text-white px-8 py-12">
      {/* Navigation: Back button to return to home page */}
      <button
        onClick={() => router.push("/")}
        className="mb-6 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition cursor-pointer"
        aria-label="Go back to home page"
      >
        ← Home
      </button>

      {/* Main content container with responsive grid layout */}
      <div className="max-w-6xl mx-auto">
        {/* Article Header */}
        <h1 className="text-5xl font-bold capitalize">{title}</h1>
        <p className="mt-3 text-gray-400 max-w-2xl">
          AI-generated Wikipedia-style article about {title}.
        </p>

        {/* Responsive layout: 3-column grid (table of contents, main content, quick facts) */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Table of Contents Sidebar (Left Column) */}
          <aside className="bg-gray-800 p-4 rounded-lg h-fit sticky top-10">
            <h3 className="text-lg font-semibold mb-3">Contents</h3>
            <ul className="space-y-2 text-sm">
              {jsonResult.sections.map((section, i) => {
                // Generate URL-friendly anchor IDs from section headings
                const id = section.heading.toLowerCase().replace(/\s+/g, "-");

                return (
                  <li key={i}>
                    <a
                      href={`#${id}`}
                      className="text-gray-300 hover:text-white hover:underline"
                    >
                      {section.heading}
                    </a>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Main Article Content (Middle Column - Spans 2 columns on medium screens) */}
          <div className="md:col-span-2">
            {jsonResult.sections.map((section, i) => {
              // Create URL-friendly anchor IDs for section linking
              const id = section.heading.toLowerCase().replace(/\s+/g, "-");

              return (
                <section
                  key={i}
                  className="mb-10"
                  id={id}
                >
                  <h2 className="text-2xl font-semibold mb-2">
                    {section.heading}
                  </h2>
                  <p className="text-gray-300 leading-relaxed">
                    {section.content}
                  </p>
                </section>
              );
            })}
          </div>

          {/* Quick Facts Sidebar (Right Column) */}
          <aside className="bg-gray-800 p-4 rounded-lg h-fit">
            <h3 className="text-lg font-semibold mb-3">Quick Facts</h3>
            <p className="text-gray-400 text-sm">
              Key facts placeholder - expandable for future enhancements
            </p>
          </aside>
        </div>

        {/* Information Panel - Article Metadata */}
        <aside className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-fit mt-10">
          <h3 className="text-xl font-semibold mb-4">Article Information</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div>
              <span className="text-gray-400">Topic:</span>
              <div className="text-white capitalize">{title}</div>
            </div>
            <div>
              <span className="text-gray-400">Type:</span>
              <div className="text-white">AI-generated article</div>
            </div>
            <div>
              <span className="text-gray-400">Source:</span>
              <div className="text-white">Wikipedia AI</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}