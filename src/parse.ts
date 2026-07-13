/**
 * Parse a pasted commercial data block into a CommercialInput.
 *
 * Tolerant by design — the text is typed by hand on a phone, so labels may
 * carry extra words ("Стоимость доставки до МСК: 900$"), amounts may use "$",
 * cargo volume and weight may share one line ("2куб., 90кг"), and values may
 * sit on the line after their label:
 *
 *   Композиция: LC0537
 *   Размер композиции: L8000, W1000 мм
 *   Стоимость композиции: 44 100 USD
 *   Срок производства: 60–90 рабочих дней
 *   Размер и вес груза:
 *   4 м³
 *   200 кг
 *   Стоимость доставки: 6 000 USD
 *   Срок поставки:
 *   до 60 календарных дней
 */
import type { CommercialInput } from "./types.js";

type Key = keyof CommercialInput;

/**
 * Label synonyms → field. Matched as a PREFIX of the text before the colon, so
 * "Стоимость доставки до МСК" still resolves to deliveryCost. Order matters:
 * more specific patterns first.
 */
const LABELS: [RegExp, Key][] = [
  [/^(?:композиция|артикул|модель)\b/i, "sku"],
  [/^размер\s+композиции/i, "compositionSize"],
  [/^размер\s+элемент/i, "elementSize"],
  [/^кол(?:-?во|ичество)?\s*элемент/i, "elementCount"],
  [/^стоимость\s+композиции/i, "price"],
  [/^стоимость\s+доставки/i, "deliveryCost"],
  [/^срок\s+производства/i, "productionTime"],
  [/^срок\s+поставки/i, "deliveryTime"],
  [/^объ[её]м\s+груза/i, "cargoVolume"],
  [/^вес\s+груза/i, "cargoWeight"],
];

const CARGO_BOTH = /^размер\s+и\s+вес\s+груза/i;
const SKU_RE = /\b([A-Za-zА-Яа-я]{1,3}\d{3,5})\b/;

// cargo-unit tokens: pull "2куб." / "4 м³" (volume) and "90кг" / "200 кг" (weight)
const CARGO_VOL = /([\d.,]+\s*(?:м\s*³|м\s*3(?!\d)|куб\.?[а-яё]*|m³|m3|cbm))/i;
const CARGO_WT = /([\d.,]+\s*(?:кг|kg|тонн[а-яё]*|т(?![а-яё])))/i;

function matchLabel(label: string): Key | undefined {
  for (const [re, key] of LABELS) if (re.test(label)) return key;
  return undefined;
}

export function parseBlock(text: string): CommercialInput {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Partial<CommercialInput> = {};
  let cargoMode = false; // seen a "Размер и вес груза" header — following bare lines are cargo

  /** Pull volume/weight tokens out of a line; only assigns what it recognises. */
  const assignCargo = (val: string) => {
    const v = val.match(CARGO_VOL);
    const w = val.match(CARGO_WT);
    if (v && !out.cargoVolume) out.cargoVolume = v[1].trim();
    if (w && !out.cargoWeight) out.cargoWeight = w[1].trim();
    // a header value with neither unit (rare) — keep it as the volume line
    if (!v && !w && !out.cargoVolume) out.cargoVolume = val;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(":");
    const labelText = colon >= 0 ? line.slice(0, colon).trim() : line;
    const inlineVal = colon >= 0 ? line.slice(colon + 1).trim() : "";

    // "Размер и вес груза:" — opens the cargo block
    if (colon >= 0 && CARGO_BOTH.test(labelText)) {
      cargoMode = true;
      if (inlineVal) assignCargo(inlineVal);
      continue;
    }

    const key = colon >= 0 ? matchLabel(labelText) : undefined;
    if (key) {
      if (inlineVal) {
        out[key] = key === "sku" ? normSku(inlineVal) : inlineVal;
      } else {
        // value(s) on the following line(s), up to the next recognised label
        const collected: string[] = [];
        while (i + 1 < lines.length) {
          const next = lines[i + 1];
          const nc = next.indexOf(":");
          const nlabel = nc >= 0 ? next.slice(0, nc).trim() : next;
          if (nc >= 0 && (matchLabel(nlabel) || CARGO_BOTH.test(nlabel))) break;
          collected.push(next);
          i++;
        }
        if (collected.length) out[key] = key === "sku" ? normSku(collected[0]) : collected.join(", ");
      }
      // NB: a labelled line does NOT close the cargo block — cargo values may
      // still appear after it (the user interleaves them).
      continue;
    }

    // bare line — only meaningful inside the cargo block
    if (cargoMode) assignCargo(line);
  }

  if (!out.sku) {
    const m = text.match(SKU_RE);
    if (m) out.sku = normSku(m[1]);
  }
  if (!out.sku) throw new Error("Не найден артикул композиции (например, «Композиция: LC0537»).");

  return out as CommercialInput;
}

function normSku(s: string): string {
  const m = s.match(SKU_RE);
  return (m ? m[1] : s).toUpperCase().replace(/\s+/g, "");
}
