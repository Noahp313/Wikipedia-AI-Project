import NewArticleStream from "../../components/NewArticleStream";

// Where a search's article is written (streamed in) before it has an id.
// The request itself is handed over in memory by the search page.
export default async function NewArticlePage({ searchParams }) {
    const { d } = await searchParams;
    return <NewArticleStream pendingId={typeof d === "string" ? d : ""} />;
}
