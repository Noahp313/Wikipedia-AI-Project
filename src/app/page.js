"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "../lib/slugify";

export default function Home() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("recent") || "[]");
    setRecent(stored);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const cleaned = query.toLowerCase().trim();

    const slug = slugify(cleaned);

    if (!slug) {
      alert("Please enter a valid topic.");
      return;
    }

    const updated = [cleaned, ...recent.filter((t) => t !== cleaned)];

    setRecent(updated);
    localStorage.setItem("recent", JSON.stringify(updated.slice(0, 5)));

    router.push(`/article/${slug}`);
  };

  const removeRecent = (itemToRemove) => {
    const existing = JSON.parse(localStorage.getItem("recent") || "[]");
    const updated = existing.filter((item) => item !== itemToRemove);

    localStorage.setItem("recent", JSON.stringify(updated));
    setRecent(updated);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-10 bg-gray-900 text-white">
      {/* Page Title */}
      <h1 className="text-5xl font-bold tracking-tight">Wikipedia AI</h1>

      {/* Page Description */}
      <p className="mt-4 text-gray-300 text-center max-w-md">
        Ask anything. Get structured, Wikipedia-style explanations instantly.
      </p>

      {/* Search Input Section */}
      <div className="mt-8 w-full max-w-xl">
        <input
          className="w-full p-4 border border-gray-700 bg-gray-800 text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search a topic..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Recent Searches List */}
      {recent?.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded mt-2"
        >
          {/* Navigate to article when clicking the search term */}
          <button
            onClick={() =>
              router.push(`/article/${slugify(item)}`)
            }
            className="hover:underline cursor-pointer"
          >
            {item}
          </button>

          {/* Remove button to delete from recent searches */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeRecent(item);
            }}
            className="text-gray-400 hover:text-red-400 text-sm cursor-pointer"
            title="Remove from recent searches"
          >
            ×
          </button>
        </div>
      ))}
    </main>
  );
}
