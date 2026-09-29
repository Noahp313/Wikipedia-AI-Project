import { getArticleHistory, recordArticleOpen } from "../../../lib/cache";
import { getOwnedArticle } from "../../../lib/session";
import ArticleView from "../../components/ArticleView";
import { notFound } from "next/navigation";

export default async function ArticlePage({ params }) {
    const { articleId } = await params;

    // Owner-only: someone else's article looks exactly like a missing one
    const { user, article } = await getOwnedArticle(articleId);

    if (!article) {
        notFound();
    }

    const [history] = await Promise.all([getArticleHistory(articleId), recordArticleOpen(user, articleId)]);

    return <ArticleView article={article} articleId={articleId} pastHistory={history} />;
}
