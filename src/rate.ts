/**
 * Vargov®Design internal USD→RUB rate.
 *
 * The company publishes a single internal exchange rate on the vargov.ru
 * homepage (a "внутренний курс USD 79.50" widget). We read it straight from the
 * server-rendered HTML — it sits in a <strong> next to the "внутренний курс"
 * label, so a plain HTTPS request is enough (works in the browser-free cloud
 * build too). Cached for a day; falls back to the value in proposal.json.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, USER_AGENT, template } from "./config.js";

const CACHE_FILE = path.join(CACHE_DIR, "rate.json");
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h
const HOMEPAGE = "https://vargov.ru/";

export interface Rate {
  usdRub: number;
  source: "live" | "cache" | "fallback";
  fetchedAt: string;
}

function fallback(): number {
  const r = Number(template.internalRate?.USD);
  return Number.isFinite(r) && r > 0 ? r : 79.5;
}

function parseRate(html: string): number | undefined {
  // label "внутренний курс" then a nearby <strong>USD 79.50</strong>
  let m = html.match(/внутренн[\s\S]{0,400}?<strong[^>]*>\s*USD\s*([\d]+[.,]?\d*)/i);
  if (!m) m = html.match(/USD\s*([\d]+[.,]\d{1,2})\s*<\/strong>/i);
  if (!m) return undefined;
  const v = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(v) && v > 10 && v < 1000 ? v : undefined;
}

async function fetchLive(): Promise<number | undefined> {
  try {
    const res = await fetch(HOMEPAGE, {
      headers: { "User-Agent": USER_AGENT },
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

export async function getUsdRubRate(opts: { refresh?: boolean; log?: (m: string) => void } = {}): Promise<Rate> {
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
    : { usdRub: fallback(), source: "fallback", fetchedAt: new Date().toISOString() };

  log(
    rate.source === "live"
      ? `Внутренний курс с vargov.ru: 1 USD = ${rate.usdRub} ₽`
      : `Внутренний курс недоступен на сайте — использую сохранённый: 1 USD = ${rate.usdRub} ₽`,
  );

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(rate, null, 2), "utf-8");
  } catch {
    /* cache write is best-effort */
  }
  return rate;
}
