/**
 * The one place that turns a CommercialInput into a finished PDF on disk.
 * Shared by the CLI (src/index.ts) and the web app (src/server.ts).
 */
import { getProduct } from "./scrape.js";
import { getUsdRubRate } from "./rate.js";
import { downloadVideoThumb, prepareImages } from "./images.js";
import { buildPdf, type QrAssets } from "./pdf/build.js";
import { formatDateRu, totalLine } from "./textutils.js";
import { template } from "./config.js";
import type { CommercialInput, ProposalContext, VideoLink } from "./types.js";

export interface GenerateResult {
  file: string;
  sku: string;
  title: string;
  photos: number;
  videos: number;
}

type Logger = (msg: string) => void;

/** Brand video channels used when a composition has no dedicated video of its own. */
function brandVideos(): VideoLink[] {
  return (template.brandVideo as { url: string; kind: VideoLink["kind"] }[]).map((v) => ({
    url: v.url,
    kind: v.kind,
  }));
}

export async function generateProposal(
  input: CommercialInput,
  opts: { refresh?: boolean; log?: Logger } = {},
): Promise<GenerateResult> {
  const log = opts.log ?? (() => {});

  log(`Получаю данные о композиции ${input.sku}…`);
  const product = await getProduct(input.sku, { refresh: opts.refresh });

  // A composition either has its own video(s), or we point to the brand channels.
  if (!product.videos.length) product.videos = brandVideos();
  log(`${product.title} — фото: ${product.gallery.length}, видео: ${product.videos.length}`);

  log("Готовлю изображение (только первое фото с сайта)…");
  const images = await prepareImages(input.sku, product.gallery.slice(0, 1), 1);
  if (!images.length) throw new Error("Не удалось подготовить изображение композиции.");

  for (const v of product.videos) {
    if (v.id) v.thumbFile = await downloadVideoThumb(input.sku, v.kind, v.id, v.url);
  }

  const rate = await getUsdRubRate({ refresh: opts.refresh, log });

  const qrs: QrAssets = {
    product: product.url,
    site: template.websiteUrl,
    model3d: product.model3dUrl,
    videos: product.videos.map((video) => ({ video })),
  };

  const ctx: ProposalContext = {
    product,
    input,
    images,
    hero: images[0],
    totalLine: totalLine(input.price, input.deliveryCost),
    usdRub: rate.usdRub,
    date: formatDateRu(),
  };

  log("Собираю PDF…");
  const file = await buildPdf(ctx, qrs);
  return {
    file,
    sku: product.sku,
    title: product.title,
    photos: images.length,
    videos: product.videos.length,
  };
}
