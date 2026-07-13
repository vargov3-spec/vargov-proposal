/**
 * Vector logo drawing. The official brand SVG is rendered directly into the
 * PDF as vector paths via svg-to-pdfkit — no rasterization, infinitely crisp.
 * The source SVG carries Photoshop metadata and a <style> class; we strip both
 * and inline the brand-gold fill so svg-to-pdfkit renders it reliably.
 */
import fs from "node:fs";
import SVGtoPDF from "svg-to-pdfkit";
import type PDFDocument from "pdfkit";
import { BRASS, LOGO_GOLD_SVG, LOGO_RATIO } from "./theme.js";

type Doc = InstanceType<typeof PDFDocument>;

let cleaned: string | null = null;

function logoSvg(color: string): string {
  if (cleaned === null) {
    let s = fs.readFileSync(LOGO_GOLD_SVG, "utf-8");
    s = s.replace(/<metadata>[\s\S]*?<\/metadata>/g, "");
    s = s.replace(/<defs>[\s\S]*?<\/defs>/g, "");
    s = s.replace(/\s*class="cls-1"/g, "");
    // Drop the intrinsic width/height so svg-to-pdfkit scales to our options
    // (viewBox is kept as the coordinate system).
    s = s.replace(/(<svg[^>]*?)\s+width="[^"]*"/, "$1").replace(/(<svg[^>]*?)\s+height="[^"]*"/, "$1");
    cleaned = s;
  }
  // inline the requested fill on the single path
  return cleaned.replace(/<path /g, `<path fill="${color}" fill-rule="evenodd" `);
}

/** Draw the brand logo centered horizontally on the page. Returns its height. */
export function drawLogo(
  doc: Doc,
  centerX: number,
  y: number,
  width: number,
  color: string = BRASS,
): number {
  const height = width / LOGO_RATIO;
  SVGtoPDF(doc, logoSvg(color), centerX - width / 2, y, { width, height });
  return height;
}
