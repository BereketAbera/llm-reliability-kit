import { expect, test } from "@playwright/test";

test.describe("pages", () => {
  test("home links to every page and carries the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Coach reliability kit" })).toBeVisible();
    await expect(page.getByText("Sample by Bereket A. · fictional data")).toBeVisible();
    await expect(page.getByText("Simulated provider: no real model calls").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your first milestone/ })).toBeVisible();
    for (const [name, path] of [
      ["Fixing the 429s", "/burst"],
      ["Ask the coach", "/ask"],
      ["30-question test", "/eval"],
      ["Monitoring", "/monitoring"],
      ["How it works", "/how-it-works"],
    ] as const) {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("skip link is the first stop for keyboard users", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("home links the screening answers to the right sections", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "What I would check first" }).click();
    await expect(page).toHaveURL(/\/how-it-works#check-first$/);
    await page.goto("/");
    await page.getByRole("link", { name: "How the exact lines are kept" }).click();
    await expect(page).toHaveURL(/\/how-it-works#exact-lines$/);
  });

  test("how it works shows code read from the source, one click away", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { name: "What to check first for the 429s" })).toBeVisible();
    await expect(page.getByText(/Replit.s AI integration/).first()).toBeVisible();
    await expect(page.getByText("export function fullJitterDelay(")).toBeHidden();
    await page.getByText("Show the code: backoff with full jitter").click();
    await expect(page.getByText("export function fullJitterDelay(")).toBeVisible();
    await page.getByText("Show the SQL: db/schema.sql").click();
    await expect(page.getByText("create unique index one_current_version")).toBeVisible();
  });

  test("handover notes and a friendly 404", async ({ page }) => {
    await page.goto("/handover");
    await expect(page.getByRole("heading", { name: "How to add or approve a document" })).toBeVisible();
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See the 429 fix" })).toBeVisible();
  });

  test("pages and API routes send security headers", async ({ request }) => {
    for (const path of ["/", "/api/ask?q=hello"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["x-frame-options"], path).toBe("DENY");
    }
  });
});

test.describe("fixing the 429s", () => {
  test("runs the three clients live and shows the harsh error only for today's client", async ({ page }) => {
    await page.goto("/burst");
    await page.getByRole("button", { name: "Run live" }).click();
    await expect(page.getByText(/^Done\. Today's client answered 2 of 3; with the retry queue 3 of 3; with smaller prompts 3 of 3\.$/)).toBeAttached({ timeout: 45_000 });

    const table = page.getByRole("table", { name: "Results for each client" });
    await expect(table.getByRole("row", { name: /no retry/ })).toContainText("2/3");
    await expect(table.getByRole("row", { name: /With retry queue/ })).toContainText("3/3");
    await expect(page.getByText(/removes the errors but not the wait/)).toBeVisible();

    const naive = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /no retry/ }) });
    await expect(naive.getByText("The coaching response could not finish")).toBeVisible();
    const resilient = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /With retry queue/ }) });
    await expect(resilient.getByText("The coaching response could not finish")).toHaveCount(0);
  });

  test("sliders are named and keyboard operable, and stale results say so", async ({ page }) => {
    await page.goto("/burst");
    const reps = page.getByRole("slider", { name: "Reps asking at once" });
    await expect(reps).toHaveAttribute("aria-valuenow", "3");
    await reps.focus();
    await page.keyboard.press("ArrowRight");
    await expect(reps).toHaveAttribute("aria-valuenow", "4");
    await expect(page.getByText("Settings changed.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Why requests fail \(previous settings\)/ })).toBeVisible();
  });

  test("shared-key preset: the retry queue fails calmly and promises nothing it does not do", async ({ page }) => {
    await page.goto("/burst");
    await page.getByRole("button", { name: "Shared key, busy hour" }).click();
    await expect(page.getByText(/^Done\. Today's client answered 1 of 6/)).toBeAttached({ timeout: 45_000 });
    const resilient = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /With retry queue/ }) });
    await expect(resilient.getByText(/Lots of reps are asking right now\. Tap Try again/).first()).toBeVisible();
    await expect(resilient.getByText(/saved|will retry/)).toHaveCount(0);
    const trimmed = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /smaller prompts/ }) });
    await expect(trimmed.getByText("6 of 6 answered", { exact: false })).toBeVisible();
  });

  test("Stop leaves nothing spinning", async ({ page }) => {
    await page.goto("/burst");
    await page.getByRole("button", { name: "Run live" }).click();
    await page.getByRole("button", { name: "Stop" }).click();
    const table = page.getByRole("table", { name: "Results for each client" });
    await expect(table.getByText("Running…")).toHaveCount(0);
    await expect(table.getByText("Stopped").first()).toBeVisible();
    await expect(page.getByText("Stopped. The panels show how far each client got.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run live" })).toBeEnabled();
  });

  test("a dropped connection is shown, with a way to run again", async ({ page }) => {
    await page.route("**/api/burst?variant=trimmed*", (route) => route.abort());
    await page.goto("/burst");
    await page.getByRole("button", { name: "Run live" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The simulation stopped before it finished" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Results for each client" }).getByText("Running…")).toHaveCount(0);
    await expect(page.getByText("Didn't finish").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
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
    await expect(page.getByRole("button", { name: "Hide why it works" })).toBeVisible();
  });

  test("retrieval returns the exact source line, and the guard catches a paraphrase", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("switch", { name: "Simulate a model that rewrites retrieved lines" }).click();
    await page.getByRole("button", { name: /What should I say when I get their voicemail\?/ }).click();
    await expect(page.getByText("Retrieval", { exact: true })).toBeVisible();
    await expect(page.locator("blockquote")).toContainText("I have one question about [area] that should take two minutes.");
    await expect(page.getByText("Verbatim check: paraphrase caught, approved line restored")).toBeVisible();
    await expect(page.getByText("Fill in the bracketed parts.")).toBeVisible();
  });

  test("asks which situation when two fit, then answers with the one picked", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: /How do I close a sale\?/ }).click();
    await expect(page.getByText("Two approved lines could fit. Which situation is it?")).toBeVisible();
    await page.getByRole("group", { name: "Which situation is it?" }).getByRole("button", { name: /Asking for the decision/ }).click();
    await expect(page.locator("blockquote")).toHaveText(/^It sounds like this solves the problem you described\./);
    await expect(page.getByText("picked by the rep", { exact: false })).toBeVisible();
  });

  test("declines what the material does not cover, and the question can be flagged", async ({ page }) => {
    await page.goto("/ask");
    await page.getByLabel("What is happening on your call?").fill("How do I bake a cake?");
    await page.getByRole("button", { name: "Ask the coach" }).click();
    await expect(page.getByText("I don't have an approved line for that yet", { exact: false })).toBeVisible();
    await expect(page.getByText("Typos fixed", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: "Flag for the trainer" }).click();
    await expect(page.getByText(/Flagged: it now appears in the trainer's review queue/)).toBeVisible();
    await page.goto("/monitoring");
    await expect(page.getByText("Trainer's review queue")).toBeVisible();
    await expect(page.getByRole("region", { name: "Runs from this browser" }).getByText("How do I bake a cake?").first()).toBeVisible();
  });

  test("a stream cut off mid-answer never shows a partial line as the answer", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: 'event: route\ndata: {"path":"answer-bank","bank":{"id":"AB-02"}}\n\nevent: delta\ndata: {"text":"That helps, thank you. "}\n\nevent: delta\ndata: {"text":"When is',
      }),
    );
    await page.goto("/ask");
    await page.getByLabel("What is happening on your call?").fill("They have no budget");
    await page.getByRole("button", { name: "Ask the coach" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The answer was interrupted. Tap Try again." })).toBeVisible();
    await expect(page.locator("blockquote")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("a busy server gets one quiet retry, then a calm message without status codes", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/ask", (route) => {
      calls++;
      return route.fulfill({ status: 503, body: "busy" });
    });
    await page.goto("/ask");
    await page.getByLabel("What is happening on your call?").fill("They have no budget");
    await page.getByRole("button", { name: "Ask the coach" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "The coach didn't answer this time. Your question is still here." });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText("503");
    expect(calls).toBe(2);
    await expect(page.getByLabel("What is happening on your call?")).toHaveValue("They have no budget");
  });
});

