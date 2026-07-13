/**
 * Assembles the proposal PDF. Every page is laid out with absolute
 * coordinates on an A4 canvas — no library templates, catalog-grade design:
 * ink on paper, one brass accent, Montserrat, generous air.
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { OUTPUT_DIR, template } from "../config.js";
import type { GalleryImage, ProposalContext, VideoLink } from "../types.js";
import { cleanDescription, formatRate, rublesFor, rublesForTotal } from "../textutils.js";
import {
  eyebrow, footer, hairline, imageCover, label, measure,
} from "./helpers.js";
import { drawLogo } from "./logo.js";
import { drawQr } from "../qr.js";
import {
  BRASS, CW, F, FAINT, FONT_FILES, GRAPHITE, GREY, HAIRLINE, INK,
  M, PAGE_H, PAGE_W,
} from "./theme.js";

type Doc = InstanceType<typeof PDFDocument>;

export interface QrAssets {
  product: string;
  site: string;
  model3d?: string;
  videos: { video: VideoLink }[];
}

const FOOTER_LEFT = "VARGOV®DESIGN · ИНДИВИДУАЛЬНОЕ КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ";

// --------------------------------------------------------------------- pages

function coverPage(doc: Doc, ctx: ProposalContext): void {
  doc.addPage({ size: "A4", margin: 0 });

  drawLogo(doc, PAGE_W / 2, 46, 104);

  imageCover(doc, ctx.hero, M, 172, CW, 424);

  const centered = { width: CW, align: "center" as const };
  let y = 632;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text((ctx.product.title || template.cover.eyebrow).toUpperCase(), M, y, {
    ...centered, characterSpacing: 3.4,
  });

  y += 26;
  doc.font(F.light).fontSize(52).fillColor(INK);
  doc.text(ctx.product.sku, M, y, { ...centered, characterSpacing: 10 });

  y += 78;
  doc.font(F.regular).fontSize(9).fillColor(GREY);
  doc.text(template.tagline, M, y, { ...centered, characterSpacing: 0.6 });

  const by = PAGE_H - 56;
  hairline(doc, M, by, PAGE_W - M);
  doc.font(F.medium).fontSize(7).fillColor(GRAPHITE);
  doc.text(template.docTitle.toUpperCase(), M, by + 10, { characterSpacing: 1.6, lineBreak: false });
  const dateW = doc.widthOfString(ctx.date.toUpperCase(), { characterSpacing: 1.6 });
  doc.text(ctx.date.toUpperCase(), PAGE_W - M - dateW, by + 10, {
    characterSpacing: 1.6, lineBreak: false,
  });
}

function companyPage(doc: Doc, ctx: ProposalContext): void {
  const c = template.company;
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "01", template.sections.company);

  let y = 118;
  doc.font(F.light).fontSize(34).fillColor(INK);
  doc.text(c.heading, M, y, { width: CW });
  y += measure(doc, c.heading, F.light, 34, CW) + 18;

  const bodyW = CW * 0.92;
  // lead sentence — larger, brand-gold accent rule above
  doc.save().moveTo(M, y).lineTo(M + 34, y).lineWidth(1.4).strokeColor(BRASS).stroke().restore();
  y += 24;
  doc.font(F.light).fontSize(15).fillColor(GRAPHITE);
  doc.text(c.lead, M, y, { width: bodyW, lineGap: 6 });
  y += measure(doc, c.lead, F.light, 15, bodyW, 6) + 30;

  for (const p of c.paragraphs as string[]) {
    doc.font(F.regular).fontSize(10).fillColor(GRAPHITE);
    doc.text(p, M, y, { width: bodyW, lineGap: 5 });
    y += measure(doc, p, F.regular, 10, bodyW, 5) + 15;
  }

  // stat trio near the lower third
  const stats = c.stats as [string, string][];
  if (stats?.length) {
    const sy = Math.max(y + 12, PAGE_H - 190);
    hairline(doc, M, sy - 18, PAGE_W - M);
    const colW = CW / stats.length;
    stats.forEach(([title, sub], i) => {
      const cx = M + i * colW;
      const w = colW - 20;
      doc.font(F.semibold).fontSize(10).fillColor(INK);
      doc.text(title, cx, sy, { width: w });
      const th = measure(doc, title, F.semibold, 10, w);
      doc.font(F.regular).fontSize(8).fillColor(GREY);
      doc.text(sub, cx, sy + th + 4, { width: w, lineGap: 1.5 });
    });
  }

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · 02`);
}

function photoPages(doc: Doc, ctx: ProposalContext, startPage: number): number {
  const rest = ctx.images.slice(1);
  const caption = `${ctx.product.sku} · ${ctx.product.title.toUpperCase()} · VARGOV.RU`;
  let page = startPage;
  let i = 0;
  let pagesUsed = 0;
  const MAX_PHOTO_PAGES = 5;

  const isPortrait = (im: GalleryImage) => im.height > im.width * 1.05;

  while (i < rest.length && pagesUsed < MAX_PHOTO_PAGES) {
    const img = rest[i];
    doc.addPage({ size: "A4", margin: 0 });

    if (isPortrait(img)) {
      // full-bleed gallery page
      imageCover(doc, img, 0, 0, PAGE_W, PAGE_H);
      doc.font(F.medium).fontSize(6.5).fillColor("#ffffff");
      doc.text(caption, M, PAGE_H - 30, { characterSpacing: 1.8, lineBreak: false });
      i += 1;
    } else if (i + 1 < rest.length && !isPortrait(rest[i + 1]) && pagesUsed % 2 === 1) {
      // two landscape shots, stacked
      const h = (PAGE_H - M * 2 - 14 - 18) / 2;
      imageCover(doc, img, M, M, CW, h);
      imageCover(doc, rest[i + 1], M, M + h + 14, CW, h);
      doc.font(F.medium).fontSize(6.5).fillColor(GREY);
      doc.text(caption, M, M + h * 2 + 14 + 10, { characterSpacing: 1.8, lineBreak: false });
      i += 2;
    } else {
      // one large landscape shot, vertically centered
      const h = Math.min(CW / (img.width / img.height), PAGE_H - 220);
      const y = (PAGE_H - h) / 2 - 14;
      imageCover(doc, img, M, y, CW, h);
      doc.font(F.medium).fontSize(6.5).fillColor(GREY);
      doc.text(caption, M, y + h + 14, { characterSpacing: 1.8, lineBreak: false });
      i += 1;
    }
    pagesUsed += 1;
    page += 1;
  }
  return page;
}

interface SpecRow {
  name: string;
  value: string;
}

function collectSpecs(ctx: ProposalContext): SpecRow[] {
  const { input, product } = ctx;
  const { warranty } = cleanDescription(product.descriptionRaw);
  const rows: (SpecRow | undefined)[] = [
    { name: "Артикул", value: product.sku },
    product.categoryRu ? { name: "Категория", value: product.categoryRu } : undefined,
    input.compositionSize ? { name: "Размер композиции", value: input.compositionSize } : undefined,
    input.elementSize || product.elementSizeFromSite
      ? { name: "Размер элементов", value: input.elementSize ?? product.elementSizeFromSite! }
      : undefined,
    input.elementCount ? { name: "Количество элементов", value: input.elementCount } : undefined,
    ...product.characteristics,
    { name: "Производитель", value: template.specDefaults["Производитель"] },
    {
      name: "Гарантия",
      value: warranty ?? template.specDefaults["Гарантия"],
    },
  ];
  return rows.filter((r): r is SpecRow => !!r && !!r.value);
}

function specsPage(doc: Doc, ctx: ProposalContext, pageNo: number): void {
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "02", template.sections.specs);

  let y = 118;
  doc.font(F.light).fontSize(26).fillColor(INK);
  doc.text("Характеристики", M, y);
  y += 66;

  const labelW = 210;
  for (const row of collectSpecs(ctx)) {
    const vh = measure(doc, row.value, F.regular, 10.5, CW - labelW, 3);
    label(doc, row.name, M, y + 2);
    doc.font(F.regular).fontSize(10.5).fillColor(INK);
    doc.text(row.value, M + labelW, y, { width: CW - labelW, lineGap: 3 });
    y += Math.max(16, vh) + 12;
    hairline(doc, M, y, PAGE_W - M);
    y += 14;
  }

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
}

function offerPage(doc: Doc, ctx: ProposalContext, pageNo: number): void {
  const { input } = ctx;
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "03", template.sections.offer);

  let y = 118;
  doc.font(F.light).fontSize(26).fillColor(INK);
  doc.text("Коммерческое предложение", M, y);
  y += 40;
  doc.font(F.regular).fontSize(9).fillColor(GREY);
  doc.text(`Артикул ${ctx.product.sku} · ${ctx.date}`, M, y);
  y += 40;

  const rate = ctx.usdRub ?? 0;

  const row = (name: string, value?: string, strong = false) => {
    if (!value) return;
    label(doc, name, M, y + 3);
    doc.font(strong ? F.medium : F.regular).fontSize(strong ? 11.5 : 10.5).fillColor(INK);
    const w = doc.widthOfString(value);
    doc.text(value, PAGE_W - M - w, y, { lineBreak: false });
    y += 30;
    hairline(doc, M, y - 8, PAGE_W - M);
  };

  // money row with a right-aligned RUB subline (internal rate)
  const moneyRow = (name: string, value?: string) => {
    if (!value) return;
    label(doc, name, M, y + 3);
    doc.font(F.medium).fontSize(11.5).fillColor(INK);
    const w = doc.widthOfString(value);
    doc.text(value, PAGE_W - M - w, y, { lineBreak: false });
    const rub = rublesFor(value, rate);
    if (rub) {
      doc.font(F.regular).fontSize(8.5).fillColor(GREY);
      const rw = doc.widthOfString(rub);
      doc.text(rub, PAGE_W - M - rw, y + 15, { lineBreak: false });
      y += 42;
    } else {
      y += 30;
    }
    hairline(doc, M, y - 8, PAGE_W - M);
  };

  row("Размер композиции", input.compositionSize);
  row("Размер элементов", input.elementSize ?? ctx.product.elementSizeFromSite);
  row("Количество элементов", input.elementCount);
  moneyRow("Стоимость композиции", input.price);
  moneyRow("Стоимость доставки", input.deliveryCost);

  if (ctx.totalLine) {
    y += 6;
    doc.save().moveTo(M, y - 4).lineTo(PAGE_W - M, y - 4).lineWidth(1.2).strokeColor(BRASS).stroke().restore();
    y += 10;
    doc.font(F.semibold).fontSize(9).fillColor(INK);
    doc.text("ИТОГО", M, y + 7, { characterSpacing: 2.4, lineBreak: false });
    doc.font(F.semibold).fontSize(19).fillColor(INK);
    const w = doc.widthOfString(ctx.totalLine);
    doc.text(ctx.totalLine, PAGE_W - M - w, y, { lineBreak: false });
    const rubTotal = rublesForTotal(input.price, input.deliveryCost, rate);
    if (rubTotal) {
      doc.font(F.regular).fontSize(10).fillColor(GRAPHITE);
      const rw = doc.widthOfString(rubTotal);
      doc.text(rubTotal, PAGE_W - M - rw, y + 26, { lineBreak: false });
      y += 56;
    } else {
      y += 46;
    }
    // internal-rate note
    if (rate > 0) {
      doc.font(F.regular).fontSize(7.6).fillColor(GREY);
      const note = (template.rateNote as string).replace("{rate}", formatRate(rate));
      doc.text(note, M, y - 6, { width: CW, lineGap: 2 });
      y += measure(doc, note, F.regular, 7.6, CW, 2) + 8;
    }
  } else {
    y += 16;
  }

  // terms grid 2×2
  const terms: [string, string | undefined][] = [
    ["Срок производства", input.productionTime],
    ["Срок поставки", input.deliveryTime],
    ["Объём груза", input.cargoVolume],
    ["Вес груза", input.cargoWeight],
  ];
  const present = terms.filter(([, v]) => v) as [string, string][];
  if (present.length) {
    y += 8;
    const colW = CW / 2;
    present.forEach(([name, val], idx) => {
      const cx = M + (idx % 2) * colW;
      const cy = y + Math.floor(idx / 2) * 58;
      label(doc, name, cx, cy);
      doc.font(F.regular).fontSize(12).fillColor(INK);
      doc.text(val, cx, cy + 15, { lineBreak: false });
    });
    y += Math.ceil(present.length / 2) * 58 + 20;
  }

  // payment panel pinned to the lower part of the page
  const paras = template.paymentTerms as string[];
  const padX = 26;
  const padY = 24;
  const textW = CW - padX * 2;
  let panelH = padY + 22;
  for (const p of paras) panelH += measure(doc, p, F.regular, 9, textW, 4) + 9;
  panelH += padY - 9;

  const panelY = Math.max(y + 10, PAGE_H - 60 - panelH);
  doc.save().rect(M, panelY, CW, panelH).fillColor(FAINT).fill().restore();
  doc.save().rect(M, panelY, 2.5, panelH).fillColor(BRASS).fill().restore();

  let ty = panelY + padY;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text(template.sections.payment, M + padX, ty, { characterSpacing: 2.6 });
  ty += 22;
  for (const p of paras) {
    doc.font(F.regular).fontSize(9).fillColor(GRAPHITE);
    doc.text(p, M + padX, ty, { width: textW, lineGap: 4 });
    ty += measure(doc, p, F.regular, 9, textW, 4) + 9;
  }

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
}

function linksPage(doc: Doc, ctx: ProposalContext, qrs: QrAssets, pageNo: number): void {
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "04", template.sections.links);

  let y = 118;
  doc.font(F.light).fontSize(26).fillColor(INK);
  doc.text("Материалы онлайн", M, y);
  y += 40;
  doc.font(F.regular).fontSize(9).fillColor(GREY);
  doc.text("Наведите камеру телефона на QR-код", M, y);

  interface Card { data: string; caption: string; url: string }
  const cards: Card[] = [
    { data: qrs.product, caption: template.qrCaptions.product, url: shortUrl(ctx.product.url) },
    { data: qrs.site, caption: template.qrCaptions.site, url: "vargov.ru" },
  ];
  if (qrs.model3d) {
    cards.push({ data: qrs.model3d, caption: template.qrCaptions.model3d, url: shortUrl(qrs.model3d) });
  }
  qrs.videos.forEach((v, i) => {
    cards.push({
      data: v.video.url,
      caption: qrs.videos.length > 1 ? `${template.qrCaptions.video} ${i + 1}` : template.qrCaptions.video,
      url: shortUrl(v.video.url),
    });
  });

  const cols = 2;
  const cellW = CW / cols;
  const qrSize = 116;
  const cellH = 208;
  const top = 220;
  cards.forEach((card, idx) => {
    const cx = M + (idx % cols) * cellW;
    const cy = top + Math.floor(idx / cols) * cellH;
    drawQr(doc, card.data, cx + (cellW - qrSize) / 2, cy, qrSize);
    doc.font(F.medium).fontSize(9.5).fillColor(INK);
    doc.text(card.caption, cx, cy + qrSize + 16, { width: cellW, align: "center" });
    doc.font(F.regular).fontSize(7.5).fillColor(GREY);
    doc.text(card.url, cx, cy + qrSize + 32, { width: cellW, align: "center" });
  });

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
}

function shortUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 58);
}

function videoPage(doc: Doc, ctx: ProposalContext, qrs: QrAssets, pageNo: number): void {
  if (!qrs.videos.length) return;
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "05", template.sections.video);

  let y = 118;
  doc.font(F.light).fontSize(26).fillColor(INK);
  doc.text("Композиция в движении", M, y);
  y += 44;
  doc.font(F.regular).fontSize(9).fillColor(GREY);
  doc.text(template.videoNote, M, y, { width: CW * 0.82, lineGap: 3 });
  y += 44;

  const KIND_LABEL: Record<string, string> = {
    youtube: "YouTube", vimeo: "Vimeo", rutube: "RuTube", other: "Видео",
  };
  const isChannel = (u: string) => /\/channel\/|\/@|youtube\.com\/@/.test(u);
  const titleFor = (v: VideoLink) =>
    isChannel(v.url)
      ? `Официальный видеоканал Vargov®Design · ${KIND_LABEL[v.kind]}`
      : `Видео композиции ${ctx.product.sku} · ${KIND_LABEL[v.kind]}`;

  const videos = qrs.videos.slice(0, 3).map((v) => v.video);
  const [primary, ...more] = videos;

  // primary — large frame
  const frameH = 236;
  if (primary.thumbFile && fs.existsSync(primary.thumbFile)) {
    imageCover(doc, { file: primary.thumbFile, url: "", width: 1280, height: 720 }, M, y, CW, frameH);
  } else {
    doc.save().rect(M, y, CW, frameH).fillColor(INK).fill().restore();
    doc.font(F.medium).fontSize(8).fillColor("#8a8a8a");
    doc.text("VARGOV®DESIGN", M, y + frameH - 26, { width: CW, align: "center", characterSpacing: 3 });
  }
  const cx = M + CW / 2;
  const cy = y + frameH / 2;
  doc.save().circle(cx, cy, 27).fillColor(BRASS).fill().restore();
  doc.save().moveTo(cx - 6, cy - 10).lineTo(cx + 12, cy).lineTo(cx - 6, cy + 10)
    .closePath().fillColor("#ffffff").fill().restore();

  y += frameH + 20;
  doc.font(F.medium).fontSize(10.5).fillColor(INK);
  doc.text(titleFor(primary), M, y, { lineBreak: false });
  doc.font(F.regular).fontSize(8).fillColor(GREY);
  doc.text(shortUrl(primary.url), M, y + 17, { lineBreak: false });
  drawQr(doc, primary.url, PAGE_W - M - 58, y - 4, 58);
  y += 78;

  // additional videos — compact rows
  for (const v of more) {
    hairline(doc, M, y, PAGE_W - M);
    y += 18;
    // gold play chip
    doc.save().roundedRect(M, y - 2, 40, 40, 3).fillColor(INK).fill().restore();
    doc.save().moveTo(M + 15, y + 8).lineTo(M + 28, y + 18).lineTo(M + 15, y + 28)
      .closePath().fillColor(BRASS).fill().restore();
    doc.font(F.medium).fontSize(10).fillColor(INK);
    doc.text(titleFor(v), M + 56, y + 2, { lineBreak: false });
    doc.font(F.regular).fontSize(8).fillColor(GREY);
    doc.text(shortUrl(v.url), M + 56, y + 19, { lineBreak: false });
    drawQr(doc, v.url, PAGE_W - M - 44, y - 2, 44);
    y += 54;
  }

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
}

function contactsPage(doc: Doc, ctx: ProposalContext, qrs: QrAssets): void {
  doc.addPage({ size: "A4", margin: 0 });

  const logoH = drawLogo(doc, PAGE_W / 2, 118, 128);

  const centered = { width: CW, align: "center" as const };
  let y = 118 + logoH + 30;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text(template.sections.contacts, M, y, { ...centered, characterSpacing: 3.4 });

  y += 34;
  for (const line of template.contacts.lines as { label: string; value: string }[]) {
    doc.font(F.medium).fontSize(6.8).fillColor(GREY);
    doc.text(line.label.toUpperCase(), M, y, { ...centered, characterSpacing: 2 });
    doc.font(F.regular).fontSize(12).fillColor(INK);
    doc.text(line.value, M, y + 12, centered);
    y += 46;
  }

  y += 8;
  hairline(doc, PAGE_W / 2 - 20, y, PAGE_W / 2 + 20);
  y += 20;
  doc.font(F.regular).fontSize(8.5).fillColor(GRAPHITE);
  doc.text(template.contacts.showroom, M, y, centered);
  y += 18;
  doc.font(F.regular).fontSize(8).fillColor(GREY);
  doc.text(template.contacts.socials, M, y, centered);

  const qrSize = 84;
  drawQr(doc, qrs.site, (PAGE_W - qrSize) / 2, PAGE_H - 178, qrSize);
  doc.font(F.medium).fontSize(7.5).fillColor(GREY);
  doc.text("VARGOV.RU", M, PAGE_H - 82, { ...centered, characterSpacing: 2.4 });

  const by = PAGE_H - 56;
  hairline(doc, M, by, PAGE_W - M);
  doc.font(F.medium).fontSize(6.8).fillColor(GREY);
  doc.text(`© ${new Date().getFullYear()} VARGOV®DESIGN`, M, by + 10, {
    characterSpacing: 1.6, lineBreak: false,
  });
  const t = template.tagline.toUpperCase();
  const tw = doc.widthOfString(t, { characterSpacing: 1.2 });
  doc.font(F.medium).fontSize(6.2);
  doc.text(t, PAGE_W - M - tw, by + 10.5, { characterSpacing: 1.2, lineBreak: false });
}

// ------------------------------------------------------------------ assembly

export async function buildPdf(ctx: ProposalContext, qrs: QrAssets): Promise<string> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(OUTPUT_DIR, `Commercial_Proposal_${ctx.product.sku}.pdf`);

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    compress: true,
    info: {
      Title: `Vargov®Design — Коммерческое предложение ${ctx.product.sku}`,
      Author: "Vargov®Design",
      Subject: ctx.product.title,
    },
  });
  for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, file);

  const stream = fs.createWriteStream(outFile);
  doc.pipe(stream);

  coverPage(doc, ctx);
  companyPage(doc, ctx);
  let pageNo = 3;
  pageNo = photoPages(doc, ctx, pageNo);
  specsPage(doc, ctx, pageNo++);
  offerPage(doc, ctx, pageNo++);
  linksPage(doc, ctx, qrs, pageNo++);
  videoPage(doc, ctx, qrs, pageNo++);
  contactsPage(doc, ctx, qrs);

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  return outFile;
}
