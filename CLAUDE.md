# Project: Wikipedia AI Article Generator

## Tech Stack

- Next.js (App Router)
- Upstash Redis for caching
- Gemini API for content generation (Flash-Lite for cheap/high-volume calls, stronger model for synthesis)
- Wikipedia API as primary RAG source, web scraping as fallback

## Architecture

Five-stage flow: search → topic detection → cache check/article generation → user intent interpretation → final synthesis.

- `lib/wikipedia.js` — Wikipedia opensearch + extract fetching
- `lib/generateArticle.js` — LLM synthesis prompt, has no-source fallback
- `lib/cache.js` — getCachedArticle/setCachedArticle via Upstash Redis
- `app/api/process-topics/route.js` — uses Promise.allSettled for per-topic failure handling
- `app/api/detect-topics/route.js` — topic detection prompt (canonical entity names, not descriptive reformulations)

## Conventions

- Cache keys: composite, based on sorted topic pairs — not raw queries
- Frontend calls to /api/process-topics are fire-and-forget so topic buttons render immediately
- sourceStatus field tracks provenance (Wikipedia vs scraped vs LLM-generated)
- Separate cheap/high-volume model calls (topic detection) from stronger model calls (article generation)

## Code Style

- Use backticks for template literals, not quotes — this trips me up constantly
- Double-check imports are included, especially for new lib files

## Memory

When I tell you something during a session — a correction, a preference, a decision I made — treat it as something to remember going forward, not just something to apply once. If it's a lasting fact about the project or my workflow, note it for future sessions.

## My Working Style

- Discuss and pressure-test architecture before implementing
- Prefer code typed inline in chat over writing straight to files
- Pause to evaluate design decisions at key moments rather than rushing to code
