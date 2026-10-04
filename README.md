# WikAi — Wikipedia AI Article Generator

Ask a question in plain language and get back a Wikipedia-style article written for *your* question, grounded in real Wikipedia sources — then keep talking to it. The in-article chat answers follow-ups, pulls in new sources on the fly, and edits the article itself, with every change tracked and undoable.

> **Status:** work in progress. The core loop works end-to-end; see [Known limitations](#known-limitations) for the rough edges.

## Features

- **Grounded articles** — each article is synthesized from the real Wikipedia articles behind your query, and every section is labelled with where it came from (see [Provenance](#provenance)).
- **Chat that edits the article** — ask a follow-up and get an answer; when it's warranted, the relevant section is amended or a new one is added. Highlight any passage and choose **Ask about this** to ask about that excerpt specifically.
- **Explanation levels** — Simple, Standard or Expert, set per search or as a default in Settings.
- **Rich content, only when it fits** — Markdown with tables and LaTeX math (KaTeX), real images from Wikipedia and Wikimedia Commons with license credits, and Mermaid diagrams/charts (clearly labelled as AI-generated). A **Features** picker on the search bar turns tables, images and charts on or off; asking for one directly ("with a table") always wins.
- **Verified examples** — when you ask for worked examples, they're written first and checked with Gemini code execution before the article is written, then tagged "Verified example".
- **Manual editing** — an edit mode for changing the article text yourself (exclusive with chat, so the two never conflict).
- **Edit history** — undo/redo within a visit, plus a history of past visits you can restore from.
- **Streaming** — the article appears as it's written.
- **Accounts** — use it anonymously, or sign in with Google to save articles to **My articles**. Saved articles don't expire; unsaved ones expire after 7 days. Settings include theme, default explanation level, and account deletion.

## How it works

**Search flow** (`/` → new article):

1. **Detect topics** — a cheap LLM call extracts the canonical Wikipedia entities behind your query (e.g. "fall of Rome" → `Rome`).
2. **Process topics** — for each topic, check a shared Redis cache; on a miss, fetch the real Wikipedia article, summarize it, and cache it (7-day TTL). The cache is shared across users, so the second person to search "Napoleon" hits the cache instead of regenerating.
3. **Detect relevance** — pick out just the cached sections that actually answer your query.
4. **Synthesize** — the stronger model writes the final article from those sections and streams it to the page. It's saved as your own article, separate from the shared topic cache.

**In-article chat:**

1. Check whether the question names an entity or concept (person, place, event, named theory, technical term…) that isn't covered yet and has its own Wikipedia article. If so, pull it into the shared topic cache, same as step 2 above.
2. Re-run relevance detection against the (possibly larger) set of sources.
3. Write a conversational reply and, independently, decide whether the article needs to change. Most questions get answered with no edit; when the model does amend or add a section, the edit is applied deterministically — it can only touch sections it explicitly returns.

### Provenance

Every section carries a `sourceStatus`: **Source** (from Wikipedia), **Hybrid** (Wikipedia plus model-filled gaps), or **Generated** (no Wikipedia coverage found, written from the model's general knowledge). Sections you change yourself are tagged **Edited**. The sidebar's Sources panel links to the Wikipedia articles and images used.

## Tech stack

- **Next.js 16** (App Router) + React 19, Tailwind CSS
- **Gemini API** — `gemini-3.1-flash-lite` for cheap, high-volume calls (topic detection, relevance, per-topic summaries); `gemini-3.5-flash` for final synthesis, chat answers and example checking
- **Wikipedia / Wikimedia Commons APIs** — source text and images
- **Upstash Redis** — topic and article caches, edit history, sessions, rate limiting
- **Better Auth** + **Neon Postgres** — Google sign-in and anonymous sessions; users and accounts live in Postgres
- **KaTeX** and **Mermaid** — math and diagrams

## Project structure

```
src/
  app/
    (home)/              # Search, My articles (library) and Settings tabs
    article/             # article page (new/ streams a fresh article)
    api/                 # one route per pipeline stage, plus chat, saving, history, auth
    components/          # ArticleView (article, chat, edit mode, history), pickers, Markdown renderer…
    dev/                 # optional developer dashboard (token-gated)
    privacy/             # privacy policy
  lib/
    wikipedia.js         # Wikipedia search + extract fetching
    wikiImages.js        # Wikipedia/Commons images with license info
    generateArticle.js   # per-topic summaries, with a no-source fallback
    detectRelevance.js   # picks the sections relevant to a query
    verifiedExamples.js  # writes and code-checks worked examples
    markdown.js          # Markdown/media rules for prompts and output clean-up
    cache.js             # Redis reads/writes (topic cache, user articles, history)
    geminiClient.js      # Gemini wrapper: retries, backoff, model fallback
    auth.js, session.js  # Better Auth config and server-side ownership checks
    rateLimit.js         # Upstash rate limiters
```

## Running it locally

### Prerequisites

- Node.js 20+
- A [Google AI Studio](https://aistudio.google.com/apikey) API key (Gemini)
- An [Upstash](https://console.upstash.com) Redis database (free tier is fine)
- A [Neon](https://console.neon.tech) Postgres database (free tier is fine)
- A Google Cloud OAuth client, for sign-in

### Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/Noahp313/Wikipedia-AI-Project.git
   cd Wikipedia-AI-Project
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` is gitignored, so real keys never get committed.

   | Variable | Where to get it |
   |---|---|
   | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
   | `UPSTASH_REDIS_REST_URL` | Upstash console → your database → REST API |
   | `UPSTASH_REDIS_REST_TOKEN` | same page as above |
   | `DATABASE_URL` | Neon → your project → pooled connection string |
   | `BETTER_AUTH_SECRET` | Generate with `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | `http://localhost:3000` locally; your deploy URL in production |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application). Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google` |
   | `WIKI_CONTACT` | Your email or a project URL, sent in the User-Agent on Wikipedia/Wikimedia requests as their [User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) asks. Unset → a bare `WikAi/1.0` User-Agent, which works but is more likely to be rate-limited. |
   | `DEV_DASHBOARD_TOKEN` | *Optional.* Enables the developer dashboard at `/dev` (sign in at `/dev/login`). Generate with `openssl rand -hex 32`; must be ≥ 32 chars. Unset → every `/dev` route returns 404. |

3. **Create the auth tables** (once, and again after upgrading Better Auth)

   ```bash
   npx auth@latest migrate
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

> **Troubleshooting:** Upstash's free tier deletes databases after a period of inactivity. If every search suddenly fails with `{"error":"fetch failed"}`, check whether your Redis hostname still resolves (`nslookup <your-upstash-host>`) before debugging anything else — if it returns `NXDOMAIN`, create a new database and update `.env.local`.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |

## Known limitations

- **No automated tests yet.** Several code paths parse LLM output and apply model-proposed edits — the kind of logic most likely to break on a model or prompt change.
- **Wikipedia is the only source.** When it has nothing, sections fall back to the model's general knowledge (labelled **Generated**). Per-topic summaries are also fairly compressed, so some detail from the source articles is lost.
- **Verified examples only cover things that can be computed.** Non-numeric examples (history, literature…) aren't checked.
- **Not deployed yet.** Still to do before a public launch: capping stored edit history, publishing the Google OAuth app out of testing mode, and error/404 pages.
- **Cache expiry.** Unsaved articles and cached topics expire after 7 days, and an inactive free-tier Upstash database can be deleted (see Troubleshooting above).
