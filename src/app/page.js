"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "../lib/getUserId";
import RecentArticles from "../app/components/RecentArticles";
import PipelineSteps from "../app/components/PipelineSteps";

export default function Home() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [foundTopics, setFoundTopics] = useState([]);
  const [pipelineStep, setPipelineStep] = useState(null); // null = idle
  const [failedStep, setFailedStep] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [devStatus, setDevStatus] = useState(null);

  const handleSearch = async (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const cleaned = query.toLowerCase().trim();

    if (!cleaned) {
      setErrorMessage("Please enter a valid topic.");
      return;
    }

    setErrorMessage(null);
    setFailedStep(null);
    setDevStatus(null);
    setFoundTopics([]);

    // --- Stage 1: detect-topics ---
    let topics;
    setPipelineStep("detect-topics");
    try {
      const res = await fetch("/api/detect-topics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: cleaned }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const json = await res.json();
      topics = json.topics;
    } catch (err) {
      console.error("Error detecting topics:", err);
      topics = [cleaned];
    }

    if (!topics || topics.length === 0) {
      setFailedStep("detect-topics");
      setErrorMessage("Couldn't find a clear topic in that search. Try being more specific.");
      return;
    }

    setFoundTopics(topics);

    // --- Stage 2: process-topics ---
    setPipelineStep("process-topics");
    try {
      const processRes = await fetch("/api/process-topics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topics }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.error || "process-topics failed");
      }

      await processRes.json();
    } catch (err) {
      console.error("Error in topic processing pipeline:", err);
      setFailedStep("process-topics");
      setErrorMessage(err.message);
      return;
    }

    // --- Stage 3: detect-relevance ---
    let relevantSections, currentDevStatus;
    setPipelineStep("detect-relevance");
    try {
      const relevanceRes = await fetch("/api/detect-relevance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topics,
          query: cleaned,
        }),
      });

      if (!relevanceRes.ok) {
        const err = await relevanceRes.json();
        throw new Error(err.error || "detect-relevance failed");
      }

      const relevanceData = await relevanceRes.json();
      relevantSections = relevanceData.relevantSections;
      currentDevStatus = relevanceData.developmentSourceStatus;
      setDevStatus(currentDevStatus);
    } catch (err) {
      console.error("Error detecting relevance:", err);
      setFailedStep("detect-relevance");
      setErrorMessage(err.message);
      return;
    }

    console.log(relevantSections);

    // --- Stage 4: create-user-article ---
    setPipelineStep("create-user-article");
    try {
      const createRes = await fetch("/api/create-user-article", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topics: relevantSections,
          query: cleaned,
          userId: getUserId(),
          devStatus: currentDevStatus,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "create-user-article failed");
      }

      const createData = await createRes.json();
      setPipelineStep("done");
      router.push(`/article/${createData.articleId}`);
    } catch (err) {
      console.error("Error creating user article:", err);
      setFailedStep("create-user-article");
      setErrorMessage(err.message);
    }
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
          onKeyDown={handleSearch}
        />
      </div>

      {errorMessage && (
        <p className="mt-4 text-red-400 text-sm max-w-xl text-center">{errorMessage}</p>
      )}

      {/* Pipeline progress */}
      {pipelineStep && pipelineStep !== "done" && (
        <div className="mt-6 w-full max-w-xl">
          <PipelineSteps
            currentStep={pipelineStep}
            failedStep={failedStep}
            devStatus={devStatus}
          />
        </div>
      )}

      <RecentArticles />

      {/* Found Topics List */}
      {foundTopics.length > 0 && (
        <div className="mt-8 w-full max-w-xl">
          <p className="text-gray-400 text-sm mb-2">Found topics:</p>
          <div className="flex flex-wrap gap-2">
            {foundTopics.map((topic, i) => (
              <button
                key={i}
                onClick={() => console.log(`Go to ${topic}`)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded-full text-sm cursor-pointer"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}