import path from "node:path";
import { BRAND_DIR, FONTS_DIR } from "../config.js";

/** A4 portrait, points */
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const M = 52; // outer margin
export const CW = PAGE_W - M * 2; // content width

/** vargov.ru palette: ink on paper with a restrained brass accent */
export const INK = "#1a1a1a";
export const GRAPHITE = "#454545";
export const GREY = "#8a8a8a";
export const LIGHT = "#c9c9c9";
export const HAIRLINE = "#dcdcdc";
export const FAINT = "#f7f6f4";
/** Brand gold — taken directly from the official Vargov®Design logo (3.svg). */
export const BRASS = "#bf8219";
export const PAPER = "#ffffff";

/** Registered font names */
export const F = {
  light: "M-Light",
  regular: "M-Regular",
  medium: "M-Medium",
  semibold: "M-SemiBold",
} as const;

export const FONT_FILES: Record<string, string> = {
  [F.light]: path.join(FONTS_DIR, "Montserrat-Light.ttf"),
  [F.regular]: path.join(FONTS_DIR, "Montserrat-Regular.ttf"),
  [F.medium]: path.join(FONTS_DIR, "Montserrat-Medium.ttf"),
  [F.semibold]: path.join(FONTS_DIR, "Montserrat-SemiBold.ttf"),
};

/** Official brand logo — vector, drawn straight into the PDF (no rasterization). */
export const LOGO_GOLD_SVG = path.join(BRAND_DIR, "logo_gold.svg");
/** logo_gold.svg intrinsic aspect ratio (w/h), for height math */
export const LOGO_RATIO = 692.281 / 689.157;
