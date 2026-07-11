import { getCachedUserArticle } from "../../../lib/cache";
import ArticleView from "../../components/ArticleView";
import { notFound } from "next/navigation";

export default async function ArticlePage({ params }) {
    const { articleId } = await params;

    const article = await getCachedUserArticle(articleId)
    
    if (!article) {
        notFound();
    }

    return <ArticleView article={article} articleId={articleId} />;
}