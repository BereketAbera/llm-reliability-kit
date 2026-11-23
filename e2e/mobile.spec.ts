import { expect, test, type Page } from "@playwright/test";

async function noSideScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(0);
}

for (const path of ["/", "/burst", "/ask", "/eval", "/monitoring", "/how-it-works", "/handover"]) {
  test(`no horizontal page scroll on a phone: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await noSideScroll(page, path);
    await expect(page.getByText("Sample by Bereket A. · fictional data")).toBeVisible();
  });
}

test("ask: answers appear in view and never widen the page", async ({ page }) => {
  await page.goto("/ask");
  for (const [chip, expected] of [
    [/What should I say when I get their voicemail\?/, /I have one question about/],
    [/What's the best CRM for a small team\?/, /I don't have an approved line/],
    [/How do I close a sale\?/, /Which situation is it\?/],
    [/They say our price is too high/, /That's fair to raise/],
  ] as const) {
    await page.getByRole("button", { name: chip }).click();
    await expect(page.locator("#answer").getByText(expected).first()).toBeVisible();
    await noSideScroll(page, String(chip));
    const top = await page.locator("#answer").evaluate((node) => node.getBoundingClientRect().top);
    expect(top, `answer in view after ${chip}`).toBeLessThan(844);
  }
});

test("ask: a very long word in the question does not widen the page", async ({ page }) => {
  await page.goto("/ask");
  await page.getByLabel("What is happening on your call?").fill(`Prospect said: ${"objection".repeat(40)}`);
  await page.getByRole("button", { name: "Ask the coach" }).click();
  await expect(page.locator("#answer").getByText(/I don't have an approved line/)).toBeVisible();
  await noSideScroll(page, "long word");
});

test("monitoring: runs from this browser do not widen the page", async ({ page }) => {
  await page.goto("/monitoring");
  await page.evaluate(() => {
    const at = new Date().toISOString();
    const runs = [
      { at, kind: "burst", label: "Burst: 6 reps, 14,500-token prompts and a long label that keeps going", total: 18, failed: 9, harshFailures: 5, detail: "today 1/6, retry queue 2/6, smaller prompts 6/6" },
      { at, kind: "ask", label: "What should I say when I get their voicemail and they never call back at all?", total: 1, failed: 0, detail: "Retrieval · OPN-3.2" },
      { at, kind: "flag", label: "How do I bake a cake?", total: 1, failed: 0, detail: "Flagged for the trainer" },
    ];
    window.localStorage.setItem("coach-reliability-kit:runs", JSON.stringify(runs));
  });
  await page.reload();
  await expect(page.getByText("Trainer's review queue")).toBeVisible();
  await noSideScroll(page, "monitoring with runs");
});

test("the menu opens the pages on a phone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Pages" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "30-question test" }).click();
  await expect(page).toHaveURL(/\/eval$/);
  await expect(page.getByRole("heading", { level: 1, name: "The 30-question test" })).toBeVisible();
});
