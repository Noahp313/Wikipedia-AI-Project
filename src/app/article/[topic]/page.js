"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function ArticlePage() {
  // Get the dynamic topic from the URL segment.
  const params = useParams();
  const topic = params?.topic ?? "";

  // Convert URL slugs like "artificial-intelligence" into a readable title.
  const title = topic.replace(/-/g, " ");

  const router = useRouter();

  // Store the fetched article content and page state.
  const [jsonResult, setJsonResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadArticle() {
      try {
        setLoading(true);

        // Request the generated article from the internal API route.
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

    // Only fetch when a valid topic is present.
    if (topic) {
      loadArticle();
    }
  }, [topic]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <main className="min-h-screen bg-gray-900 text-white px-8 py-12">
      {/* Back button to return to the home page. */}
      <button
        onClick={() => router.push("/")}
        className="mb-6 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition"
      >
        ← Home
      </button>

      {/* Main content container for the article layout. */}
      <div className="max-w-6xl mx-auto">
        {/* Article title shown in human-readable form. */}
        <h1 className="text-5xl font-bold capitalize">{title}</h1>

        {/* Subtitle describing the generated content. */}
        <p className="mt-3 text-gray-400 max-w-2xl">
          AI-generated Wikipedia-style article about {title}.
        </p>

        {/* Responsive layout with article content and quick facts box. */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Main article body. */}
          <div className="md:col-span-2 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold">Overview</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                {jsonResult?.overview}
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">History</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                {jsonResult?.history}
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Key Ideas</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                {jsonResult?.keyIdeas}
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Impact</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                {jsonResult?.impact}
              </p>
            </section>
          </div>

          {/* Side panel with quick facts about the topic. */}
          <aside className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-fit">
            <h3 className="text-xl font-semibold mb-4">Quick Facts</h3>

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
      </div>
    </main>
  );
}