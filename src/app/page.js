"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Home page component - Landing page for Wikipedia AI application.
 * Allows users to search for topics and maintains a history of recent searches.
 *
 * Features:
 * - Search input for Wikipedia article topics
 * - Recent search history stored in localStorage (last 5 searches)
 * - Quick access to previously searched topics
 * - URL-slug generation for clean routing
 *
 * @returns {React.ReactElement} Home page UI
 */
export default function Home() {
  // State: User's current search query input
  const [query, setQuery] = useState("");
  const router = useRouter();
  // State: List of recently searched topics
  const [recent, setRecent] = useState([]);

  /**
   * Initialize component by loading recent search history from localStorage
   * Runs once on component mount
   */
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("recent") || "[]");
    setRecent(stored);
  }, []);

  /**
   * Handles Enter key press in the search input.
   * Converts query to URL slug and navigates to the article page.
   * Updates recent search history in localStorage.
   *
   * @param {React.KeyboardEvent} e - The keyboard event object
   */
  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    // Normalize and clean the search query
    const cleaned = query.toLowerCase().trim();

    // Convert the query into a clean, URL-friendly slug
    // Replaces spaces/underscores with hyphens, removes special characters
    const slug = cleaned.replace(/[\s_]+/g, "-").replace(/[^\w-]/g, "");

    if (!slug) {
      alert("Please enter a valid topic.");
      return;
    }

    // Load existing recent searches and add new query (avoiding duplicates)
    const existing = JSON.parse(localStorage.getItem("recent") || "[]");
    const updated = [cleaned, ...existing.filter((t) => t !== cleaned)];

    // Save up to 5 most recent searches
    localStorage.setItem("recent", JSON.stringify(updated.slice(0, 5)));

    // Navigate to the article page with the generated slug
    router.push(`/article/${slug}`);
  };

  /**
   * Removes a topic from the recent search history.
   *
   * @param {string} itemToRemove - The search term to remove from history
   */
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
              router.push(`/article/${item.replace(/\s+/g, "-")}`)
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
