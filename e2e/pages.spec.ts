import { expect, test } from "@playwright/test";

test.describe("pages", () => {
  test("home links to every page and carries the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Coach reliability kit" })).toBeVisible();
    await expect(page.getByText("Sample by Bereket A. · fictional data")).toBeVisible();
    await expect(page.getByText("Simulated provider: no real model calls").first()).toBeVisible();
    for (const [name, path] of [
      ["Burst lab", "/burst"],
      ["Ask the coach", "/ask"],
      ["Eval gate", "/eval"],
      ["Monitoring", "/monitoring"],
      ["How it works", "/how-it-works"],
    ] as const) {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("skip link is the first stop for keyboard users", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("how it works shows code read from the source", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { name: "What to check first for the 429s" })).toBeVisible();
    await expect(page.getByText("export function fullJitterDelay(")).toBeVisible();
    await expect(page.getByText("export function answerQuestion(")).toBeVisible();
  });
});

test.describe("burst lab", () => {
  test("runs the three clients live and shows the harsh error only for the naive one", async ({ page }) => {
    await page.goto("/burst");
    await page.getByRole("button", { name: "Run live" }).click();
    await expect(page.getByText(/^Done\. Naive answered 2 of 3; resilient 3 of 3; trimmed 3 of 3\.$/)).toBeAttached({ timeout: 45_000 });

    const table = page.getByRole("table", { name: "Results for each client" });
    await expect(table.getByRole("row", { name: /Naive client/ })).toContainText("2/3");
    await expect(table.getByRole("row", { name: /^Resilient client/ })).toContainText("3/3");

    const naive = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /Naive client/ }) });
    await expect(naive.getByText("The coaching response could not finish")).toBeVisible();
    const resilient = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /^Resilient client/ }) });
    await expect(resilient.getByText("The coaching response could not finish")).toHaveCount(0);
  });

  test("shared-key preset shows retries and calm busy messages", async ({ page }) => {
    await page.goto("/burst");
    await page.getByRole("button", { name: "Shared key, busy hour" }).click();
    await expect(page.getByText(/^Done\. Naive answered 1 of 6/)).toBeAttached({ timeout: 45_000 });
    const resilient = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /^Resilient client/ }) });
    await expect(resilient.getByText(/Lots of reps are asking right now/).first()).toBeVisible();
    const trimmed = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /trimmed context/ }) });
    await expect(trimmed.getByText("6 of 6 answered", { exact: false })).toBeVisible();
  });
});

test.describe("ask the coach", () => {
  test("answer bank returns the approved line verbatim and offers why it works", async ({ page }) => {
    await page.goto("/ask");
    await page.getByLabel("What is happening on your call?").fill("They told me there's no budget for this");
    await page.getByRole("button", { name: "Ask the coach" }).click();
    await expect(page.getByText("Answer bank · AB-02")).toBeVisible();
    await expect(page.locator("blockquote")).toHaveText("That helps, thank you. When is the next budget set, and who decides what goes on the list?");
    await page.getByRole("button", { name: "Want to know why this works?" }).click();
    await expect(page.getByText("No budget is a timing fact, not a no.", { exact: false })).toBeVisible();
  });

  test("retrieval returns the exact source line, and the guard catches a paraphrase", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("switch", { name: "Simulate a model that rewrites retrieved lines" }).click();
    await page.getByRole("button", { name: /What should I say when I get their voicemail\?/ }).click();
    await expect(page.getByText("Retrieval", { exact: true })).toBeVisible();
    await expect(page.locator("blockquote")).toContainText("I have one question about [area] that should take two minutes.");
    await expect(page.getByText("Verbatim check: paraphrase caught, approved line restored")).toBeVisible();
    await expect(page.getByText("OPN-3.2").first()).toBeVisible();
  });

  test("declines questions the material does not cover", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: /What's the best CRM for a small team\?/ }).click();
    await expect(page.getByText("I don't have an approved line for that yet", { exact: false })).toBeVisible();
    await expect(page.getByText("No approved line", { exact: true })).toBeVisible();
  });
});

test.describe("eval gate", () => {
  test("shows 28/30, the 30 rows, and blocks a bad change", async ({ page }) => {
    await page.goto("/eval");
    await expect(page.getByText("Gate: publish allowed")).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
    await page.getByRole("tab", { name: /Off method/ }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
    await page.getByRole("button", { name: "Try a bad change" }).click();
    await expect(page.getByText(/^Gate: publish blocked\./)).toBeVisible();
    await page.getByRole("button", { name: "Re-run now" }).click();
    await expect(page.getByText("Gate: publish allowed")).toBeVisible();
  });
});

test.describe("monitoring", () => {
  test("shows the error-rate chart, alerts and this browser's runs", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: /She needs to run it by her boss first/ }).click();
    await expect(page.locator("blockquote")).toHaveText(/^That makes sense\. When you bring this to your manager/);
    await expect(page.getByRole("button", { name: "Want to know why this works?" })).toBeVisible();
    await page.goto("/monitoring");
    await expect(page.getByRole("img", { name: "Error rate over the simulated day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alerts", exact: true })).toBeVisible();
    await expect(page.getByText(/failed answers in 5 minutes/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Runs from this browser" }).getByText("She needs to run it by her boss first")).toBeVisible();
  });
});

test.describe("API", () => {
  test("burst stream ends a naive failure with a clean SSE error event", async ({ request }) => {
    const response = await request.get("/api/burst?variant=naive&speed=200");
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: error");
    expect(text).toContain('"userMessage":"The coaching response could not finish"');
  });

  test("ask JSON endpoint is what the eval runner calls", async ({ request }) => {
    const response = await request.get(`/api/ask?q=${encodeURIComponent("Email to confirm tomorrow's meeting.")}`);
    const answer = (await response.json()) as { path: string; quote: { lineId: string } };
    expect(answer.path).toBe("retrieval");
    expect(answer.quote.lineId).toBe("EML-8.2");
  });
});
