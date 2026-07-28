/**
 * The one place that turns a CommercialInput into a finished PDF on disk.
 * Shared by the CLI (src/index.ts) and the web app (src/server.ts).
 */
import { getProduct } from "./scrape.js";
import { getUsdRubRate } from "./rate.js";
import { downloadVideoThumb, prepareImages } from "./images.js";
import { buildMultiPdf, buildPdf, type QrAssets } from "./pdf/build.js";
import { formatDateRu, totalLine } from "./textutils.js";
import { template } from "./config.js";
import type {
  CommercialInput, MultiProposalContext, Position, ProposalContext, VideoLink,
} from "./types.js";

export interface GenerateResult {
  file: string;
  sku: string;
  title: string;
  photos: number;
  videos: number;
  /** Number of compositions in the document (1 for a single-item proposal). */
  positions: number;
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
    positions: 1,
  };
}

/**
 * Multi-position proposal: every composition gets its own page, followed by a
 * summary table with the grand total. Falls through to the single-item layout
 * when only one position was given.
 */
export async function generateProposals(
  inputs: CommercialInput[],
  opts: { refresh?: boolean; log?: Logger } = {},
): Promise<GenerateResult> {
  if (inputs.length <= 1) return generateProposal(inputs[0], opts);

  const log = opts.log ?? (() => {});
  log(`Позиций в предложении: ${inputs.length}`);

  const positions: Position[] = [];
  for (const input of inputs) {
    log(`Получаю данные о композиции ${input.sku}…`);
    const product = await getProduct(input.sku, { refresh: opts.refresh });
    const images = await prepareImages(input.sku, product.gallery.slice(0, 1), 1);
    if (!images.length) {
      throw new Error(`Не удалось подготовить изображение композиции ${input.sku}.`);
    }
    positions.push({
      input,
      product,
      image: images[0],
      totalLine: totalLine(input.price, input.deliveryCost),
    });
  }

  const rate = await getUsdRubRate({ refresh: opts.refresh, log });

  const ctx: MultiProposalContext = {
    positions,
    usdRub: rate.usdRub,
    date: formatDateRu(),
  };

  log("Собираю PDF…");
  const file = await buildMultiPdf(ctx);
  return {
    file,
    sku: positions.map((p) => p.product.sku).join(", "),
    title: `${positions.length} позиции`,
    photos: positions.length,
    videos: 0,
    positions: positions.length,
  };
}
