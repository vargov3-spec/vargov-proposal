/**
 * Product data acquisition for vargov.ru (Tilda store).
 *
 * Order of attack:
 *   1. per-SKU cache (cache/<SKU>/product.json) — never re-scrape needlessly;
 *   2. live product page via Playwright (falls back to plain HTTPS fetch when
 *      the browser is not installed) — Tilda embeds `var product = {...}` in HTML;
 *   3. repo dataset vargov-products.json as URL resolver and offline fallback.
 *
 * Videos (YouTube / Vimeo / RuTube) are harvested from the rendered page and
 * from the local video-links cache.
 */
import fs from "node:fs";
import path from "node:path";
import {
  LOCAL_DATASET,
  LOCAL_MODELS3D,
  LOCAL_VIDEOS,
  SITEMAP_URL,
  USER_AGENT,
  cacheDirFor,
} from "./config.js";
import type { ProductData, VideoLink } from "./types.js";

const PRODUCT_RE = /var product = (\{[\s\S]*?\});/;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function plainFetch(url: string, timeoutMs = 30_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Fetch product page HTML. Tilda embeds `var product = {...}` straight into the
 * server-rendered HTML, so a plain HTTPS request is enough — and that is what we
 * use in the cloud (NO_BROWSER=1), keeping the deploy light and browser-free.
 * Locally, Playwright is tried first (more robust against flaky networks) with a
 * plain-fetch fallback.
 */
async function fetchPageHtml(url: string): Promise<string> {
  if (process.env.NO_BROWSER) return plainFetch(url);
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: USER_AGENT });
      await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.log(
      `  Playwright недоступен (${(err as Error).message.split("\n")[0]}) — использую прямой HTTPS-запрос.`,
    );
    return plainFetch(url);
  }
}

function classifyVideo(url: string): VideoLink {
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return { url, kind: "youtube", id: m[1] };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { url, kind: "vimeo", id: m[1] };
  m = url.match(/rutube\.ru\/video\/([0-9a-f]{16,})/);
  if (m) return { url, kind: "rutube", id: m[1] };
  return { url, kind: "other" };
}

