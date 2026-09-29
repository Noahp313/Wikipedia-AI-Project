import { NextResponse } from "next/server";
import { getArticleHistory } from "../../../lib/cache";
import { getOwnedArticle } from "../../../lib/session";

// An article's edit history across visits, without the article snapshots:
// when it was created, and each visit's time span and edit labels.
export async function GET(request) {
  const articleId = new URL(request.url).searchParams.get("articleId");

  const { article } = await getOwnedArticle(articleId);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const { original, sessions } = await getArticleHistory(articleId);

  return NextResponse.json({
    createdAt: original?.createdAt ?? null,
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      // Visits recorded before step labels existed have none
      steps: Array.isArray(s.steps) ? s.steps : [],
    })),
  });
}
