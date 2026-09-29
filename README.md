# Wikipedia AI Article Generator

Ask a question in plain language and get back a synthesized, Wikipedia-style article grounded in real Wikipedia sources — then keep talking to it. The in-article chat can pull in new source topics on the fly, correct or expand sections, and every edit is tracked with full undo/redo history.

## How it works

**Search flow** (`/` → new article):

1. **Detect topics** — an LLM call extracts the canonical entity/entities behind your query (e.g. "fall of Rome" → `Rome`).
2. **Process topics** — for each topic, check a shared Redis cache; on a miss, fetch the real Wikipedia article and synthesize a structured summary from it, then cache it (7-day TTL). This cache is shared across all users — the second person who searches "Napoleon" hits cache instead of re-generating.
3. **Detect relevance** — pick out just the cached sections that actually answer *your* query (a broad topic article may have sections irrelevant to what you asked).
4. **Synthesize** — write the final answer from those relevant sections, saved as your own article (a separate, per-user cache entry, independent of the shared topic cache above).

**In-article chat** (ask a follow-up on any generated article):

1. Check whether the question names an entity or concept — person, place, org, work, event, *or a named theory/technical term* — that isn't already covered and has its own Wikipedia article. If so, pull it into the shared topic cache (same mechanism as step 2 above).
2. Re-run relevance detection against the (possibly now-larger) set of source topics.
3. Generate a conversational reply, and — independently — decide whether anything in the article itself needs to change. Most questions get answered with no edit; when the model does decide to amend or add a section, that edit is applied deterministically (the model only ever touches sections it explicitly returns).

Every edit (and every new topic pulled into an article) is pushed onto that article's undo/redo history stack, so you can step backward/forward or jump straight to any prior version from the "Edit History" panel. Undoing actually reverts the persisted article, not just the on-screen view.

### Provenance

Every section carries a `sourceStatus`: **Source** (verbatim from Wikipedia), **Hybrid** (Wikipedia + model-filled gaps), or **Generated** (no Wikipedia coverage found, answered from general knowledge). The sidebar's "Sources" panel links back to the actual Wikipedia article(s) used.

## Tech stack

- **Next.js** (App Router)
- **Upstash Redis** — article caching (both the shared per-topic cache and per-user generated articles) and API rate limiting
- **Gemini API** — Flash-Lite for cheap/high-volume calls (topic detection, relevance checks, chat), a stronger model for final synthesis
- **Wikipedia API** — primary source material (opensearch + extract fetch); falls back to ungrounded generation when no article is found

## Project structure

```
src/
  app/
    page.js                        # home page — search entry point
    article/[articleId]/page.js    # generated article page
    components/
      ArticleView.jsx              # article display, chat panel, undo/redo history
      RecentArticles.js            # saved-articles list (home page)
      SaveArticleButton.js
      PipelineSteps.jsx            # search progress UI
    api/
      detect-topics/               # stage 1: extract topic(s) from a query
      process-topics/              # stage 2: cache check + per-topic generation
      detect-relevance/            # stage 3: pick relevant cached sections
      create-user-article/         # stage 4: synthesize the final article
      identify-new-topics/         # chat: is a new source topic needed?
      chatbot-detect-relevance/    # chat: relevance check against current sources
      chatbot-answer/              # chat: conversational reply + article edits
      article-sources/             # resolves topic names -> real Wikipedia URLs
      save-article/  recent-articles/  # per-user saved-article list
  lib/
    wikipedia.js       # Wikipedia opensearch + extract fetching
    generateArticle.js # per-topic LLM synthesis, has a no-source fallback
    wikiSections.js    # parses/truncates raw Wikipedia extracts into sections
    cache.js            # Redis reads/writes (topic cache + user article cache)
    geminiClient.js     # Gemini fetch wrapper: retry, backoff, model fallback
    rateLimit.js        # Upstash rate limiters (separate tiers per model)
    getUserId.js         # anonymous per-browser user id (localStorage)
```

## Prerequisites

- Node.js 20+ (developed against v24)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key (Gemini)
- An [Upstash](https://console.upstash.com) Redis database (free tier is fine)

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/Noahp313/Wikipedia-AI-Project.git
   cd Wikipedia-AI-Project
   npm install
   ```

2. **Configure environment variables**

   Copy the example file and fill in real values:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Where to get it |
   |---|---|
   | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
   | `UPSTASH_REDIS_REST_URL` | Upstash console → your database → REST API |
   | `UPSTASH_REDIS_REST_TOKEN` | same page as above |
   | `DEV_DASHBOARD_TOKEN` | *Optional.* Enables the developer dashboard at `/dev` (sign in at `/dev/login`). Generate with `openssl rand -hex 32`; must be ≥ 32 chars. Unset → every `/dev` route returns 404. |

   > **Heads up:** Upstash's free tier auto-deletes a database after a period of inactivity. If you come back to this project after a while and every search fails with `{"error":"fetch failed"}`, that's almost always a dead Redis hostname, not a code bug — run `nslookup <your-upstash-host>` to check for `NXDOMAIN` before debugging anything else. Spin up a fresh database and update `.env.local` if so.

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). If port 3000 is already in use by a stale dev server from a previous session, either kill that process or just use the port Next.js falls back to.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |

## Git workflow notes

- `.env.local` is gitignored (`.env*.local` in `.gitignore`) — real API keys and Redis tokens never get committed. `.env.example` documents the required variable names for anyone setting the project up fresh.
- No branch protection or CI is configured yet — commits to `main` go live immediately on the next deploy. For any change riskier than a small fix, prefer a feature branch + PR over committing straight to `main`.
- Commit messages in this repo describe the user-visible feature/fix delivered (e.g. "Save button, neat loading, and empty relevance articles") rather than following a strict convention (Conventional Commits, etc.) — match that style unless the team adopts something stricter.
- There's no test suite yet (see Known limitations below) — there's nothing for CI to run even if you add a workflow, so treat manual verification (`npm run dev` + exercising the flow) as required before pushing.

## Known limitations / roadmap

This is a working MVP — the core loop (search → grounded synthesis → interactive chat that edits the article → save/revisit) works end-to-end. Rough edges, roughly in priority order:

- **No accounts.** Identity is an anonymous UUID in `localStorage` (`getUserId.js`) — saved articles don't survive clearing browser data or switching devices/browsers.
- **No automated tests.** Several code paths parse LLM JSON output and validate/apply model-proposed edits — exactly the kind of logic that silently breaks on a model or prompt change without test coverage.
- **Edit history is per-session only.** Undo/redo/edit-history state lives in React state, not Redis — it resets on page reload (though the *article content* itself is always persisted; only the ability to step back through its history is lost on refresh).
- **Desktop-oriented layout.** The article view's two-column split has no responsive breakpoints for mobile yet.
- **Cache eviction surprises.** Both the per-topic and per-user article caches expire after 7 days; combined with Upstash's free-tier inactivity deletion (see setup note above), a long-dormant deployment can look "broken" when it's actually just an expired/deleted cache.
