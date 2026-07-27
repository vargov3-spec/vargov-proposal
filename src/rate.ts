/**
 * Vargov®Design internal USD→RUB rate.
 *
 * The company publishes one internal rate in the vargov.ru header — currently
 * rendered as "USD 81.1" with the note «Внутренний курс компании, обновляется
 * автоматически ежедневно в 12:00 по МСК».
 *
 * The value is present in the server-rendered HTML, so a plain HTTPS request is
 * enough (works in the browser-free cloud build).
 *
 * Parsing is deliberately markup-agnostic: the HTML is stripped to plain text
 * first, then the number is read next to "USD" (or near the word «курс»). An
 * earlier version keyed off a specific `<strong>` wrapper and silently fell back
 * to a hard-coded rate once the site was redesigned — hence the tag-free
 * approach and the loud warning when a live read fails.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, USER_AGENT, template } from "./config.js";

const CACHE_FILE = path.join(CACHE_DIR, "rate.json");
/** The site refreshes the rate daily at 12:00 MSK — keep our copy fresh. */
const MAX_AGE_MS = 60 * 60 * 1000; // 1h
const HOMEPAGE = "https://vargov.ru/";

export interface Rate {
  usdRub: number;
  source: "live" | "cache" | "fallback";
  fetchedAt: string;
}

function fallbackRate(): number {
  const r = Number(template.internalRate?.USD);
  return Number.isFinite(r) && r > 0 ? r : 81.1;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function toNumber(raw: string): number | undefined {
  const n = parseFloat(raw.replace(/\s+/g, "").replace(",", "."));
  // plausible RUB-per-USD band; guards against picking up random page numbers
  return Number.isFinite(n) && n >= 10 && n <= 1000 ? n : undefined;
}

/** Number with optional decimals, tolerant of spaces introduced by tag stripping. */
const AMOUNT = "(\\d{2,3}(?:\\s*[.,]\\s*\\d{1,2})?)";

export function parseRate(html: string): number | undefined {
  const text = stripTags(html);

  // 1) the canonical form on the site: "USD 81.1" (previously "USD 79.50")
  const direct = text.match(new RegExp(`USD\\s*${AMOUNT}`, "i"));
  if (direct) {
    const v = toNumber(direct[1]);
    if (v) return v;
  }

  // 2) any number close to the word «курс» (markup/wording may shift again)
  const kurs = text.search(/внутренн\w*\s+курс|курс/i);
  if (kurs >= 0) {
    const window = text.slice(Math.max(0, kurs - 200), kurs + 260);
    const near =
      window.match(new RegExp(`USD\\s*${AMOUNT}`, "i")) ??
      window.match(new RegExp(`${AMOUNT}\\s*(?:₽|руб)`, "i")) ??
      window.match(new RegExp(AMOUNT));
    if (near) {
      const v = toNumber(near[1]);
      if (v) return v;
    }
  }

  // 3) last resort: "$ 81.1" anywhere
  const dollar = text.match(new RegExp(`\\$\\s*${AMOUNT}`));
  if (dollar) return toNumber(dollar[1]);

  return undefined;
}

async function fetchLive(): Promise<number | undefined> {
  try {
    const res = await fetch(HOMEPAGE, {
      headers: { "User-Agent": USER_AGENT, "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return undefined;
    return parseRate(await res.text());
  } catch {
    return undefined;
  }
}

function readCache(): Rate | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as Rate;
    if (c.usdRub && Date.now() - new Date(c.fetchedAt).getTime() < MAX_AGE_MS) return c;
  } catch {
    /* no cache */
  }
  return undefined;
}

export async function getUsdRubRate(
  opts: { refresh?: boolean; log?: (m: string) => void } = {},
): Promise<Rate> {
  const log = opts.log ?? (() => {});
  if (!opts.refresh) {
    const cached = readCache();
    if (cached) {
      log(`Внутренний курс из кэша: 1 USD = ${cached.usdRub} ₽`);
      return { ...cached, source: "cache" };
    }
  }

  const live = await fetchLive();
  const rate: Rate = live
    ? { usdRub: live, source: "live", fetchedAt: new Date().toISOString() }
    : { usdRub: fallbackRate(), source: "fallback", fetchedAt: new Date().toISOString() };

  if (rate.source === "live") {
    log(`Внутренний курс с vargov.ru: 1 USD = ${rate.usdRub} ₽`);
  } else {
    log(
      `ВНИМАНИЕ: не удалось прочитать курс с vargov.ru — использую запасное значение ` +
        `1 USD = ${rate.usdRub} ₽. Проверьте, не изменилась ли вёрстка сайта.`,
    );
  }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(rate, null, 2), "utf-8");
  } catch {
    /* cache write is best-effort */
  }
  return rate;
}
