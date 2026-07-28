import path from "node:path";
import { BRAND_DIR, FONTS_DIR } from "../config.js";

/** A4 portrait, points */
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const M = 52; // outer margin
export const CW = PAGE_W - M * 2; // content width

/**
 * Design tokens lifted verbatim from vargov.ru (CSS custom properties on
 * :root, read from the live site). The site is dark-themed and warm-neutral;
 * the proposal keeps light content pages for print legibility but uses the
 * site's exact hues, and mirrors the site's dark surfaces on the cover and the
 * contacts page.
 */
export const CHARCOAL = "#0c0c0e"; // --color-charcoal (site background)
export const CHARCOAL_90 = "#131316"; // --color-charcoal-90
export const CHARCOAL_80 = "#1a1a1f"; // --color-charcoal-80
export const OFFWHITE = "#f2efe9"; // --color-white / --color-ink (text on dark)
export const STONE = "#6b6862"; // --color-stone-grey
export const MIST = "#a6a19a"; // --color-mist-grey

/** Ink on paper — content pages */
export const INK = CHARCOAL;
export const GRAPHITE = "#4a4843"; // warm body text
export const GREY = STONE;
export const LIGHT = MIST;
export const HAIRLINE = "#ddd9d1"; // warm rule, derived from --color-white
export const FAINT = OFFWHITE; // panel fill = site's off-white
export const PAPER = "#ffffff";

/** Brand accent — --color-gold / --color-brass on vargov.ru */
export const BRASS = "#d28200";
export const GOLD_SOFT = "#e39b2e"; // --color-gold-soft

/** Registered font names — Montserrat, exactly as the site loads it (300–600). */
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