test.describe("the 30-question test", () => {
  test("shows 28/30, filters the rows, and blocks a bad change", async ({ page }) => {
    await page.goto("/eval");
    await expect(page.getByText("Gate: publish allowed")).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.locator("tbody tr")).toHaveCount(30);
    await page.getByRole("group", { name: "Filter questions" }).getByRole("button", { name: /Off method/ }).click();
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await page.getByRole("group", { name: "Question set" }).getByRole("button", { name: "Should be declined" }).click();
    await expect(table.locator("tbody tr")).toHaveCount(21);
    await page.getByRole("button", { name: "Try a bad change" }).click();
    await expect(page.getByText(/^Gate: publish blocked\./)).toBeVisible();
    await expect(page.getByText(/^Dropped from 28 to \d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Re-run now" }).click();
    await expect(page.getByText("Gate: publish allowed")).toBeVisible();
    await expect(page.getByText("Same or better than the last approved score (28)")).toBeVisible();
  });

  test("a failed re-run keeps the last good scores and offers a retry", async ({ page }) => {
    await page.route("**/api/eval*", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/eval");
    await page.getByRole("button", { name: "Re-run now" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Re-run didn't finish. The scores shown are from the last good run." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("Gate: publish allowed")).toBeVisible();
  });
});

test.describe("monitoring", () => {
  test("shows the error-rate chart, alerts and this browser's runs", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: /She needs to run it by her boss first/ }).click();
    await expect(page.locator("blockquote")).toHaveText(/^That makes sense\. When you bring this to your manager/);
    // The run is recorded when the full answer arrives, which is also when the follow-up offer appears.
    await expect(page.getByRole("button", { name: "Want to know why this works?" })).toBeVisible();
    await page.goto("/monitoring");
    await expect(page.getByRole("img", { name: "Error rate over the simulated day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alerts", exact: true })).toBeVisible();
    await expect(page.getByText(/unanswered questions in 5 minutes/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Runs from this browser" }).getByText("She needs to run it by her boss first")).toBeVisible();
  });

  test("a damaged browser-storage entry cannot break the page", async ({ page }) => {
    await page.goto("/monitoring");
    await page.evaluate(() => window.localStorage.setItem("coach-reliability-kit:runs", "[null, 3, {\"at\":\"x\"}]"));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Monitoring" })).toBeVisible();
    await expect(page.getByText("Nothing yet.", { exact: false })).toBeVisible();
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

  test("ask rejects a null body with a 400", async ({ request }) => {
    const response = await request.post("/api/ask", { headers: { "content-type": "application/json" }, data: "null" });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "Send JSON: { question }" });
  });
});
