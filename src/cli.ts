/**
 * Input collection. Interactive by default (`npm run proposal`), every field
 * can also be passed as a flag for scripted runs:
 *
 *   npm run proposal -- --sku LC0537 --price "44 100 USD" ...
 *
 * Empty answers are allowed — the corresponding PDF rows are simply omitted.
 */
import prompts from "prompts";
import type { CommercialInput } from "./types.js";

const FLAG_MAP: Record<string, keyof CommercialInput> = {
  "--sku": "sku",
  "--composition-size": "compositionSize",
  "--element-size": "elementSize",
  "--element-count": "elementCount",
  "--price": "price",
  "--delivery-cost": "deliveryCost",
  "--production-time": "productionTime",
  "--delivery-time": "deliveryTime",
  "--cargo-volume": "cargoVolume",
  "--cargo-weight": "cargoWeight",
};

export interface CliOptions {
  input: CommercialInput;
  refresh: boolean;
  nonInteractive: boolean;
}

export async function collectInput(argv: string[]): Promise<CliOptions> {
  const partial: Partial<CommercialInput> = {};
  let refresh = false;
  let nonInteractive = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--refresh") refresh = true;
    else if (a === "--no-input") nonInteractive = true;
    else if (FLAG_MAP[a] && argv[i + 1] !== undefined) {
      partial[FLAG_MAP[a]] = argv[++i];
    }
  }

  const ask = async (
    key: keyof CommercialInput,
    message: string,
    initial = "",
  ): Promise<string | undefined> => {
    if (partial[key] !== undefined) return partial[key];
    if (nonInteractive) return undefined;
    const { v } = await prompts(
      { type: "text", name: "v", message, initial },
      { onCancel: () => process.exit(1) },
    );
    return (v as string | undefined)?.trim() || undefined;
  };

  const sku = (await ask("sku", "Артикул композиции (например LC0537):")) ?? "";
  if (!sku) {
    console.error("Артикул обязателен.");
    process.exit(1);
  }

  const input: CommercialInput = {
    sku: sku.toUpperCase(),
    compositionSize: await ask("compositionSize", "Размер композиции (например L8000, W1000 мм):"),
    elementSize: await ask("elementSize", "Размер элементов (например L400, W250 мм):"),
    elementCount: await ask("elementCount", "Количество элементов (например 60 шт.):"),
    price: await ask("price", "Стоимость композиции (например 44 100 USD):"),
    deliveryCost: await ask("deliveryCost", "Стоимость доставки (например 6 000 USD):"),
    productionTime: await ask("productionTime", "Срок производства (например 60–90 рабочих дней):"),
    deliveryTime: await ask("deliveryTime", "Срок поставки (например до 60 календарных дней):"),
    cargoVolume: await ask("cargoVolume", "Объём груза (например 4 м³):"),
    cargoWeight: await ask("cargoWeight", "Вес груза (например 200 кг):"),
  };

  return { input, refresh, nonInteractive };
}
