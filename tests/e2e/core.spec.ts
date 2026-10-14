import { expect, test, type Page } from "@playwright/test";

// Desktop flows against the app with AI pointed at the mock Responses API.

async function ask(page: Page, question: string) {
  await page.getByLabel("Your question about the match").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the replay label, attribution and the default mid-chase checkpoint", async ({ page }) => {
  await expect(page.getByText("Historical match replay — not live data")).toBeVisible();
  await expect(page.getByTestId("score")).toContainText("129/4");
  await expect(page.getByTestId("equation")).toHaveText("Need 31 off 12 balls");
  await expect(page.getByLabel("I last watched until…")).toHaveValue("60");
  await expect(page.getByRole("link", { name: "Cricsheet" }).first()).toBeVisible();
});

test("catch-up shows an AI recap whose evidence chips open the right items", async ({ page }) => {
  await page.getByRole("button", { name: "Catch me up" }).click();
  const recap = page.getByTestId("recap");
  await expect(recap).toContainText("AI · mock-model");
  await expect(recap.getByTestId("as-of")).toHaveText("As of 18.0 ov · 129/4 · since 10.0 ov · 45/4");

  await recap.locator('[data-evidence-chip="F_INT_RUNS"]').click();
  const fact = recap.locator('[data-evidence-item="F_INT_RUNS"]');
  await expect(fact).toBeVisible();
  await expect(fact).toHaveAttribute("aria-current", "true");
  await expect(fact).toContainText("84 (10.50 per over)");

  await recap.locator('[data-evidence-chip="E61"]').click();
  const delivery = recap.locator('[data-evidence-item="E61"]');
  await expect(delivery).toHaveAttribute("aria-current", "true");
  await expect(delivery).toContainText("10.1 · Shadab Khan to HH Pandya");
});

test("a double click sends a single catch-up request", async ({ page }) => {
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/catchup")) requests += 1;
  });
  await page.getByRole("button", { name: "Catch me up" }).dblclick();
  await expect(page.getByTestId("recap")).toContainText("AI · mock-model");
  expect(requests).toBe(1);
});

test("the catch-up button works from the keyboard", async ({ page }) => {
  await page.getByRole("button", { name: "Catch me up" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("recap")).toContainText("Mock recap");
});

test("advancing marks the recap as stale and rewinding clears it", async ({ page }) => {
  await page.getByRole("button", { name: "Catch me up" }).click();
  await expect(page.getByTestId("recap")).toContainText("AI · mock-model");

  await page.getByRole("button", { name: "Next ball" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("delivery 111");
  await expect(page.getByTestId("stale-notice")).toContainText("18.0 ov · 129/4");

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByTestId("score")).toContainText("0/0");
  await expect(page.getByTestId("recap")).toHaveCount(0);
  await expect(page.getByText("Replay rewound: the previous recap was cleared")).toBeVisible();
  await expect(page.getByLabel("I last watched until…")).toHaveValue("0");
});

test("auto-play advances the replay without calling the AI", async ({ page }) => {
  const aiCalls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(catchup|ask)/.test(r.url())) aiCalls.push(r.url());
  });
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("delivery 112", { timeout: 10_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  expect(aiCalls).toEqual([]);
});

test("next over moves a whole over and the replay stops at the end of the chase", async ({ page }) => {
  await page.getByRole("button", { name: "Next over" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("19.0 ov · 144/4");
  await page.getByRole("button", { name: "Next over" }).click();
  await expect(page.getByTestId("equation")).toContainText("India reached the target and won by 4 wickets");
  await expect(page.getByRole("button", { name: "Next ball" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
});

test("a suggested question returns an AI answer tagged with its checkpoint", async ({ page }) => {
  await page.getByRole("button", { name: "What do India need from here?" }).click();
  const item = page.getByTestId("qa-item").first();
  await expect(item).toContainText("AI · mock-model");
  await expect(item.getByTestId("as-of")).toHaveText("As of 18.0 ov · 129/4");
  await item.locator('[data-evidence-chip="F_SCORE"]').click();
  await expect(item.locator('[data-evidence-item="F_SCORE"]')).toContainText("India 129/4 after 18.0 overs");
});

test("a slow answer that arrives after the replay moved keeps its original as-of label", async ({ page }) => {
  await ask(page, "mock:slow What is the score?");
  await page.getByRole("button", { name: "Next ball" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("delivery 111");
  const item = page.getByTestId("qa-item").first();
  await expect(item.getByTestId("answer-text")).toBeVisible({ timeout: 10_000 });
  await expect(item.getByTestId("as-of")).toHaveText("As of 18.0 ov · 129/4");
  await expect(item.getByTestId("stale-notice")).toBeVisible();
});

test("rewinding while an answer is in flight discards it", async ({ page }) => {
  await ask(page, "mock:slow What is the score?");
  await expect(page.getByTestId("qa-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Back 1 over" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("17.0 ov");
  await expect(page.getByTestId("qa-item")).toHaveCount(0);
  await page.waitForTimeout(3_500);
  await expect(page.getByTestId("qa-item")).toHaveCount(0);
});

test("a provider error is shown as a labelled rule-based fallback", async ({ page }) => {
  await ask(page, "mock:provider-error How many extras so far?");
  const item = page.getByTestId("qa-item").first();
  await expect(item).toContainText("Rule-based fallback", { timeout: 15_000 });
  await expect(item).toContainText("The AI provider returned an error.");
  await expect(item).not.toContainText("AI · mock-model");
});

test("an answer citing unknown evidence is rejected in favour of the fallback", async ({ page }) => {
  await ask(page, "mock:bad-evidence What is the score?");
  const item = page.getByTestId("qa-item").first();
  await expect(item).toContainText("Rule-based fallback");
  await expect(item).toContainText("cited evidence that is not part of this checkpoint");
});
