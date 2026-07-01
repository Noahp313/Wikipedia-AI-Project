"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  // Track the user's search query on the landing page.
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Navigate to the article page when the user presses Enter.
  const handleKeyDown = (e) => {
    if (e.key !== "Enter") {
      return;
    }

    e.preventDefault();

    // Convert the query into a clean, URL-friendly slug.
    const slug = query
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w-]/g, "");

    if (!slug) {
      alert("Please enter a valid topic.");
      return;
    }

    router.push(`/article/${slug}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-10 bg-gray-900 text-white">
      <h1 className="text-5xl font-bold tracking-tight">Wikipedia AI</h1>

      <p className="mt-4 text-gray-300 text-center max-w-md">
        Ask anything. Get structured, Wikipedia-style explanations instantly.
      </p>

      <div className="mt-8 w-full max-w-xl">
        <input
          className="w-full p-4 border border-gray-700 bg-gray-800 text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search a topic..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </main>
  );
}
