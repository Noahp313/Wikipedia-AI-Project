import Link from "next/link";
import { notFound } from "next/navigation";
import { isDevAuthorized } from "../../lib/devAuth";
import {
    getCachedBaseArticles,
    getDailyStats,
    getGeminiEvents,
    summarizeBySource,
    summarizeDurations,
    sumCounters,
    tokenRows,
} from "../../lib/devDashboardData";
import { MAX_GEMINI_EVENTS } from "../../lib/devTelemetry";
import { devLogout } from "./actions";
import { ExternalLinkIcon, LogoMark } from "../components/icons";

export const dynamic = "force-dynamic";

const STATS_DAYS = 14;
const RECENT_CALLS = 50;
const TIMEOUT_MS = 30_000; // mirrors FETCH_TIMEOUT_MS in geminiClient.js
const NEAR_TIMEOUT_MS = 20_000;

const MODEL_LABELS = {
    "gemini-3.1-flash-lite": "Flash-Lite",
    "gemini-3.5-flash": "3.5 Flash",
};

// ---------- formatting ----------

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

function formatMs(ms) {
    if (ms === null || ms === undefined) return "—";
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatPercent(part, total) {
    if (!total) return "—";
    return `${Math.round((part / total) * 100)}%`;
}

function formatTime(ms) {
    return new Date(ms).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    });
}

function modelLabel(model) {
    return MODEL_LABELS[model] ?? model;
}

// ---------- small pieces ----------

const TONES = {
    good: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    critical: "bg-danger-soft text-danger",
    neutral: "bg-subtle text-ink-muted",
};

// Status is never color alone: every badge carries a text label.
function Badge({ tone = "neutral", children }) {
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {children}
        </span>
    );
}

function StatTile({ label, value, detail }) {
    return (
        <div className="card p-4">
            <p className="text-[13px] text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
            {detail && <p className="mt-0.5 text-xs text-ink-faint">{detail}</p>}
        </div>
    );
}

function Section({ id, title, description, children }) {
    return (
        <section id={id} className="scroll-mt-6">
            <div className="mb-3">
                <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
            </div>
            {children}
        </section>
    );
}

function EmptyState({ children }) {
    return <p className="card px-4 py-8 text-center text-sm text-ink-faint">{children}</p>;
}

