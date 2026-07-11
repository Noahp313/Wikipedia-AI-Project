import { NextResponse } from "next/server";
import { saveUserArticle, unsaveUserArticle, isArticleSaved } from "../../../lib/cache";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const articleId = searchParams.get("articleId");

  if (!userId || !articleId) {
    return NextResponse.json({ error: "Missing userId or articleId" }, { status: 400 });
  }

  const saved = await isArticleSaved(userId, articleId);
  return NextResponse.json({ saved });
}

export async function POST(request) {
  const { userId, articleId } = await request.json();

  if (!userId || !articleId) {
    return NextResponse.json({ error: "Missing userId or articleId" }, { status: 400 });
  }

  const success = await saveUserArticle(userId, articleId);

  if (!success) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const articleId = searchParams.get("articleId");

  if (!userId || !articleId) {
    return NextResponse.json({ error: "Missing userId or articleId" }, { status: 400 });
  }

  const success = await unsaveUserArticle(userId, articleId);

  if (!success) {
    return NextResponse.json({ error: "Failed to unsave" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}