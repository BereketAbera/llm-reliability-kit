import { expect, test } from "@playwright/test";

for (const path of ["/", "/burst", "/ask", "/eval", "/monitoring", "/how-it-works"]) {
  test(`no horizontal page scroll on a phone: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByText("Sample by Bereket A. · fictional data")).toBeVisible();
  });
}
