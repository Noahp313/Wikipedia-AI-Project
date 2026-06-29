"use client";
import { useParams, useRouter } from "next/navigation";

export default function ArticlePage() {
  const params = useParams();
  const topic = params?.topic ?? "";
  const title = topic.replace(/-/g, " ");

  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-900 text-white px-8 py-12">

        <button
            onClick={() => router.push("/")}
            className="mb-6 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition"
        >
            ← Home
        </button>


      {/* Page container */}
      <div className="max-w-6xl mx-auto">

        {/* Title */}
        <h1 className="text-5xl font-bold capitalize">
          {title}
        </h1>

        {/* Subtitle */}
        <p className="mt-3 text-gray-400 max-w-2xl">
          AI-generated Wikipedia-style article about {title}.
        </p>

        {/* Layout grid */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* MAIN CONTENT */}
          <div className="md:col-span-2 space-y-8">

            <section>
              <h2 className="text-2xl font-semibold">Overview</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                This is a placeholder section. Later, your AI will generate a structured overview of {title}.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">History</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                Historical context will be dynamically generated here by your AI system.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Key Ideas</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                Important concepts, discoveries, or definitions will appear here.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Impact</h2>
              <p className="mt-2 text-gray-300 leading-relaxed">
                This section will describe influence and significance.
              </p>
            </section>

          </div>

          {/* INFOBOX */}
          <aside className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-fit">

            <h3 className="text-xl font-semibold mb-4">
              Quick Facts
            </h3>

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