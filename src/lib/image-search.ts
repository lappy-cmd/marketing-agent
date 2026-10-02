import "server-only";
import type { ImageCandidate, ImageSource, ImageSources } from "./schemas";

// Finds images online for slides without an uploaded photo: Pexels for stock
// photos (free to use), Brave image search for specific real places/products
// (usually copyrighted, so the UI always shows where an image came from).

export class ImageSearchError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const MAX_CANDIDATES = 6;
const MIN_SIDE = 600;
const TIMEOUT_MS = 10_000;

export function imageSources(): ImageSources {
  return { stock: !!process.env.PEXELS_API_KEY, web: !!process.env.BRAVE_SEARCH_API_KEY };
}

const isHttps = (url: string) => /^https:\/\//i.test(url);

// Keeps images that will look right on a 4:5 slide. Web results don't always
// report their size (0); those are let through rather than dropped.
export function filterCandidates(raw: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  return raw
    .filter((c) => {
      if (!isHttps(c.url) || !isHttps(c.thumbUrl) || seen.has(c.url)) return false;
      if (/\.(svg|gif)(\?|#|$)/i.test(c.url)) return false;
      if (c.width > 0 && c.height > 0) {
        const aspect = c.height / c.width;
        if (c.width < MIN_SIDE || c.height < MIN_SIDE || aspect < 0.5 || aspect > 2) return false;
      }
      seen.add(c.url);
      return true;
    })
    .slice(0, MAX_CANDIDATES);
}

async function getJson(url: URL, headers: Record<string, string>, provider: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ImageSearchError(`Couldn't reach ${provider}. Please try again.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ImageSearchError(`${provider} rejected the API key. Check it in .env.local.`, 500);
  }
  if (res.status === 429) throw new ImageSearchError(`${provider} rate limit reached. Try again in a bit.`, 429);
  if (!res.ok) throw new ImageSearchError(`${provider} image search failed (${res.status}).`);
  return res.json();
}

interface PexelsPhoto {
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: { large2x: string; medium: string };
}

async function searchStock(query: string, key: string): Promise<ImageCandidate[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.search = new URLSearchParams({ query, orientation: "portrait", per_page: "15" }).toString();
  const data = (await getJson(url, { Authorization: key }, "Pexels")) as { photos?: PexelsPhoto[] };
  return (data.photos ?? []).map((p) => ({
    url: p.src.large2x,
    thumbUrl: p.src.medium,
    width: p.width,
    height: p.height,
    kind: "stock",
    sourceName: "Pexels",
    author: p.photographer ?? "",
    pageUrl: p.url,
  }));
}

interface BraveImage {
  url?: string; // the page the image is on
  source?: string;
  thumbnail?: { src?: string };
  properties?: { url?: string; width?: number; height?: number };
}

function domainOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function searchWeb(query: string, key: string): Promise<ImageCandidate[]> {
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.search = new URLSearchParams({ q: query, count: "20", safesearch: "strict" }).toString();
  const data = (await getJson(url, { "X-Subscription-Token": key, Accept: "application/json" }, "Brave Search")) as {
    results?: BraveImage[];
  };
  return (data.results ?? []).map((r) => ({
    url: r.properties?.url ?? "",
    thumbUrl: r.thumbnail?.src ?? "",
    width: r.properties?.width ?? 0,
    height: r.properties?.height ?? 0,
    kind: "web",
    sourceName: domainOf(r.url ?? "") || r.source || "web",
    author: "",
    pageUrl: r.url ?? "",
  }));
}

export async function searchImages(
  query: string,
  kind: ImageSource,
): Promise<{ candidates: ImageCandidate[]; kindUsed: ImageSource }> {
  const { PEXELS_API_KEY: pexels, BRAVE_SEARCH_API_KEY: brave } = process.env;
  if (kind === "web" && brave) return { candidates: filterCandidates(await searchWeb(query, brave)), kindUsed: "web" };
  // Without a web search key, a web request falls back to stock photos.
  if (pexels) return { candidates: filterCandidates(await searchStock(query, pexels)), kindUsed: "stock" };
  throw new ImageSearchError(
    kind === "web"
      ? "Image search isn't set up. Add BRAVE_SEARCH_API_KEY or PEXELS_API_KEY to .env.local and restart."
      : "Stock photos aren't set up. Add PEXELS_API_KEY to .env.local and restart.",
    500,
  );
}
