/**
 * Vargov®Design — web app.
 *
 *   npm run serve   →   http://localhost:8815
 *
 * Paste the composition data block into the page, press "Сгенерировать PDF",
 * and get the finished premium proposal back (inline preview + download).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { BRAND_DIR, FONTS_DIR, TEMPLATES_DIR } from "./config.js";
import { parseBlock } from "./parse.js";
import { generateProposal } from "./pipeline.js";

const PORT = Number(process.env.PORT ?? 8815);
const HOST = process.env.HOST ?? "0.0.0.0"; // listen on all interfaces so phones on the LAN can reach it

/** Local network IPv4 addresses, for the "open on your phone" hint. */
function lanIps(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) out.push(i.address);
    }
  }
  return out;
}
const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(TEMPLATES_DIR, "webapp.html"));
});

app.get("/logo.svg", (_req, res) => {
  res.type("image/svg+xml").sendFile(path.join(BRAND_DIR, "logo_gold.svg"));
});

app.use("/fonts", express.static(FONTS_DIR, { maxAge: "7d", immutable: true }));

// Playwright launches are heavy — serialize generation so concurrent requests
// don't fight over the browser and the per-SKU cache.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

app.post("/generate", async (req, res) => {
  const { data, refresh } = req.body ?? {};
  if (typeof data !== "string" || !data.trim()) {
    return res.status(400).json({ error: "Пустые данные. Вставьте параметры композиции." });
  }

  let input;
  try {
    input = parseBlock(data);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  try {
    const result = await serialize(() =>
      generateProposal(input, { refresh: Boolean(refresh), log: (m) => console.log(`[${input.sku}] ${m}`) }),
    );
    const buffer = fs.readFileSync(result.file);
    const filename = path.basename(result.file);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader(
      "X-Proposal-Info",
      encodeURIComponent(`${result.title} · фото ${result.photos} · видео ${result.videos}`),
    );
    return res.send(buffer);
  } catch (e) {
    console.error("generate failed:", e);
    return res.status(500).json({ error: `Не удалось собрать PDF: ${(e as Error).message}` });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n  VARGOV®DESIGN — веб-генератор КП`);
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  for (const ip of lanIps()) console.log(`  С телефона (Wi-Fi):  http://${ip}:${PORT}`);
  console.log("");
});
