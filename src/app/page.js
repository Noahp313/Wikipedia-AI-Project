"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "../lib/getUserId";
import RecentArticles from "../app/components/RecentArticles";
import PipelineSteps from "../app/components/PipelineSteps";
import { LogoMark, SearchIcon, SpinnerIcon } from "../app/components/icons";

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

  const isRunning = pipelineStep !== null && pipelineStep !== "done" && failedStep === null;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center gap-2.5 px-4 py-4 sm:px-6 sm:py-5">
        <LogoMark size={26} />
        <span className="text-sm font-semibold tracking-tight text-ink">Wikipedia AI</span>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pt-[8vh] pb-16 sm:px-6 sm:pt-[14vh] sm:pb-20">
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-ink text-center">
          What do you want to learn?
        </h1>

        <p className="mt-4 text-ink-muted text-center max-w-md text-[15px] leading-relaxed">
          Ask anything. Get structured, Wikipedia-style explanations instantly.
        </p>

        <div className="mt-8 w-full max-w-xl sm:mt-10">
          <div className="group relative">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint group-focus-within:text-accent transition-colors"
            />
            <input
              className="input h-14 rounded-2xl pl-11 pr-14 text-base shadow-[0_2px_12px_-4px_rgb(var(--shadow-color)/0.12)]"
              placeholder="Search a topic, or ask a question…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearch}
              autoFocus
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {isRunning ? (
                <SpinnerIcon size={18} className="text-accent" />
              ) : (
                <kbd className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-xs text-ink-faint">
                  ↵
                </kbd>
              )}
            </span>
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{errorMessage}</p>
          )}

          {pipelineStep && pipelineStep !== "done" && (
            <div className="mt-6">
              <PipelineSteps
                currentStep={pipelineStep}
                failedStep={failedStep}
                devStatus={devStatus}
              />
            </div>
          )}

          {foundTopics.length > 0 && (
            <div className="mt-6">
              <p className="label mb-2.5">Found topics</p>
              <div className="flex flex-wrap gap-2">
                {foundTopics.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => console.log(`Go to ${topic}`)}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-muted hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink transition-colors cursor-pointer"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          <RecentArticles />
        </div>
      </div>
    </main>
  );
}
