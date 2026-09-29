import { NextResponse } from "next/server";
import { saveUserArticle, unsaveUserArticle, isArticleSaved } from "../../../lib/cache";
import { getOwnedArticle, getSessionUser } from "../../../lib/session";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");

  if (!articleId) {
    return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user || user.isAnonymous) {
    return NextResponse.json({ saved: false });
  }

  const saved = await isArticleSaved(user.id, articleId);
  return NextResponse.json({ saved });
}

export async function POST(request) {
  const { articleId } = await request.json();

  if (!articleId) {
    return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
  }

  const { user, article } = await getOwnedArticle(articleId);
  if (!user || user.isAnonymous) {
    return NextResponse.json({ error: "Sign in to save articles" }, { status: 401 });
  }
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const success = await saveUserArticle(user.id, articleId);

  if (!success) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");

  if (!articleId) {
    return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
  }

  const { user, article } = await getOwnedArticle(articleId);
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const success = await unsaveUserArticle(user.id, articleId);

  if (!success) {
    return NextResponse.json({ error: "Failed to unsave" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
