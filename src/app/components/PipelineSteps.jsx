import { CheckIcon, SpinnerIcon, XIcon } from "./icons";

// Order here drives both the progress list and the currentIndex lookup below.
const STEPS = [
  { key: "detect-topics", label: "Detecting topics" },
  { key: "process-topics", label: "Processing topics" },
  { key: "detect-relevance", label: "Checking relevance" },
  { key: "create-user-article", label: "Generating article" },
];

export default function PipelineSteps({ currentStep, failedStep, devStatus }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <ol className="card p-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex || (i === currentIndex && failedStep === null && currentStep === "done");
        const isActive = step.key === currentStep && currentStep !== "done";
        const isFailed = step.key === failedStep;

        return (
          <li
            key={step.key}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive && !isFailed ? "bg-subtle" : ""
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                isFailed
                  ? "bg-danger-soft text-danger"
                  : isDone
                  ? "bg-success/15 text-success"
                  : isActive
                  ? "text-accent"
                  : "border border-line-strong"
              }`}
            >
              {isFailed ? (
                <XIcon size={12} strokeWidth={3} />
              ) : isDone ? (
                <CheckIcon size={12} strokeWidth={3} />
              ) : isActive ? (
                <SpinnerIcon size={16} />
              ) : null}
            </span>
            <span
              className={
                isFailed
                  ? "text-danger font-medium"
                  : isDone
                  ? "text-ink-muted"
                  : isActive
                  ? "text-ink font-medium"
                  : "text-ink-faint"
              }
            >
              {step.label}
            </span>
            {step.key === "detect-relevance" && isDone && devStatus === "no-relevant-sections" && (
              <span className="ml-auto rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning">
                No source found — using general knowledge
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
