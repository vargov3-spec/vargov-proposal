import { chromium } from "playwright";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const b = await chromium.launch({ headless: true });

async function fetchHome() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const p = await b.newPage({ userAgent: UA });
    let raw = "";
    p.on("response", async (r) => { try { if (r.request().resourceType() === "document" && !raw) raw = await r.text(); } catch {} });
    try {
      await p.goto("https://vargov.ru/", { waitUntil: "commit", timeout: 40000 });
      await p.waitForTimeout(6000);
      const rendered = await p.content();
      await p.close();
      if (raw.length > 5000 || rendered.length > 5000) return { raw, rendered };
    } catch (e) {
      await p.close().catch(() => {});
      console.log(`  attempt ${attempt} failed: ${e.message.split("\n")[0].slice(0, 60)}`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  return { raw: "", rendered: "" };
}

const { raw, rendered } = await fetchHome();
await b.close();
console.log("raw length:", raw.length, "| rendered length:", rendered.length);

const src = raw || rendered;
if (!src) { console.log("COULD NOT LOAD vargov.ru"); process.exit(0); }

// current parser regexes from rate.ts
const re1 = /внутренн[\s\S]{0,400}?<strong[^>]*>\s*USD\s*([\d]+[.,]?\d*)/i;
const re2 = /USD\s*([\d]+[.,]\d{1,2})\s*<\/strong>/i;
console.log("RAW  re1 →", (raw.match(re1) || [])[1] ?? "NO MATCH");
console.log("RAW  re2 →", (raw.match(re2) || [])[1] ?? "NO MATCH");
console.log("REND re1 →", (rendered.match(re1) || [])[1] ?? "NO MATCH");

// what does the page actually say near "курс"?
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
for (const [name, html] of [["RAW", raw], ["RENDERED", rendered]]) {
  if (!html) continue;
  const t = strip(html);
  const hits = [...t.matchAll(/.{0,60}курс.{0,80}/gi)].map((m) => m[0].trim());
  console.log(`--- ${name}: 'курс' contexts (${hits.length}) ---`);
  hits.slice(0, 5).forEach((h) => console.log("   •", h));
  const usd = [...t.matchAll(/USD\s*([\d]+[.,]?\d*)/gi)].map((m) => m[0]);
  console.log(`   USD tokens:`, [...new Set(usd)].slice(0, 8));
}
// dump every <strong> in raw for structure check
console.log("--- RAW <strong> blocks ---");
for (const m of raw.matchAll(/<strong[^>]*>([\s\S]{0,60}?)<\/strong>/gi)) {
  const v = strip(m[1]);
  if (v) console.log("   ", JSON.stringify(v));
}
