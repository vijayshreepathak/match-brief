import { expect, test } from "@playwright/test";

// Loading, error and retry states of the redesigned panels (mocked Gemini; failures are
// simulated at the browser's network layer, so no provider is involved).

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("catch-up shows an accessible loading status, then a retryable error", async ({ page }) => {
  let fail = true;
  await page.route("**/api/catchup", async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    if (fail) await route.abort("failed");
    else await route.continue();
  });
  // Scope to the panel: Next.js also renders its own (empty) route-announcer alert.
  const panel = page.getByRole("region", { name: "Catch up" });
  await page.getByRole("button", { name: "Catch me up" }).click();
  await expect(panel.getByRole("status", { name: "Loading recap" })).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("Network error");

  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("recap")).toContainText("Gemini · mock-gemini");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("a failed question shows an error with Retry, and Retry replaces it with the answer", async ({ page }) => {
  let fail = true;
  await page.route("**/api/ask", async (route) => {
    if (fail) await route.abort("failed");
    else await route.continue();
  });
  await page.getByLabel("Your question about the match").fill("What is the score right now?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const item = page.getByTestId("qa-item").first();
  await expect(item.getByRole("alert")).toContainText("Network error");

  fail = false;
  await item.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("qa-item")).toHaveCount(1);
  await expect(page.getByTestId("qa-item").first()).toContainText("Gemini · mock-gemini");
});

test("a question shows a status while it is checked", async ({ page }) => {
  // A unique question, so the server cache can't answer it instantly.
  await page.getByLabel("Your question about the match").fill(`mock:slow Status check ${Date.now()}`);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByTestId("qa-item").first().getByRole("status")).toHaveText("Checking the match data…");
  await expect(page.getByRole("button", { name: "Asking…" })).toBeDisabled();
  await expect(page.getByTestId("qa-item").first().getByTestId("answer-text")).toBeVisible({ timeout: 10_000 });
});

test("the Ask button is disabled until a question is typed, and the counter tracks length", async ({ page }) => {
  const ask = page.getByRole("button", { name: "Ask", exact: true });
  await expect(ask).toBeDisabled();
  await page.getByLabel("Your question about the match").fill("Who is batting?");
  await expect(ask).toBeEnabled();
  await expect(page.locator("#question-count")).toHaveText("15/280");
});

test("replay state is announced as Paused, Playing replay or End of chase, never as live", async ({ page }) => {
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Playing replay", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Next over" }).click();
  await page.getByRole("button", { name: "Next over" }).click();
  await expect(page.getByText("End of chase", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\blive\b/i);
});
