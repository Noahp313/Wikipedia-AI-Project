"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession } from "../../lib/auth-client";
import { setPendingArticle } from "../../lib/pendingArticle";
import { useLocalStorage } from "../../lib/useLocalStorage";
import { DEFAULT_LEVEL, LEVEL_STORAGE_KEY, normalizeLevel } from "../../lib/explanationLevels";
import PipelineSteps from "../components/PipelineSteps";
import LevelPicker from "../components/LevelPicker";
import FeaturesPicker from "../components/FeaturesPicker";
import { FEATURES_STORAGE_KEY, parseStoredFeatures } from "../../lib/features";
import { useSearchDraft } from "../components/SearchDraft";
import { SearchIcon, SpinnerIcon } from "../components/icons";

export default function Home() {
  // Survives switching tabs (lives in the layout)
  const [query, setQuery] = useSearchDraft();
  const router = useRouter();
  const [foundTopics, setFoundTopics] = useState([]);
  const [pipelineStep, setPipelineStep] = useState(null); // null = idle
  const [failedStep, setFailedStep] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [devStatus, setDevStatus] = useState(null);
  // Remembered across visits; Settings edits the same value
  const [storedLevel, setLevel] = useLocalStorage(LEVEL_STORAGE_KEY, DEFAULT_LEVEL);
  const level = normalizeLevel(storedLevel);
  // Tables / images / charts to allow; remembered like the level ("" = none)
  const [storedFeatures, setStoredFeatures] = useLocalStorage(FEATURES_STORAGE_KEY, null);
  const features = parseStoredFeatures(storedFeatures);

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
    // Written on /article/new, which streams it in as it's generated
    setPipelineStep("create-user-article");
    try {
      // The article is owned by the session user — anonymous if not signed in
      await ensureSession();
    } catch (err) {
      console.error("Error starting a session:", err);
      setFailedStep("create-user-article");
      setErrorMessage(err.message);
      return;
    }

    const pendingId = setPendingArticle({
      topics: relevantSections,
      query: cleaned,
      devStatus: currentDevStatus,
      level,
      features,
    });
    router.push(`/article/new?d=${pendingId}`);
  };

  const isRunning = pipelineStep !== null && pipelineStep !== "done" && failedStep === null;

  return (
    <div className="flex-1 flex flex-col items-center px-4 pt-[6vh] pb-16 sm:px-6 sm:pt-[11vh] sm:pb-20">
      <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-ink text-center">
        What do you want to learn?
      </h1>

      <p className="mt-4 text-ink-muted text-center max-w-md text-[15px] leading-relaxed">
        Ask anything. Get structured, Wikipedia-style explanations instantly.
      </p>

      <div className="mt-8 w-full max-w-xl sm:mt-10">
        <div className="group rounded-2xl border border-line bg-surface shadow-[0_2px_12px_-4px_rgb(var(--shadow-color)/0.12)] transition-shadow focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
          <div className="relative">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint group-focus-within:text-accent transition-colors"
            />
            <input
              className="h-14 w-full rounded-t-2xl bg-transparent pl-11 pr-4 text-base text-ink placeholder:text-ink-faint focus:outline-none"
              placeholder="Search a topic, or ask a question…"
              aria-label="Search a topic, or ask a question"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearch}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="label hidden sm:inline">Level</span>
              <LevelPicker value={level} onChange={setLevel} disabled={isRunning} />
              <FeaturesPicker
                value={features}
                onChange={(next) => setStoredFeatures(next.join(","))}
                disabled={isRunning}
              />
            </div>
            {isRunning ? (
              <SpinnerIcon size={18} className="text-accent" />
            ) : (
              <kbd className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-xs text-ink-faint">
                ↵
              </kbd>
            )}
          </div>
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
      </div>
    </div>
  );
}