function extractVideos(html: string): VideoLink[] {
  const patterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/|shorts\/)[\w-]{6,}[^"'\s<)\\]*/g,
    /https?:\/\/youtu\.be\/[\w-]{6,}[^"'\s<)\\]*/g,
    /https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?\d+[^"'\s<)\\]*/g,
    /https?:\/\/rutube\.ru\/video\/[0-9a-f]{16,}\/?/g,
  ];
  const found = new Map<string, VideoLink>();
  for (const re of patterns) {
    for (const raw of html.match(re) ?? []) {
      const v = classifyVideo(raw.replace(/\\+$/, ""));
      const key = `${v.kind}:${v.id ?? v.url}`;
      if (!found.has(key)) found.set(key, v);
    }
  }
  return [...found.values()];
}

function extract3dLink(rawDescriptionHtml: string): string | undefined {
  for (const m of rawDescriptionHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (m[1].includes("3ddd") || /3d/i.test(stripTags(m[2]))) return m[1];
  }
  return undefined;
}

/** Parse "Размер элемента: W250мм, L400мм" out of the description text. */
function extractElementSize(text: string): string | undefined {
  const m = text.match(/размер элемент[а-я]*\s*:?\s*([WLHD]\s?\d+\s?мм[^.]{0,40}?мм)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
}

interface LocalRecord {
  url: string;
  sku: string;
  title: string;
  description: string;
  gallery: string[];
  characteristics?: { name?: string; title?: string; value?: string }[];
  category_ru?: string;
}

function loadLocalDataset(): LocalRecord[] {
  if (!fs.existsSync(LOCAL_DATASET)) return [];
  return JSON.parse(fs.readFileSync(LOCAL_DATASET, "utf-8"));
}

function loadJsonMap(file: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function normaliseCharacteristics(
  raw: { name?: string; title?: string; value?: string }[] | undefined,
): { name: string; value: string }[] {
  return (raw ?? [])
    .map((c) => ({ name: (c.name ?? c.title ?? "").trim(), value: (c.value ?? "").trim() }))
    .filter((c) => c.name && c.value);
}

function fromTildaProduct(url: string, html: string): ProductData | null {
  const m = html.match(PRODUCT_RE);
  if (!m) return null;
  let obj: any;
  try {
    obj = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const rawText: string = obj.text ?? "";
  const description = stripTags(rawText);
  return {
    sku: obj.sku ?? "",
    title: (obj.title ?? "").trim(),
    url,
    categoryRu: "",
    descriptionRaw: description,
    gallery: (obj.gallery ?? []).map((g: any) => g.img).filter(Boolean),
    model3dUrl: extract3dLink(rawText),
    videos: extractVideos(html),
    characteristics: normaliseCharacteristics(obj.characteristics),
    elementSizeFromSite: extractElementSize(description),
    source: "live",
  };
}

async function resolveProductUrl(sku: string): Promise<string | undefined> {
  const local = loadLocalDataset().find(
    (p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase(),
  );
  if (local) return local.url;

  // Not in the local mirror — walk the live sitemap until the SKU shows up.
  console.log("  Артикул не найден в локальной базе — ищу по sitemap vargov.ru…");
  const xml = await plainFetch(SITEMAP_URL);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const batch = 6;
  for (let i = 0; i < urls.length; i += batch) {
    const slice = urls.slice(i, i + batch);
    const results = await Promise.allSettled(slice.map((u) => plainFetch(u)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== "fulfilled") continue;
      const skuMatch = r.value.match(/"sku":\s*"([^"]+)"/);
      if (skuMatch && skuMatch[1].toUpperCase() === sku.toUpperCase()) return slice[j];
    }
  }
  return undefined;
}

function fromLocalRecord(rec: LocalRecord): ProductData {
  return {
    sku: rec.sku,
    title: rec.title?.trim() || "Композиция",
    url: rec.url,
    categoryRu: rec.category_ru ?? "",
    descriptionRaw: rec.description ?? "",
    gallery: rec.gallery ?? [],
    model3dUrl: undefined,
    videos: [],
    characteristics: normaliseCharacteristics(rec.characteristics),
    elementSizeFromSite: extractElementSize(rec.description ?? ""),
    source: "local-dataset",
  };
}

export async function getProduct(sku: string, opts: { refresh?: boolean } = {}): Promise<ProductData> {
  const cacheFile = path.join(cacheDirFor(sku), "product.json");
  if (!opts.refresh && fs.existsSync(cacheFile)) {
    console.log("  Данные о композиции взяты из кэша.");
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  }

  const localRec = loadLocalDataset().find(
    (p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase(),
  );

  let product: ProductData | null = null;
  try {
    const url = localRec?.url ?? (await resolveProductUrl(sku));
    if (!url) throw new Error(`страница товара ${sku} не найдена на vargov.ru`);
    console.log(`  Загружаю страницу товара: ${url}`);
    const html = await fetchPageHtml(url);
    product = fromTildaProduct(url, html);
    if (product && !product.sku) product.sku = sku;
  } catch (err) {
    console.log(`  Живой скрапинг не удался: ${(err as Error).message}`);
  }

  if (!product && localRec) {
    console.log("  Использую локальную копию данных vargov.ru.");
    product = fromLocalRecord(localRec);
  }
  if (!product) throw new Error(`Не удалось получить данные о композиции ${sku}.`);

  // enrich from local record / caches
  if (localRec?.category_ru) product.categoryRu = localRec.category_ru;
  if (!product.gallery.length && localRec) product.gallery = localRec.gallery ?? [];

  const videoCache = loadJsonMap(LOCAL_VIDEOS);
  const cachedVideo = videoCache[sku.toUpperCase()];
  if (cachedVideo && !product.videos.some((v) => v.url === cachedVideo)) {
    product.videos.push(classifyVideo(cachedVideo));
  }
  // drop generic channel/system links, keep concrete videos only
  product.videos = product.videos.filter((v) => v.kind !== "other");

  const models3d = loadJsonMap(LOCAL_MODELS3D);
  if (!product.model3dUrl && models3d[sku.toUpperCase()]) {
    product.model3dUrl = models3d[sku.toUpperCase()];
  }

  fs.writeFileSync(cacheFile, JSON.stringify(product, null, 2), "utf-8");
  return product;
}
