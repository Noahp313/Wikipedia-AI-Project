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
    <div className="flex flex-col gap-2 p-4 rounded-lg bg-neutral-900 border border-neutral-800">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex || (i === currentIndex && failedStep === null && currentStep === "done");
        const isActive = step.key === currentStep && currentStep !== "done";
        const isFailed = step.key === failedStep;

        return (
          <div key={step.key} className="flex items-center gap-3 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                isFailed
                  ? "bg-red-500"
                  : isDone
                  ? "bg-green-500"
                  : isActive
                  ? "bg-blue-500 animate-pulse"
                  : "bg-neutral-700"
              }`}
            />
            <span
              className={
                isFailed
                  ? "text-red-400"
                  : isDone
                  ? "text-neutral-400"
                  : isActive
                  ? "text-neutral-100"
                  : "text-neutral-600"
              }
            >
              {step.label}
            </span>
            {step.key === "detect-relevance" && isDone && devStatus === "no-relevant-sections" && (
              <span className="text-xs text-yellow-500 ml-1">(no source found — using general knowledge)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}