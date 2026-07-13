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
import { cleanDescription, formatRate, halfAmounts, rublesFor, rublesTotalExact } from "../textutils.js";
import {
  eyebrow, footer, hairline, imageCover, label, measure,
} from "./helpers.js";
import { drawLogo } from "./logo.js";
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

function paymentPanelHeight(doc: Doc, schedule?: string[]): number {
  const padX = 26, padY = 24, textW = CW - padX * 2;
  const paras = template.paymentTerms as string[];
  let h = padY + 22;
  if (schedule && schedule.length) {
    h += measure(doc, template.paymentScheduleIntro, F.regular, 9, textW, 4) + 8;
    for (const s of schedule) h += measure(doc, s, F.regular, 9, textW - 14, 4) + 11;
    h += 6;
  }
  for (const p of paras) h += measure(doc, p, F.regular, 9, textW, 4) + 9;
  return h + padY - 9;
}

function drawPaymentPanel(doc: Doc, y: number, schedule?: string[]): number {
  const padX = 26, padY = 24, textW = CW - padX * 2;
  const paras = template.paymentTerms as string[];
  const h = paymentPanelHeight(doc, schedule);
  doc.save().rect(M, y, CW, h).fillColor(FAINT).fill().restore();
  doc.save().rect(M, y, 2.5, h).fillColor(BRASS).fill().restore();
  let ty = y + padY;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text(template.sections.payment, M + padX, ty, { characterSpacing: 2.6 });
  ty += 22;
  if (schedule && schedule.length) {
    doc.font(F.regular).fontSize(9).fillColor(GRAPHITE);
    doc.text(template.paymentScheduleIntro, M + padX, ty, { width: textW, lineGap: 4 });
    ty += measure(doc, template.paymentScheduleIntro, F.regular, 9, textW, 4) + 8;
    for (const s of schedule) {
      doc.save().circle(M + padX + 2, ty + 4.5, 1.7).fillColor(BRASS).fill().restore();
      doc.font(F.regular).fontSize(9).fillColor(GRAPHITE);
      doc.text(s, M + padX + 14, ty, { width: textW - 14, lineGap: 4 });
      ty += measure(doc, s, F.regular, 9, textW - 14, 4) + 11;
    }
    ty += 6;
  }
  for (const p of paras) {
    doc.font(F.regular).fontSize(9).fillColor(GRAPHITE);
    doc.text(p, M + padX, ty, { width: textW, lineGap: 4 });
    ty += measure(doc, p, F.regular, 9, textW, 4) + 9;
  }
  return y + h;
}

function deliveryPanelHeight(doc: Doc): number {
  const padX = 26, padY = 22, textW = CW - padX * 2;
  const d = template.delivery;
  const rows = Math.ceil((d.carriers as string[]).length / 2);
  let h = padY + 16;
  h += measure(doc, d.intro, F.regular, 9, textW, 4) + 14;
  h += rows * 19 + 12;
  h += measure(doc, d.note, F.regular, 8.5, textW, 3);
  return h + padY;
}

function drawDeliveryPanel(doc: Doc, y: number): number {
  const padX = 26, padY = 22, textW = CW - padX * 2;
  const d = template.delivery;
  const carriers = d.carriers as string[];
  const h = deliveryPanelHeight(doc);
  doc.save().rect(M, y, CW, h).fillColor(FAINT).fill().restore();
  doc.save().rect(M, y, 2.5, h).fillColor(BRASS).fill().restore();
  let ty = y + padY;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text(d.heading, M + padX, ty, { characterSpacing: 2.6 });
  ty += 16;
  doc.font(F.regular).fontSize(9).fillColor(GRAPHITE);
  doc.text(d.intro, M + padX, ty, { width: textW, lineGap: 4 });
  ty += measure(doc, d.intro, F.regular, 9, textW, 4) + 14;
  const colW = textW / 2;
  carriers.forEach((c, i) => {
    const cx = M + padX + (i % 2) * colW;
    const cyy = ty + Math.floor(i / 2) * 19;
    doc.save().circle(cx + 2, cyy + 5, 1.7).fillColor(BRASS).fill().restore();
    doc.font(F.medium).fontSize(9.5).fillColor(INK);
    doc.text(c, cx + 11, cyy, { width: colW - 14, lineBreak: false });
  });
  ty += Math.ceil(carriers.length / 2) * 19 + 12;
  doc.font(F.regular).fontSize(8.5).fillColor(GREY);
  doc.text(d.note, M + padX, ty, { width: textW, lineGap: 3 });
  return y + h;
}

