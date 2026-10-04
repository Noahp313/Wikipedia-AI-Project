// Images a Wikipedia article itself uses (plus Wikimedia Commons search results
// when the reader directly asks for an image), with license and author for the
// credit line. These are the only images an article may show — the model picks
// from this list by number and never supplies URLs itself.

import { WIKI_USER_AGENT } from "./wikiUserAgent";

const USER_AGENT = WIKI_USER_AGENT;
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

// An image list entry from imageinfo, or null for non-free / unusable files
function toImage(page, caption) {
  const ii = page?.imageinfo?.[0];
  const meta = ii?.extmetadata ?? {};
  // Free licenses only — skip non-free ("fair use") files
  if (!ii?.thumburl || meta.NonFree?.value === "true" || !meta.LicenseShortName?.value) return null;
  return {
    file: page.title,
    url: ii.thumburl,
    width: ii.thumbwidth,
    height: ii.thumbheight,
    caption: caption || stripHtml(meta.ImageDescription?.value).slice(0, 200),
    credit: stripHtml(meta.Artist?.value).slice(0, 120) || null,
    license: stripHtml(meta.LicenseShortName.value),
    descriptionUrl: ii.descriptionurl,
  };
}

// Wikimedia Commons search, for when the reader directly asks for an image and
// the source articles' own images may not have one. Same shape and license
// rules as fetchArticleImages; the model still only uses what fits. Never throws.
const MAX_COMMONS_RESULTS = 6;
export async function searchCommonsImages(query) {
  if (!query?.trim()) return [];
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap|drawing`,
      gsrnamespace: "6", // File:
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatalanguage: "en", // English descriptions where the file has one
      format: "json",
      formatversion: "2",
    });
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    return (data.query?.pages ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) // search rank
      .filter((page) => !JUNK_FILE.test(page.title))
      .map((page) => toImage(page, null))
      .filter((img) => img && img.caption)
      .slice(0, MAX_COMMONS_RESULTS);
  } catch (err) {
    console.error(`[wikiImages] Commons search failed for "${query}":`, err.message);
    return [];
  }
}

// Commons search matches every word, so only the subject is kept:
// "explain photosynthesis with an image of a chloroplast" → "chloroplast",
// "show a picture of the Krebs cycle please" → "Krebs cycle".
const IMAGE_WORD = String.raw`(?:images?|pictures?|photos?|photographs?|illustrations?|figures?)`;
const IMAGE_OF = new RegExp(String.raw`\b${IMAGE_WORD}\s+(?:of|showing)\s+(.+)`, "i");
const FILLER_WORDS = new RegExp(
  String.raw`\b(?:${IMAGE_WORD}|show|add|include|insert|put|give|explain|describe|what|how|why|is|are|does|do|me|us|with|an?|the|of|please|can|could|would|you|some|one|in|to|for|this|that|it|its|article|section)\b`,
  "gi"
);
function imageSearchTerms(text) {
  const subject = (text ?? "").match(IMAGE_OF)?.[1] ?? text ?? "";
  return subject.replace(/[^\p{L}\p{N}'\s-]/gu, " ").replace(FILLER_WORDS, " ").replace(/\s+/g, " ").trim();
}

// Translated copies of one diagram ("Citric acid cycle cs.svg", "... ro.svg")
// count as one image
function variantKey(file) {
  return file.replace(/\.\w+$/, "").replace(/[\s_-]+[a-z]{2}(?:-[a-z]+)?$/, "").toLowerCase();
}

// The image list plus Commons results for the request, appended so existing
// image numbers don't shift. `fallback` (e.g. the article title) is searched
// when the request names no subject or its search finds nothing.
export async function withCommonsImages(images, request, fallback) {
  const terms = imageSearchTerms(request);
  let results = terms ? await searchCommonsImages(terms) : [];
  if (results.length === 0 && fallback && fallback !== terms) results = await searchCommonsImages(fallback);

  const seen = new Set(images.filter(Boolean).map((img) => variantKey(img.file)));
  const added = results.filter((img) => !seen.has(variantKey(img.file)) && seen.add(variantKey(img.file)));
  return [...images, ...added];
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
      .map((item) =>
        toImage(byTitle.get(normalized.get(item.title) ?? item.title), stripHtml(item.caption?.text))
      )
      .filter((img) => img && img.caption);
  } catch (err) {
    console.error(`[wikiImages] couldn't load images for "${title}":`, err.message);
    return [];
  }
}
