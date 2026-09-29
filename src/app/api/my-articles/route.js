import { NextResponse } from "next/server";
import { getRecentArticleIds, getUserArticleIds, getUserArticlesWithTtl } from "../../../lib/cache";
import { getSessionUser } from "../../../lib/session";
import { normalizeLevel } from "../../../lib/explanationLevels";

const RECENT_SHOWN = 5;

function summarize({ articleId, article, ttl }) {
  return {
    articleId,
    title: article.title ?? article.query ?? "Untitled",
    level: normalizeLevel(article.level),
    // null = saved (no expiry)
    expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
  };
}

// Recently opened (anyone with a session, including anonymous visitors) and
// saved (signed-in users only) articles. Entries whose article has expired or
// isn't theirs are dropped.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ recent: [], saved: [] });
  }

  try {
    const [recentIds, savedIds] = await Promise.all([
      getRecentArticleIds(user.id),
      user.isAnonymous ? [] : getUserArticleIds(user.id),
    ]);

    const [recentRows, savedRows] = await Promise.all([
      getUserArticlesWithTtl(recentIds.map((r) => r.articleId)),
      getUserArticlesWithTtl(savedIds),
    ]);

    const owned = (row) => row.article && row.article.userId === user.id;
    const savedSet = new Set(savedIds);

    const recent = recentRows
      .map((row, i) => ({ row, openedAt: recentIds[i].openedAt }))
      .filter(({ row }) => owned(row))
      .slice(0, RECENT_SHOWN)
      .map(({ row, openedAt }) => ({ ...summarize(row), openedAt, saved: savedSet.has(row.articleId) }));

    // Saved list order is most recently saved first
    const saved = savedRows.filter(owned).map((row) => ({ ...summarize(row), saved: true }));

    return NextResponse.json({ recent, saved });
  } catch (err) {
    console.error("Failed to fetch my articles:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