function offerPage(doc: Doc, ctx: ProposalContext, pageNo: number): number {
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
  moneyRow("Стоимость доставки до МСК", input.deliveryCost);

  if (ctx.totalLine) {
    const rubFinal = rublesTotalExact(input.price, input.deliveryCost, rate);
    y += 6;
    doc.save().moveTo(M, y - 4).lineTo(PAGE_W - M, y - 4).lineWidth(1.2).strokeColor(BRASS).stroke().restore();
    y += 12;

    if (rubFinal) {
      // Payment is made in rubles by the internal rate — so the ruble sum is the
      // hero final amount; USD stands above it as a reference subtotal.
      doc.font(F.medium).fontSize(8).fillColor(GREY);
      doc.text("ИТОГО", M, y + 4, { characterSpacing: 2.4, lineBreak: false });
      doc.font(F.medium).fontSize(12).fillColor(GRAPHITE);
      const uw = doc.widthOfString(ctx.totalLine);
      doc.text(ctx.totalLine, PAGE_W - M - uw, y, { lineBreak: false });
      y += 30;

      doc.font(F.semibold).fontSize(9).fillColor(INK);
      doc.text("ИТОГО К ОПЛАТЕ, ₽", M, y + 11, { characterSpacing: 2, lineBreak: false });
      doc.font(F.semibold).fontSize(23).fillColor(INK);
      const rw = doc.widthOfString(rubFinal);
      doc.text(rubFinal, PAGE_W - M - rw, y, { lineBreak: false });
      y += 50;
    } else {
      // No usable rate — show the USD total prominently.
      doc.font(F.semibold).fontSize(9).fillColor(INK);
      doc.text("ИТОГО", M, y + 7, { characterSpacing: 2.4, lineBreak: false });
      doc.font(F.semibold).fontSize(19).fillColor(INK);
      const w = doc.widthOfString(ctx.totalLine);
      doc.text(ctx.totalLine, PAGE_W - M - w, y, { lineBreak: false });
      y += 44;
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
    ["Срок доставки до МСК", input.deliveryTime],
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

  // two-invoice payment schedule (amounts filled from the internal rate)
  const ha = halfAmounts(input.price, input.deliveryCost, rate);
  const schedule = ha
    ? (template.paymentSchedule as string[]).map((s) =>
        s.replace(/\{half\}/g, ha.half).replace(/\{rate\}/g, ha.rate).replace(/\{rub\}/g, ha.rub))
    : undefined;

  // delivery + payment panels — spill to a continuation page if they don't fit
  const gap = 18;
  const dH = deliveryPanelHeight(doc);
  const pH = paymentPanelHeight(doc, schedule);
  const limit = PAGE_H - 54;
  let extraPages = 0;

  let py: number;
  if (y + gap + dH + gap + pH <= limit) {
    py = y + gap;
  } else {
    footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
    doc.addPage({ size: "A4", margin: 0 });
    eyebrow(doc, "03", template.sections.offer);
    doc.font(F.light).fontSize(24).fillColor(INK);
    doc.text("Доставка и условия оплаты", M, 118);
    py = 174;
    pageNo += 1;
    extraPages = 1;
  }

  py = drawDeliveryPanel(doc, py) + gap;
  drawPaymentPanel(doc, py, schedule);

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
  return 1 + extraPages;
}

function linksPage(doc: Doc, ctx: ProposalContext, qrs: QrAssets, pageNo: number): void {
  doc.addPage({ size: "A4", margin: 0 });
  eyebrow(doc, "04", template.sections.links);

  let y = 118;
  doc.font(F.light).fontSize(26).fillColor(INK);
  doc.text("Ссылки и материалы", M, y);
  y += 40;
  doc.font(F.regular).fontSize(9).fillColor(GREY);
  doc.text("Нажмите на ссылку, чтобы открыть её в браузере", M, y);
  y += 46;

  const KIND_LABEL: Record<string, string> = {
    youtube: "Видео · YouTube", rutube: "Видео · RuTube", vimeo: "Видео · Vimeo", other: "Видео",
  };
  interface Item { label: string; url: string }
  const items: Item[] = [
    { label: template.qrCaptions.product, url: qrs.product },
    { label: template.qrCaptions.site, url: qrs.site },
  ];
  if (qrs.model3d) items.push({ label: template.qrCaptions.model3d, url: qrs.model3d });
  qrs.videos.forEach((v) => items.push({ label: KIND_LABEL[v.video.kind] ?? "Видео", url: v.video.url }));

  for (const it of items) {
    label(doc, it.label, M, y);
    drawLink(doc, displayUrl(it.url), M, y + 14, it.url, { size: 12.5, underline: true });
    y += 32;
    hairline(doc, M, y + 4, PAGE_W - M);
    y += 22;
  }

  footer(doc, FOOTER_LEFT, `${ctx.product.sku} · ${String(pageNo).padStart(2, "0")}`);
}

function shortUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 58);
}

