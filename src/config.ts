import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const ASSETS = path.join(ROOT, "assets");
export const FONTS_DIR = path.join(ASSETS, "fonts");
export const BRAND_DIR = path.join(ASSETS, "brand");
export const CACHE_DIR = path.join(ROOT, "cache");
export const OUTPUT_DIR = path.join(ROOT, "output");
export const TEMPLATES_DIR = path.join(ROOT, "templates");
/** Self-contained bundled data (present in cloud deploys where the parent repo is absent). */
export const DATA_DIR = path.join(ROOT, "data");

/**
 * Resolve a data file: prefer the bundled copy under ./data (so the app is
 * self-contained in a Docker/cloud deploy), else fall back to the repo layout.
 */
function dataFile(bundledName: string, ...repoRel: string[]): string {
  const bundled = path.join(DATA_DIR, bundledName);
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(ROOT, "..", ...repoRel);
}

/** Product dataset (mirror of vargov.ru): SKU→URL index and offline fallback. */
export const LOCAL_DATASET = dataFile("vargov-products.json", "vargov-products.json");
/** Known video links per SKU collected earlier (optional). */
export const LOCAL_VIDEOS = dataFile("video_links.json", "catalog", "data", "video_links.json");
/** Known 3D-model links per SKU (optional). */
export const LOCAL_MODELS3D = dataFile("model3d_links.json", "catalog", "data", "model3d_links.json");

export const SITEMAP_URL = "https://vargov.ru/sitemap-store.xml";
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 VargovProposalBot/1.0";

export const template = JSON.parse(
  fs.readFileSync(path.join(TEMPLATES_DIR, "proposal.json"), "utf-8"),
);

export function cacheDirFor(sku: string): string {
  const dir = path.join(CACHE_DIR, sku);
  fs.mkdirSync(path.join(dir, "originals"), { recursive: true });
  fs.mkdirSync(path.join(dir, "opt"), { recursive: true });
  return dir;
}
