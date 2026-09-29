import { NextResponse } from "next/server";
import { getUserArticleIds, getCachedUserArticle } from "../../../lib/cache";
import { getSessionUser } from "../../../lib/session";

export async function GET() {
  const user = await getSessionUser();

  // Only signed-in users can save, so anyone else has an empty list
  if (!user || user.isAnonymous) {
    return NextResponse.json({ articles: [] });
  }

  try {
    const articleIds = await getUserArticleIds(user.id);
    const recentIds = articleIds.slice(0, 10);

    if (!recentIds.length) {
      return NextResponse.json({ articles: [] });
    }

    const articles = await Promise.all(
      recentIds.map((id) => getCachedUserArticle(id))
    );

    const results = articles
      .map((article, i) => {
        if (!article) return null;
        return {
          articleId: recentIds[i],
          title: article.title ?? article.query ?? "Untitled",
        };
      })
      .filter(Boolean);

    return NextResponse.json({ articles: results });
  } catch (err) {
    console.error("Failed to fetch recent articles:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
