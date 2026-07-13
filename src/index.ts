/**
 * Vargov®Design — Commercial Proposal Generator (CLI)
 *
 *   npm run proposal
 *
 * Asks for the commercial parameters, pulls everything else about the
 * composition from vargov.ru automatically, and assembles a premium
 * catalog-grade PDF into ./output.
 *
 * For the web app (paste a data block, get a PDF): `npm run serve`.
 */
import fs from "node:fs";
import { collectInput } from "./cli.js";
import { generateProposal } from "./pipeline.js";

async function main(): Promise<void> {
  console.log("\n  VARGOV®DESIGN — генератор коммерческих предложений\n");

  const { input, refresh } = await collectInput(process.argv.slice(2));

  console.log(`\n▸ Обработка ${input.sku}…`);
  const res = await generateProposal(input, {
    refresh,
    log: (m) => console.log(`  ${m}`),
  });

  const sizeMb = (fs.statSync(res.file).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Готово: ${res.file} (${sizeMb} МБ)\n`);
}

main().catch((err) => {
  console.error(`\n✗ Ошибка: ${(err as Error).message}\n`);
  process.exit(1);
});
