import QRCode from "qrcode";
import type PDFDocument from "pdfkit";
import { INK } from "./pdf/theme.js";

type Doc = InstanceType<typeof PDFDocument>;

/**
 * Draw a QR code as native vector modules (filled rectangles) — fully
 * scalable, no raster image embedded. A tiny cell overlap removes hairline
 * seams between modules when the PDF is rendered.
 */
export function drawQr(doc: Doc, text: string, x: number, y: number, size: number, dark = INK): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const cell = size / n;
  const overlap = cell * 0.04;

  doc.save().fillColor(dark);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (data[r * n + c]) {
        doc.rect(x + c * cell, y + r * cell, cell + overlap, cell + overlap);
      }
    }
  }
  doc.fill();
  doc.restore();
}
