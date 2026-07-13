/**
 * Parse a pasted commercial data block into a CommercialInput.
 *
 * Handles the exact format the user sends, where some values sit on the line
 * after their label:
 *
 *   Композиция: LC0537
 *   Размер композиции: L8000, W1000 мм
 *   Размер элементов: L400, W250 мм
 *   Количество элементов: 60 шт.
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

/** Label synonyms → field. Order matters: longer/more specific first. */
const LABELS: [RegExp, Key][] = [
  [/^(?:композиция|артикул|модель)$/i, "sku"],
  [/^размер\s+композиции$/i, "compositionSize"],
  [/^размер\s+элемент(?:а|ов)$/i, "elementSize"],
  [/^кол(?:ичество|-во)\s+элементов$/i, "elementCount"],
  [/^стоимость\s+композиции$/i, "price"],
  [/^стоимость\s+доставки$/i, "deliveryCost"],
  [/^срок\s+производства$/i, "productionTime"],
  [/^срок\s+поставки$/i, "deliveryTime"],
  [/^(?:объ[её]м\s+груза)$/i, "cargoVolume"],
  [/^вес\s+груза$/i, "cargoWeight"],
];

const CARGO_BOTH = /^размер\s+и\s+вес\s+груза$/i;
const SKU_RE = /\b([A-Za-zА-Яа-я]{1,3}\d{3,5})\b/;

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
  let pendingCargo = false; // inside a "Размер и вес груза:" multi-line block

  const assignCargo = (val: string) => {
    if (/м\s*(?:³|3|куб)/i.test(val) && !out.cargoVolume) out.cargoVolume = val;
    else if (/кг|kg|т\b|тонн/i.test(val) && !out.cargoWeight) out.cargoWeight = val;
    else if (!out.cargoVolume) out.cargoVolume = val;
    else if (!out.cargoWeight) out.cargoWeight = val;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(":");
    const label = colon >= 0 ? line.slice(0, colon).trim() : line;
    const inlineVal = colon >= 0 ? line.slice(colon + 1).trim() : "";
    const hasLabel = colon >= 0 && (matchLabel(label) || CARGO_BOTH.test(label));

    if (hasLabel && CARGO_BOTH.test(label)) {
      pendingCargo = true;
      if (inlineVal) assignCargo(inlineVal);
      continue;
    }

    if (hasLabel) {
      pendingCargo = false;
      const key = matchLabel(label)!;
      if (inlineVal) {
        out[key] = key === "sku" ? normSku(inlineVal) : inlineVal;
      } else {
        // value is on following line(s) until the next recognised label
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
      continue;
    }

    // unlabeled line
    if (pendingCargo) {
      assignCargo(line);
      if (out.cargoVolume && out.cargoWeight) pendingCargo = false;
    }
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