function Table({ columns, children }) {
    return (
        <div className="card overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-line text-left">
                        {columns.map((c) => (
                            <th
                                key={c.label}
                                scope="col"
                                className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium text-ink-muted first:pl-4 last:pr-4 ${c.numeric ? "text-right" : ""}`}
                            >
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line">{children}</tbody>
            </table>
        </div>
    );
}

function Td({ children, numeric = false, className = "" }) {
    return (
        <td className={`whitespace-nowrap px-3 py-2.5 first:pl-4 last:pr-4 ${numeric ? "text-right tabular-nums" : ""} ${className}`}>
            {children}
        </td>
    );
}

// A labelled count with a single-hue proportion bar (magnitude only, no legend needed).
function BreakdownList({ rows, total }) {
    if (!total) return <p className="text-sm text-ink-faint">No data yet.</p>;
    return (
        <ul className="space-y-2.5">
            {rows.map((r) => (
                <li key={r.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink-muted">{r.label}</span>
                        <span className="tabular-nums text-ink">
                            {whole.format(r.value)}
                            <span className="ml-1.5 text-xs text-ink-faint">{formatPercent(r.value, total)}</span>
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-subtle">
                        <div
                            className="h-1.5 rounded-full bg-accent/70"
                            style={{ width: `${(r.value / total) * 100}%` }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

function BreakdownCard({ title, rows }) {
    const total = rows.reduce((n, r) => n + r.value, 0);
    return (
        <div className="card p-4">
            <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-ink">{title}</h3>
                <span className="text-xs text-ink-faint tabular-nums">{whole.format(total)} total</span>
            </div>
            <BreakdownList rows={rows} total={total} />
        </div>
    );
}

const OUTCOME_BADGES = {
    ok: { tone: "good", label: "OK" },
    timeout: { tone: "critical", label: "Timeout" },
    "rate-limited": { tone: "warning", label: "Rate-limited" },
    error: { tone: "critical", label: "Error" },
};

const SECTION_STATUS = {
    wikipedia: { tone: "good", label: "Wikipedia" },
    hybrid: { tone: "warning", label: "Hybrid" },
    generated: { tone: "critical", label: "AI only" },
};

const ARTICLE_STATUS = {
    wikipedia: { tone: "good", label: "Wikipedia source" },
    "no-wikipedia-source": { tone: "critical", label: "No source" },
};

function StatusBadge({ map, value }) {
    const entry = map[value] ?? { tone: "neutral", label: value ?? "Unknown" };
    return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

// ---------- sections ----------

function LatencyTable({ rows }) {
    if (rows.length === 0) return <EmptyState>No Gemini calls recorded yet.</EmptyState>;
    return (
        <Table
            columns={[
                { label: "Call" },
                { label: "Model" },
                { label: "Calls", numeric: true },
                { label: "p50", numeric: true },
                { label: "p95", numeric: true },
                { label: "Max", numeric: true },
                { label: "Errors", numeric: true },
                { label: "Timeouts", numeric: true },
                { label: "Retries", numeric: true },
                { label: "Fallbacks", numeric: true },
                { label: "Limiter wait", numeric: true },
            ]}
        >
            {rows.map((r) => (
                <tr key={`${r.source}|${r.model}`} className="hover:bg-subtle/50">
                    <Td className="font-medium text-ink">
                        <span className="flex items-center gap-2">
                            {r.source}
                            {r.p95 >= NEAR_TIMEOUT_MS && <Badge tone="warning">Near timeout</Badge>}
                        </span>
                    </Td>
                    <Td className="text-ink-muted">{modelLabel(r.model)}</Td>
                    <Td numeric>{whole.format(r.calls)}</Td>
                    <Td numeric>{formatMs(r.p50)}</Td>
                    <Td numeric className={r.p95 >= NEAR_TIMEOUT_MS ? "font-semibold text-ink" : ""}>{formatMs(r.p95)}</Td>
                    <Td numeric>{formatMs(r.max)}</Td>
                    <Td numeric>
                        {r.errors > 0 ? `${r.errors} (${formatPercent(r.errors, r.calls)})` : <span className="text-ink-faint">0</span>}
                    </Td>
                    <Td numeric>{r.timeouts || <span className="text-ink-faint">0</span>}</Td>
                    <Td numeric>{r.retries || <span className="text-ink-faint">0</span>}</Td>
                    <Td numeric>{r.fallbacks || <span className="text-ink-faint">0</span>}</Td>
                    <Td numeric>{r.rateLimitWaitMs ? formatMs(r.rateLimitWaitMs) : <span className="text-ink-faint">—</span>}</Td>
                </tr>
            ))}
        </Table>
    );
}

function TokenTable({ rows }) {
    if (rows.length === 0) return <EmptyState>No token usage recorded in the last {STATS_DAYS} days.</EmptyState>;
    return (
        <Table
            columns={[
                { label: "Date" },
                { label: "Model" },
                { label: "Calls", numeric: true },
                { label: "Input tokens", numeric: true },
                { label: "Output tokens", numeric: true },
            ]}
        >
            {rows.map((r) => (
                <tr key={`${r.date}|${r.model}`} className="hover:bg-subtle/50">
                    <Td className="text-ink">{r.date}</Td>
                    <Td className="text-ink-muted">{modelLabel(r.model)}</Td>
                    <Td numeric>{whole.format(r.calls)}</Td>
                    <Td numeric>{whole.format(r.tokensIn)}</Td>
                    <Td numeric>{whole.format(r.tokensOut)}</Td>
                </tr>
            ))}
        </Table>
    );
}

function relevanceRows(counts) {
    return [
        { label: "Grounded in sources", value: counts.grounded ?? 0 },
        { label: "No relevant sections", value: counts["no-relevant-sections"] ?? 0 },
        { label: "No cached articles", value: counts["no-cached-articles"] ?? 0 },
    ];
}

function RecentCallsTable({ events }) {
    if (events.length === 0) return <EmptyState>No Gemini calls recorded yet.</EmptyState>;
    return (
        <Table
            columns={[
                { label: "Time" },
                { label: "Call" },
                { label: "Model" },
                { label: "Duration", numeric: true },
                { label: "Tokens in / out", numeric: true },
                { label: "Outcome" },
            ]}
        >
            {events.map((e, i) => {
                const outcome = OUTCOME_BADGES[e.outcome] ?? { tone: "neutral", label: e.outcome };
                return (
                    <tr key={`${e.timestamp}-${i}`} className="hover:bg-subtle/50">
                        <Td className="text-ink-muted">{formatTime(e.timestamp)}</Td>
                        <Td className="text-ink">{e.source}</Td>
                        <Td className="text-ink-muted">
                            {modelLabel(e.model)}
                            {e.fellBack && <span className="ml-1.5 text-xs text-warning">(fallback)</span>}
                        </Td>
                        <Td numeric className={e.durationMs >= NEAR_TIMEOUT_MS ? "font-semibold text-ink" : ""}>
                            {formatMs(e.durationMs)}
                        </Td>
                        <Td numeric className="text-ink-muted">
                            {whole.format(e.inputTokens)} / {whole.format(e.outputTokens)}
                        </Td>
                        <Td>
                            <span className="flex items-center gap-2">
                                <Badge tone={outcome.tone}>{outcome.label}</Badge>
                                {e.retries > 0 && <span className="text-xs text-ink-faint">{e.retries} retries</span>}
                            </span>
                        </Td>
                    </tr>
                );
            })}
        </Table>
    );
}

function sectionMix(sections) {
    const counts = {};
    for (const s of sections) counts[s.sourceStatus ?? "unknown"] = (counts[s.sourceStatus ?? "unknown"] ?? 0) + 1;
    return counts;
}

function CachedArticles({ articles, truncated, filter }) {
    const counts = {};
    for (const a of articles) counts[a.sourceStatus] = (counts[a.sourceStatus] ?? 0) + 1;

    const filters = [
        { value: "all", label: "All", count: articles.length },
        ...Object.entries(ARTICLE_STATUS).map(([value, { label }]) => ({ value, label, count: counts[value] ?? 0 })),
    ];

    const shown = articles
        .filter((a) => filter === "all" || a.sourceStatus === filter)
        .sort((a, b) => (a.title ?? a.key).localeCompare(b.title ?? b.key));

    return (
        <>
            <div className="mb-3 flex flex-wrap gap-2">
                {filters.map((f) => (
                    <Link
                        key={f.value}
                        href={f.value === "all" ? "/dev#articles" : `/dev?status=${f.value}#articles`}
                        scroll={false}
                        className={`btn ${filter === f.value ? "btn-primary" : "btn-secondary"} py-1 text-xs`}
                    >
                        {f.label}
                        <span className="tabular-nums opacity-70">{f.count}</span>
                    </Link>
                ))}
            </div>

            {truncated && (
                <p className="mb-3 text-xs text-ink-faint">Showing the first {articles.length} cached articles found.</p>
            )}

            {shown.length === 0 ? (
                <EmptyState>No cached articles{filter !== "all" ? " with this status" : ""}.</EmptyState>
            ) : (
                <ul className="card divide-y divide-line overflow-hidden">
                    {shown.map((a) => {
                        const mix = sectionMix(a.sections);
                        return (
                            <li key={a.key}>
                                <details className="group">
                                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-subtle/50 [&::-webkit-details-marker]:hidden">
                                        <span className="text-ink-faint transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                                        <span className="font-medium text-ink">{a.title ?? a.key}</span>
                                        <StatusBadge map={ARTICLE_STATUS} value={a.sourceStatus} />
                                        <span className="text-xs text-ink-faint">
                                            {a.sections.length} sections
                                            {Object.entries(mix).map(([status, n]) => ` · ${n} ${SECTION_STATUS[status]?.label ?? status}`)}
                                        </span>
                                        {a.sourceUrl && (
                                            <a
                                                href={a.sourceUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
                                            >
                                                Source <ExternalLinkIcon size={11} />
                                            </a>
                                        )}
                                    </summary>
                                    <div className="space-y-4 border-t border-line bg-canvas px-4 py-4 sm:pl-9">
                                        <p className="font-mono text-xs text-ink-faint">article:{a.key}</p>
                                        {a.sections.map((s, i) => (
                                            <div key={i}>
                                                <div className="mb-1 flex items-center gap-2">
                                                    <h4 className="text-sm font-semibold text-ink">{s.heading}</h4>
                                                    <StatusBadge map={SECTION_STATUS} value={s.sourceStatus} />
                                                </div>
                                                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{s.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}

// ---------- page ----------

const NAV = [
    { id: "latency", label: "Latency" },
    { id: "tokens", label: "Tokens" },
    { id: "pipeline", label: "Pipeline" },
    { id: "articles", label: "Cached articles" },
    { id: "recent", label: "Recent calls" },
];

export default async function DevDashboardPage({ searchParams }) {
    // The gate: anyone without a valid session sees the same 404 as a missing route.
    if (!(await isDevAuthorized())) notFound();

    const { status } = await searchParams;
    const filter = status && Object.hasOwn(ARTICLE_STATUS, status) ? status : "all";

    const [events, dailyStats, { articles, truncated }] = await Promise.all([
        getGeminiEvents(),
        getDailyStats(STATS_DAYS),
        getCachedBaseArticles(),
    ]);

    const overall = summarizeDurations(events);
    const errors = events.filter((e) => e.outcome !== "ok").length;
    const fallbacks = events.filter((e) => e.fellBack).length;
    const oldest = events.at(-1)?.timestamp;

    const today = dailyStats[0]?.fields ?? {};
    const sumToday = (prefix) =>
        Object.entries(today).reduce((n, [f, v]) => (f.startsWith(prefix) ? n + v : n), 0);
    const tokensInToday = sumToday("tokens-in:");
    const tokensOutToday = sumToday("tokens-out:");

    const topics = sumCounters(dailyStats, "topic");
    const topicSources = sumCounters(dailyStats, "topic-source");

    return (
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <LogoMark size={28} />
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight text-ink">Developer dashboard</h1>
                        <p className="text-xs text-ink-faint">
                            Last {whole.format(events.length)} Gemini calls
                            {oldest && <> · since {formatTime(oldest)}</>}
                            {" "}(keeps up to {whole.format(MAX_GEMINI_EVENTS)}) · counters cover {STATS_DAYS} days
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/" className="btn btn-ghost">Back to app</Link>
                    <form action={devLogout}>
                        <button type="submit" className="btn btn-secondary">Sign out</button>
                    </form>
                </div>
            </header>

            <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-line pb-px">
                {NAV.map((n) => (
                    <a
                        key={n.id}
                        href={`#${n.id}`}
                        className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
                    >
                        {n.label}
                    </a>
                ))}
            </nav>

            <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile label="Gemini calls" value={whole.format(events.length)} detail="in the event window" />
                <StatTile label="p95 latency" value={formatMs(overall.p95)} detail={`timeout is ${formatMs(TIMEOUT_MS)}`} />
                <StatTile label="Failed calls" value={whole.format(errors)} detail={`${formatPercent(errors, events.length)} of calls`} />
                <StatTile label="Fallbacks to Flash-Lite" value={whole.format(fallbacks)} detail="after retries ran out" />
                <StatTile
                    label="Tokens today"
                    value={compact.format(tokensInToday + tokensOutToday)}
                    detail={`${compact.format(tokensInToday)} in · ${compact.format(tokensOutToday)} out (UTC day)`}
                />
            </div>

            <div className="space-y-12">
                <Section
                    id="latency"
                    title="Latency by call"
                    description={`Durations include retries, fallback and rate-limiter waits. Rows with p95 ≥ ${formatMs(NEAR_TIMEOUT_MS)} are flagged.`}
                >
                    <LatencyTable rows={summarizeBySource(events)} />
                </Section>

                <Section id="tokens" title="Token usage" description={`Per model per UTC day, last ${STATS_DAYS} days. Output includes thinking tokens.`}>
                    <TokenTable rows={tokenRows(dailyStats)} />
                </Section>

                <Section id="pipeline" title="Pipeline outcomes" description={`Last ${STATS_DAYS} days.`}>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <BreakdownCard title="Search relevance" rows={relevanceRows(sumCounters(dailyStats, "search-relevance"))} />
                        <BreakdownCard title="Chat relevance" rows={relevanceRows(sumCounters(dailyStats, "chat-relevance"))} />
                        <BreakdownCard
                            title="Topic processing"
                            rows={[
                                { label: "Cache hit", value: topics["cache-hit"] ?? 0 },
                                { label: "Generated", value: topics.generated ?? 0 },
                                { label: "Failed", value: topics.error ?? 0 },
                            ]}
                        />
                        <BreakdownCard
                            title="New topic sources"
                            rows={[
                                { label: "Wikipedia source", value: topicSources.wikipedia ?? 0 },
                                { label: "No source (AI only)", value: topicSources["no-wikipedia-source"] ?? 0 },
                            ]}
                        />
                    </div>
                </Section>

                <Section
                    id="articles"
                    title="Cached base articles"
                    description="Per-topic articles from generateArticle (Flash-Lite). Expand one to judge its quality."
                >
                    <CachedArticles articles={articles} truncated={truncated} filter={filter} />
                </Section>

                <Section id="recent" title="Recent calls" description={`The latest ${RECENT_CALLS} Gemini calls.`}>
                    <RecentCallsTable events={events.slice(0, RECENT_CALLS)} />
                </Section>
            </div>
        </main>
    );
}
