import { getCachedUserArticle, getArticleHistory } from "../../../lib/cache";
import ArticleView from "../../components/ArticleView";
import { notFound } from "next/navigation";

export default async function ArticlePage({ params }) {
    const { articleId } = await params;

    const [article, history] = await Promise.all([
        getCachedUserArticle(articleId),
        getArticleHistory(articleId),
    ]);

    if (!article) {
        notFound();
    }

    return <ArticleView article={article} articleId={articleId} pastHistory={history} />;
}
