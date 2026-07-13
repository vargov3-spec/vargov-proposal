/** Text utilities: description cleanup, money math, Russian dates. */

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatDateRu(d = new Date()): string {
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The vargov.ru product cards mix the actual description with ordering
 * boilerplate (WhatsApp CTA, element size, 3D-model download line, warranty).
 * Pull those service fragments out — they live in other blocks of the PDF —
 * and keep the descriptive text itself.
 */
export function cleanDescription(raw: string): { text: string; warranty?: string } {
  let s = ` ${raw} `;

  let warranty: string | undefined;
  const wm = s.match(/Гарантия распространяется[^.]*?(?=(Размер элемента|3D модель|$))/i);
  if (wm) {
    warranty = wm[0].trim().replace(/\s+/g, " ");
    s = s.replace(wm[0], " ");
  }

  s = s
    .replace(/Для расчета[\s\S]*?WhatsApp/gi, " ")
    // "Размер элемента: W250мм, L400мм" — greedily swallow every dimension token
    .replace(/Размер\s+элемент[а-яё]*\s*:?\s*(?:[WLHDВГШ]?\s?\d+\s?мм[\s,;]*)+/gi, " ")
    .replace(/3D\s*модель[\s\S]*?скачать\s*3d\s*модель/gi, " ")
    .replace(/скачать\s*3d\s*модель/gi, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  // sentence-terminate fragments that lost their punctuation
  if (s && !/[.!?…]$/.test(s)) s += ".";
  // "заказ Гарантия" style seams → add missing full stops between glued sentences
  s = s.replace(/([а-яё])\s+(?=[А-ЯЁ])/g, "$1. ");

  return { text: s, warranty };
}

export interface Money {
  amount: number;
  currency: string;
}

const CUR = "USD|EUR|RUB|AED|АЕД|\\$|€|₽|руб\\.?|долл[а-яё.]*|евро";

function normCurrency(raw: string): string {
  const c = raw.toUpperCase();
  if (c.includes("$") || c.startsWith("USD") || c.startsWith("ДОЛЛ")) return "USD";
  if (c.includes("€") || c.startsWith("EUR") || c.startsWith("ЕВРО")) return "EUR";
  if (c.includes("₽") || c.startsWith("RUB") || c.startsWith("РУБ")) return "RUB";
  if (c.includes("AED") || c.includes("АЕД")) return "AED";
  return c;
}

/**
 * Parse a hand-typed money string. Tolerant of "$" either side, no thousands
 * separators, and currency words:  "44 100 USD", "17940$", "$900", "6 000 руб".
 */
export function parseMoney(s: string | undefined): Money | undefined {
  if (!s) return undefined;
  let digits: string | undefined;
  let cur: string | undefined;
  // amount then currency
  let m = s.match(new RegExp(`([\\d][\\d\\s.,]*)\\s*(${CUR})`, "i"));
  if (m) {
    digits = m[1];
    cur = m[2];
  } else {
    // currency symbol first: "$900", "€1 200"
    m = s.match(/(\$|€|₽)\s*([\d][\d\s.,]*)/);
    if (m) {
      cur = m[1];
      digits = m[2];
    }
  }
  if (!digits || !cur) return undefined;
  const n = digits.replace(/[^\d]/g, "");
  if (!n) return undefined;
  return { amount: parseInt(n, 10), currency: normCurrency(cur) };
}

export function formatMoney(m: Money): string {
  const grouped = m.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} ${m.currency}`;
}

/** "44 100 USD" + "6 000 USD" -> "50 100 USD" (only when currencies match). */
export function totalLine(price?: string, delivery?: string): string | undefined {
  const p = parseMoney(price);
  if (!p) return undefined;
  const d = parseMoney(delivery);
  if (!d) return formatMoney(p);
  if (d.currency !== p.currency) return formatMoney(p);
  return formatMoney({ amount: p.amount + d.amount, currency: p.currency });
}

const RUB_FMT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatRub(amount: number): string {
  return `${RUB_FMT.format(Math.round(amount))} ₽`;
}

/** Convert a money string to a "≈ 3 505 950 ₽" line using the internal USD rate. */
export function rublesFor(money: string | undefined, usdRub: number): string | undefined {
  const m = parseMoney(money);
  if (!m || m.currency !== "USD" || !(usdRub > 0)) return undefined;
  return `≈ ${formatRub(m.amount * usdRub)}`;
}

/** RUB equivalent of two money strings summed (price + delivery). */
export function rublesForTotal(
  price: string | undefined,
  delivery: string | undefined,
  usdRub: number,
): string | undefined {
  const p = parseMoney(price);
  if (!p || p.currency !== "USD" || !(usdRub > 0)) return undefined;
  const d = parseMoney(delivery);
  const sum = p.amount + (d && d.currency === "USD" ? d.amount : 0);
  return `≈ ${formatRub(sum * usdRub)}`;
}

/**
 * The final payable sum in rubles (price + delivery), without the "≈" — this is
 * the amount the client actually pays, fixed by the internal rate for 48h.
 * Returns e.g. "3 982 950 ₽".
 */
export function rublesTotalExact(
  price: string | undefined,
  delivery: string | undefined,
  usdRub: number,
): string | undefined {
  const p = parseMoney(price);
  if (!p || p.currency !== "USD" || !(usdRub > 0)) return undefined;
  const d = parseMoney(delivery);
  const sum = p.amount + (d && d.currency === "USD" ? d.amount : 0);
  return formatRub(sum * usdRub);
}

/** Format the internal rate for notes, ru-style decimal: 79.5 -> "79,50". */
export function formatRate(usdRub: number): string {
  return usdRub.toFixed(2).replace(".", ",");
}
