// components/article/ArticleView.jsx
"use client";

import { useState } from "react";
import { slugify } from "../../lib/slugify";
import Link from "next/link";
import SaveArticleButton from "./SaveArticleButton";

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
    <nav>
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

function UsedTopics({ topics }) {
  if (!topics || topics.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Used Topics
      </h3>
      <ul className="space-y-2 border-l border-gray-700 pl-3">
        {topics.map((topic) => (
          <li key={topic} className="text-sm text-gray-300">
            {topic}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleBody({ article, articleId }) {
  return (
    <article className="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-gray-700 pb-4 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">
          {article.title}
        </h1>
        <SaveArticleButton articleId={articleId} />
      </div>

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

function ChatMessage({ role, content }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-700 text-gray-100"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function ArticleChatPanel({ articleId, article, onArticleUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const detectRelevance = async ({ query, usedTopics, history, currentTopic }) => {
    const res = await fetch("/api/chatbot-detect-relevance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, usedTopics, history, currentTopic }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "detect-relevance request failed");
    }

    return res.json(); // { relevantSections, chatContextStatus }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError(null);

    const historyForCall = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);

    // sourceTopics as of this turn; may get extended below if new topics are processed
    let usedTopics = article.sourceTopics;

    try {
      const newTopicRes = await fetch("/api/identify-new-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sourceTopics: article.sourceTopics,
        }),
      });

      if (!newTopicRes.ok) {
        const err = await newTopicRes.json();
        throw new Error(err.error || "Explain request failed");
      }

      const { newTopicNecessary, newTopics } = await newTopicRes.json();

      if (newTopicNecessary) {
        console.log("New topic needed:", newTopics);

        try {
          const res = await fetch("/api/process-topics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topics: newTopics }),
          });

          if (!res.ok && res.status !== 207) {
            throw new Error(`process-topics failed: ${res.status}`);
          }

          const { processed } = await res.json();

          const failed = processed.filter((p) => p.status === "error");
          const succeeded = processed.filter((p) => p.status !== "error");

          if (failed.length > 0) {
            console.warn("Some topics failed to process:", failed);
            const failedNames = failed.map((f) => f.topic).join(", ");
            setError(`Couldn't fully process: ${failedNames}`);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `I ran into trouble looking into ${failedNames}. The rest of your answer may be incomplete — feel free to ask again.`,
              },
            ]);
          }

          if (succeeded.length > 0) {
            const newTopicNames = succeeded.map((p) => p.topic);
            usedTopics = [...usedTopics, ...newTopicNames];

            onArticleUpdate((prevArticle) => ({
              ...prevArticle,
              sourceTopics: [...prevArticle.sourceTopics, ...newTopicNames],
            }));
          }
        } catch (err) {
          console.error("Failed to process new topics:", err);
          setError(err.message);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "I couldn't look into that topic further, but here's what I have so far." },
          ]);
        }
      }

      // Relevance detection against whatever topics are in play now
      try {
        const { relevantSections, chatContextStatus } = await detectRelevance({
          query: trimmed,
          usedTopics,
          history: historyForCall,
          currentTopic: article.title,
        });

        console.log("[chat] relevance result", chatContextStatus, relevantSections);

        // TODO: hand relevantSections + chatContextStatus off to the actual
        // response-generation route once it exists. Placeholder for now:
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              chatContextStatus === "grounded"
                ? `Found ${relevantSections.length} relevant section(s) to answer from.`
                : "I couldn't find anything relevant to that in the article yet.",
          },
        ]);
      } catch (err) {
        console.error("Relevance detection failed:", err);
        setError(err.message);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong while figuring out what's relevant. Please try again." },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="sticky top-10 self-start h-[calc(100vh-5rem)] w-full rounded-lg border border-gray-700 bg-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200">Ask about this article</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask a question, or ask me to expand on something in this article.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-1 text-xs text-red-400">{error}</p>
      )}

      <form onSubmit={handleSend} className="p-3 border-t border-gray-700 flex gap-2">
        <input
          className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask a question or request an expansion..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

export default function ArticleView({ article: initialArticle, articleId }) {
  const [article, setArticle] = useState(initialArticle);

  if (!article || !Array.isArray(article.sections)) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="flex w-full">
        {/* Left: TOC + Article — widened from 1/2 to 3/5 */}
        <div className="w-3/5 flex gap-10 px-8 py-10">
          <div className="sticky top-10 self-start w-56 flex-shrink-0">
            <BackButton />
            <TableOfContents sections={article.sections} />
            <UsedTopics topics={article.sourceTopics} />
          </div>
          <ArticleBody article={article} articleId={articleId} />
        </div>

        {/* Right: Chat — narrowed from 1/2 to 2/5 */}
        <div className="w-2/5 px-8 py-10">
          <ArticleChatPanel
            articleId={articleId}
            article={article}
            onArticleUpdate={setArticle}
          />
        </div>
      </div>
    </div>
  );
}