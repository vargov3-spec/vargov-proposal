import type PDFDocument from "pdfkit";
import type { GalleryImage } from "../types.js";
import { BRASS, CW, F, GREY, HAIRLINE, INK, M, PAGE_H, PAGE_W } from "./theme.js";

type Doc = InstanceType<typeof PDFDocument>;

export function hairline(doc: Doc, x1: number, y: number, x2: number, color = HAIRLINE): void {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.6).strokeColor(color).stroke().restore();
}

/** Small numbered section label: brass index + letterspaced caps. */
export function eyebrow(doc: Doc, num: string, label: string, x = M, y = M + 6): void {
  doc.font(F.semibold).fontSize(8).fillColor(BRASS);
  doc.text(num, x, y, { characterSpacing: 2, lineBreak: false });
  const numW = doc.widthOfString(num, { characterSpacing: 2 });
  doc.font(F.medium).fontSize(8).fillColor(GREY);
  doc.text(label, x + numW + 14, y, { characterSpacing: 2.6, lineBreak: false });
}

/** Cover-crop an image into the given frame (never distorts, fills fully). */
export function imageCover(
  doc: Doc,
  img: GalleryImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.image(img.file, x + (w - dw) / 2, y + (h - dh) / 2, { width: dw, height: dh });
  doc.restore();
}

/** Fit an image inside a frame, centered; returns the drawn rect. */
export function imageContain(
  doc: Doc,
  img: GalleryImage,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  doc.image(img.file, dx, dy, { width: dw, height: dh });
  return { x: dx, y: dy, w: dw, h: dh };
}

/** Standard footer for content pages. */
export function footer(doc: Doc, left: string, right: string): void {
  const y = PAGE_H - 42;
  hairline(doc, M, y, PAGE_W - M);
  doc.font(F.medium).fontSize(6.8).fillColor(GREY);
  doc.text(left, M, y + 9, { characterSpacing: 1.6, lineBreak: false });
  const w = doc.widthOfString(right, { characterSpacing: 1.6 });
  doc.text(right, PAGE_W - M - w, y + 9, { characterSpacing: 1.6, lineBreak: false });
}

/** Height of a wrapped text block without drawing it. */
export function measure(
  doc: Doc,
  text: string,
  font: string,
  size: number,
  width = CW,
  lineGap = 0,
): number {
  doc.font(font).fontSize(size);
  return doc.heightOfString(text, { width, lineGap });
}

export function label(doc: Doc, text: string, x: number, y: number): void {
  doc.font(F.medium).fontSize(7.2).fillColor(GREY);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false });
}

export function value(doc: Doc, text: string, x: number, y: number, size = 11): void {
  doc.font(F.regular).fontSize(size).fillColor(INK);
  doc.text(text, x, y, { lineBreak: false });
}
