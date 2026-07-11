import { NextResponse } from "next/server";
import { getUserArticleIds, getCachedUserArticle } from "../../../lib/cache";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const articleIds = await getUserArticleIds(userId);
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
