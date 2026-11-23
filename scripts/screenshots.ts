/**
 * pnpm screenshots <baseUrl> <outDir>
 * Desktop shots at 1440x900, the phone shot full page at 390x844.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:3203").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] ?? "screens");
const prefix = "llm-reliability-kit";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function runBurst(page: Page) {
  await page.getByRole("button", { name: "Run live" }).click();
  await page.getByText(/^Done\. Naive answered/).waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(400);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await desktop.newPage();
  const file = (name: string) => path.join(outDir, `${prefix}-${name}.png`);

  await page.goto(`${base}/burst`);
  await settle(page);
  await runBurst(page);
  await page.locator("#why-title").evaluate((el) => {
    const card = el.closest("section") ?? el;
    window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 76);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: file("burst-desktop") });

  await page.goto(`${base}/ask`);
  await settle(page);
  await page.getByLabel("What is happening on your call?").fill("They told me there's no budget for this until next year");
  await page.getByRole("button", { name: "Ask the coach" }).click();
  await page.getByText("Contains", { exact: false }).first().waitFor({ state: "detached", timeout: 1 }).catch(() => undefined);
  await page.getByRole("button", { name: "Want to know why this works?" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file("ask-desktop") });

  await page.goto(`${base}/eval`);
  await settle(page);
  await page.screenshot({ path: file("eval-desktop") });

  await page.goto(`${base}/monitoring`);
  await settle(page);
  await page.screenshot({ path: file("monitoring-desktop") });

  await page.goto(`${base}/how-it-works`);
  await settle(page);
  await page.screenshot({ path: file("how-desktop") });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const mobile = await phone.newPage();
  await mobile.goto(`${base}/burst`);
  await settle(mobile);
  await runBurst(mobile);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({ path: file("burst-phone"), fullPage: true });

  await browser.close();
  console.log(`Saved to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
