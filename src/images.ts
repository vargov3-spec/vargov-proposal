/**
 * Image pipeline: download originals into cache/<SKU>/originals (once),
 * then produce print-optimized JPEGs in cache/<SKU>/opt.
 * "Best" images = the merchant's primary shot first, then the rest ranked
 * by real pixel size; tiny files are dropped.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { USER_AGENT, cacheDirFor } from "./config.js";
import type { GalleryImage } from "./types.js";

const MAX_EDGE = 2400; // ~300 dpi at full A4 bleed
const JPEG_QUALITY = 82;
const MIN_WIDTH = 900; // skip thumbnails / low-res leftovers

function nameFor(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex").slice(0, 12) + ".jpg";
}

async function download(url: string, file: string): Promise<boolean> {
  if (fs.existsSync(file) && fs.statSync(file).size > 10_000) return true; // cached
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5_000) throw new Error("suspiciously small file");
      fs.writeFileSync(file, buf);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return false;
}

export async function prepareImages(
  sku: string,
  urls: string[],
  maxCount = 10,
): Promise<GalleryImage[]> {
  const dir = cacheDirFor(sku);
  const out: GalleryImage[] = [];

  let done = 0;
  for (const url of urls) {
    const orig = path.join(dir, "originals", nameFor(url));
    const opt = path.join(dir, "opt", nameFor(url));
    if (!(await download(url, orig))) continue;
    done++;

    try {
      if (!fs.existsSync(opt)) {
        await sharp(orig)
          .rotate() // respect EXIF
          .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
          .toFile(opt);
      }
      const meta = await sharp(opt).metadata();
      if (!meta.width || !meta.height || meta.width < MIN_WIDTH) continue;
      out.push({ url, file: opt, width: meta.width, height: meta.height });
    } catch {
      /* unreadable image — skip */
    }
  }
  console.log(`  Изображения: скачано/в кэше ${done} из ${urls.length}, пригодно ${out.length}.`);

  // primary shot stays first; the rest ordered by resolution
  const [hero, ...rest] = out;
  rest.sort((a, b) => b.width * b.height - a.width * a.height);
  return (hero ? [hero, ...rest] : rest).slice(0, maxCount);
}

/** Download a video preview frame (best effort). Returns local file or undefined. */
export async function downloadVideoThumb(
  sku: string,
  kind: string,
  id: string | undefined,
  url: string,
): Promise<string | undefined> {
  if (!id) return undefined;
  const dir = cacheDirFor(sku);
  const file = path.join(dir, "originals", `video_${kind}_${id.slice(0, 12)}.jpg`);

  let thumbUrl: string | undefined;
  if (kind === "youtube") {
    thumbUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    if (!(await download(thumbUrl, file))) {
      thumbUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      if (!(await download(thumbUrl, file))) return undefined;
    }
    return file;
  }
  if (kind === "vimeo") {
    try {
      const res = await fetch(`https://vimeo.com/api/v2/video/${id}.json`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      const data: any = await res.json();
      thumbUrl = data?.[0]?.thumbnail_large;
    } catch {
      return undefined;
    }
  }
  if (kind === "rutube") {
    try {
      const res = await fetch(`https://rutube.ru/api/video/${id}/`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      const data: any = await res.json();
      thumbUrl = data?.thumbnail_url;
    } catch {
      return undefined;
    }
  }
  if (thumbUrl && (await download(thumbUrl, file))) return file;
  return undefined;
}
