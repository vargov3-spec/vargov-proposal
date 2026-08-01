/**
 * Vargov®Design internal USD→RUB rate.
 *
 * The company publishes one internal rate in the vargov.ru header — rendered as
 * e.g. "USD 82.5" next to «Внутренний курс компании, обновляется автоматически
 * ежедневно в 12:00 по МСК». The value sits in the server-rendered HTML, so a
 * plain HTTPS request is enough (no browser needed in the cloud build).
 *
 * Freshness policy — a proposal must quote the current rate, so every
 * generation asks the site first:
 *   1. live fetch (retried, several host spellings)
 *   2. cached value, if a recent one exists
 *   3. the value baked into proposal.json, with a loud warning
 *
 * Parsing is markup-agnostic on purpose: the HTML is stripped to plain text and
 * the number is read next to "USD" (or near «курс»). An earlier version keyed
 * off a specific <strong> wrapper and silently served a stale fallback once the
 * site was redesigned.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, USER_AGENT, template } from "./config.js";

const CACHE_FILE = path.join(CACHE_DIR, "rate.json");
/** A cached rate is only a safety net when the site is unreachable. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Authoritative source: the site's own endpoint, which returns {"usd":"82.5"}.
 * The header markup is NOT reliable on its own — vargov.ru is a Next.js app and
 * server-renders a cached rate (e.g. 81.7) that the browser then replaces with
 * the live value from this API. Reading only the HTML quotes a stale rate.
 */
const RATE_API_URLS = ["https://vargov.ru/api/usd-rate", "https://www.vargov.ru/api/usd-rate"];
/** Fallback source: the rendered homepage (may lag behind the API). */
const HOMEPAGE_URLS = ["https://vargov.ru/", "https://www.vargov.ru/"];

export interface Rate {
  usdRub: number;
  source: "live" | "cache" | "fallback";
  fetchedAt: string;
  /** Why the live read failed (diagnostics only). */
  error?: string;
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

  // 1) the canonical form on the site: "USD 82.5"
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

  // 3) last resort: "$ 82.5" anywhere
  const dollar = text.match(new RegExp(`\\$\\s*${AMOUNT}`));
  if (dollar) return toNumber(dollar[1]);

  return undefined;
}

async function httpGet(url: string, accept: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Accept-Language": "ru-RU,ru;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Read {"usd":"82.5"} (also tolerates {rate|value|usdRub} or a bare number). */
export function parseRateJson(body: string): number | undefined {
  try {
    const data = JSON.parse(body) as unknown;
    const raw =
      typeof data === "number" || typeof data === "string"
        ? data
        : (data as Record<string, unknown>)?.usd ??
          (data as Record<string, unknown>)?.usdRub ??
          (data as Record<string, unknown>)?.rate ??
          (data as Record<string, unknown>)?.value;
    if (raw === undefined || raw === null) return undefined;
    return toNumber(String(raw));
  } catch {
    return undefined;
  }
}

/** API first (live), then the rendered homepage; each host spelling, twice. */
async function fetchLive(): Promise<{ rate?: number; error?: string }> {
  const errors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const url of RATE_API_URLS) {
      try {
        const rate = parseRateJson(await httpGet(url, "application/json", 12_000));
        if (rate) return { rate };
        throw new Error("курс не найден в ответе API");
      } catch (e) {
        errors.push(`${url}: ${(e as Error).message}`);
      }
    }
    for (const url of HOMEPAGE_URLS) {
      try {
        const rate = parseRate(await httpGet(url, "text/html,application/xhtml+xml", 15_000));
        if (rate) return { rate };
        throw new Error("курс не найден в HTML");
      } catch (e) {
        errors.push(`${url}: ${(e as Error).message}`);
      }
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
  }
  return { error: [...new Set(errors)].join(" | ") };
}

function readCache(): Rate | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as Rate;
    if (c.usdRub && Date.now() - new Date(c.fetchedAt).getTime() < CACHE_MAX_AGE_MS) return c;
  } catch {
    /* no cache */
  }
  return undefined;
}

function writeCache(rate: Rate): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(rate, null, 2), "utf-8");
  } catch {
    /* cache write is best-effort */
  }
}

export async function getUsdRubRate(
  opts: { log?: (m: string) => void } = {},
): Promise<Rate> {
  const log = opts.log ?? (() => {});

  // 1) always ask the site first — a proposal must quote the current rate
  const live = await fetchLive();
  if (live.rate) {
    const rate: Rate = { usdRub: live.rate, source: "live", fetchedAt: new Date().toISOString() };
    log(`Внутренний курс с vargov.ru: 1 USD = ${rate.usdRub} ₽`);
    writeCache(rate);
    return rate;
  }

  // 2) recent cached value
  const cached = readCache();
  if (cached) {
    log(
      `ВНИМАНИЕ: сайт недоступен (${live.error}) — беру курс из кэша ` +
        `от ${cached.fetchedAt}: 1 USD = ${cached.usdRub} ₽`,
    );
    return { ...cached, source: "cache", error: live.error };
  }

  // 3) value from the template
  const rate: Rate = {
    usdRub: fallbackRate(),
    source: "fallback",
    fetchedAt: new Date().toISOString(),
    error: live.error,
  };
  log(
    `ВНИМАНИЕ: курс с vargov.ru получить не удалось (${live.error}) — ` +
      `использую запасное значение 1 USD = ${rate.usdRub} ₽`,
  );
  return rate;
}
