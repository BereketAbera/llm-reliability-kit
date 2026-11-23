// Renders design/out/og.svg to src/app/opengraph-image.png in Chromium, set in the site's Geist.
// Geist is the latin woff2 that next/font writes to .next/static/media during `pnpm build`,
// so nothing is downloaded. Exits 3 when no build is there; build.sh then falls back to Inkscape.
// Run from the repo root: node design/og-render.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "design/out/og.svg");
const target = path.join(root, "src/app/opengraph-image.png");

function cssFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/** The @font-face rule next/font writes for Geist's latin subset, as a file under .next. */
function geistLatin() {
  for (const file of cssFiles(path.join(root, ".next/static/css"))) {
    for (const rule of readFileSync(file, "utf8").match(/@font-face\s*{[^}]*}/g) ?? []) {
      const family = /font-family:\s*['"]?Geist['"]?\s*;/.test(rule);
      const latin = /unicode-range:\s*U\+(0000-00FF|00\?\?)/i.test(rule);
      const url = rule.match(/url\(\s*['"]?\/_next\/([^)'"]+)['"]?\s*\)/)?.[1];
      if (family && latin && url && existsSync(path.join(root, ".next", url))) return path.join(root, ".next", url);
    }
  }
  return null;
}

const font = geistLatin();
if (!font) {
  console.error("og-render: no Geist in .next (run pnpm build first)");
  process.exit(3);
}

const face = `@font-face{font-family:Geist;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(font).toString("base64")}) format("woff2")}`;
const html = `<!doctype html><meta charset="utf-8"><style>${face}html,body{margin:0}svg{display:block}</style>${readFileSync(source, "utf8")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  const loaded = await page.evaluate(async () => {
    await Promise.all(["400", "500", "600", "700"].map((weight) => document.fonts.load(`${weight} 30px Geist`)));
    await document.fonts.ready;
    return document.fonts.check("600 30px Geist");
  });
  if (!loaded) throw new Error("Geist did not load");
  await page.screenshot({ path: target });
  console.log(`og-render: ${path.relative(root, target)} in Geist (${path.basename(font)})`);
} finally {
  await browser.close();
}
