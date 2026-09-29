// Images a Wikipedia article itself uses, with license and author for the
// credit line. These are the only images an article may show — the model picks
// from this list by number and never supplies URLs itself.

const USER_AGENT = "WikAi/1.0 (noahp0313@outlook.com)";
const MAX_PER_ARTICLE = 8;
const THUMB_WIDTH = 800;

// Maintenance icons, flags and logos that aren't about the subject
const JUNK_FILE = /(icon|logo|flag of|symbol support|question book|commons-logo|edit-clear|ambox|padlock|wiktionary|wikiquote|nuvola|crystal clear|folder hexagonal|stub)/i;

function stripHtml(html) {
  return (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// [{ file, url, width, height, caption, credit, license, descriptionUrl }] — never throws
export async function fetchArticleImages(title) {
  try {
    const media = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`
    );

    // Figures with captions (and the lead image) are the ones about the subject
    const candidates = (media.items ?? [])
      .filter((item) => item.type === "image" && item.title && !JUNK_FILE.test(item.title))
      .filter((item) => item.leadImage || item.caption?.text)
      .slice(0, MAX_PER_ARTICLE);
    if (candidates.length === 0) return [];

    const params = new URLSearchParams({
      action: "query",
      titles: candidates.map((c) => c.title).join("|"),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: String(THUMB_WIDTH),
      format: "json",
      formatversion: "2",
    });
    const info = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
    const byTitle = new Map((info.query?.pages ?? []).map((p) => [p.title, p]));
    // The API normalizes titles (e.g. underscores → spaces)
    const normalized = new Map((info.query?.normalized ?? []).map((n) => [n.from, n.to]));

    return candidates
      .map((item) => {
        const page = byTitle.get(normalized.get(item.title) ?? item.title);
        const ii = page?.imageinfo?.[0];
        const meta = ii?.extmetadata ?? {};
        // Free licenses only — skip non-free ("fair use") files
        if (!ii?.thumburl || meta.NonFree?.value === "true" || !meta.LicenseShortName?.value) return null;
        return {
          file: page.title,
          url: ii.thumburl,
          width: ii.thumbwidth,
          height: ii.thumbheight,
          caption: stripHtml(item.caption?.text) || stripHtml(meta.ImageDescription?.value).slice(0, 200),
          credit: stripHtml(meta.Artist?.value).slice(0, 120) || null,
          license: stripHtml(meta.LicenseShortName.value),
          descriptionUrl: ii.descriptionurl,
        };
      })
      .filter((img) => img && img.caption);
  } catch (err) {
    console.error(`[wikiImages] couldn't load images for "${title}":`, err.message);
    return [];
  }
}