/** Human-friendly link text: strip protocol, trim, ellipsize very long URLs. */
function displayUrl(u: string): string {
  const s = u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return s.length > 68 ? `${s.slice(0, 66)}…` : s;
}

/**
 * Draw clickable link text with an explicit annotation rectangle. Using
 * doc.link() (rather than the text `link` option) avoids PDFKit computing a
 * NaN rectangle for centered / non-wrapping text.
 */
function drawLink(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  url: string,
  opts: { size: number; color?: string; center?: boolean; underline?: boolean } = { size: 11 },
): void {
  const color = opts.color ?? BRASS;
  doc.font(F.regular).fontSize(opts.size).fillColor(color);
  const w = doc.widthOfString(text);
  const lx = opts.center ? M + (CW - w) / 2 : x;
  doc.text(text, lx, y, { lineBreak: false });
  if (opts.underline) {
    doc.save().moveTo(lx, y + opts.size + 1).lineTo(lx + w, y + opts.size + 1)
      .lineWidth(0.5).strokeColor(color).stroke().restore();
  }
  doc.link(lx, y - 1, w, opts.size + 5, url);
}

interface ContactLine { label: string; value: string; url?: string }

function contactsPage(doc: Doc, ctx: ProposalContext, qrs: QrAssets): void {
  doc.addPage({ size: "A4", margin: 0 });

  const c = template.contacts;
  const logoH = drawLogo(doc, PAGE_W / 2, 92, 116);
  const centered = { width: CW, align: "center" as const };

  let y = 92 + logoH + 24;
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text((c.heading as string).toUpperCase(), M, y, { ...centered, characterSpacing: 3.4 });
  y += 28;

  const contactRow = (line: ContactLine) => {
    doc.font(F.medium).fontSize(6.6).fillColor(GREY);
    doc.text(line.label.toUpperCase(), M, y, { ...centered, characterSpacing: 2 });
    if (line.url) {
      drawLink(doc, line.value, M, y + 11, line.url, { size: 11.5, center: true });
    } else {
      doc.font(F.regular).fontSize(11.5).fillColor(INK);
      doc.text(line.value, M, y + 11, centered);
    }
    y += 35;
  };

  for (const line of c.lines as ContactLine[]) contactRow(line);

  y += 4;
  hairline(doc, PAGE_W / 2 - 20, y, PAGE_W / 2 + 20);
  y += 18;
  doc.font(F.medium).fontSize(7.5).fillColor(GREY);
  doc.text((c.socialsHeading as string).toUpperCase(), M, y, { ...centered, characterSpacing: 3 });
  y += 22;
  for (const line of c.socials as ContactLine[]) contactRow(line);

  y += 6;
  doc.font(F.regular).fontSize(8.5).fillColor(GRAPHITE);
  doc.text(c.showroom as string, M, y, centered);

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
  pageNo += offerPage(doc, ctx, pageNo);
  linksPage(doc, ctx, qrs, pageNo++);
  contactsPage(doc, ctx, qrs);

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  return outFile;
}
