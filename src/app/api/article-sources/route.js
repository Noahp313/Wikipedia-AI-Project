import { NextResponse } from "next/server";
import { getCachedArticle } from "../../../lib/cache";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { topics } = body;

  if (!Array.isArray(topics)) {
    return NextResponse.json({ error: "topics must be an array" }, { status: 400 });
  }

  const uniqueTopics = [...new Set(topics)];

  const results = await Promise.all(
    uniqueTopics.map(async (topic) => {
      const cached = await getCachedArticle(topic);
      if (!cached || !cached.sourceUrl) return null;
      return { topic, title: cached.title || topic, sourceUrl: cached.sourceUrl };
    })
  );

  return NextResponse.json({ sources: results.filter(Boolean) });
}
