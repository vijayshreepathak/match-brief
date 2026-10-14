import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// REAL Gemini through the full app: browser -> route handler -> server context ->
// provider -> parsing -> guards -> response metadata -> UI. One run, no retries.

const shots = path.resolve(__dirname, "../../reports");

async function settled(item: Locator) {
  await expect(item.getByText(/Gemini · |Rule-based fallback/).first()).toBeVisible({ timeout: 60_000 });
}

async function ask(page: Page, question: string) {
  await page.getByLabel("Your question about the match").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const item = page.getByTestId("qa-item").first();
  await settled(item);
  return item;
}

test("real Gemini: catch-up and contextual questions are accepted Gemini answers", async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.goto("/");

  const started = Date.now();
  await page.getByRole("button", { name: "Catch me up" }).click();
  const recap = page.getByTestId("recap");
  await settled(recap);
  console.log(`catch-up settled in ${Date.now() - started} ms`);
  await page.screenshot({ path: path.join(shots, "real-gemini-catchup.png"), fullPage: true });
  await expect(recap).not.toContainText("Rule-based fallback");
  await expect(recap.getByText(/^Gemini · /).first()).toBeVisible();
  await expect(recap.getByTestId("as-of")).toHaveText("As of 18.0 ov · 129/4 · since 10.0 ov · 45/4");
  await expect(recap.locator("[data-fact-statement]").first()).toBeVisible();

  // An evidence chip opens the item it refers to.
  const chip = recap.locator("[data-evidence-chip]").first();
  const id = await chip.getAttribute("data-evidence-chip");
  await chip.click();
  await expect(recap.locator(`[data-evidence-item="${id}"]`)).toHaveAttribute("aria-current", "true");

  await page.waitForTimeout(4_500); // stay under free-tier per-minute limits
  const answerStart = Date.now();
  const extras = await ask(page, "How many extras have been conceded?");
  console.log(`question settled in ${Date.now() - answerStart} ms`);
  await expect(extras).not.toContainText("Rule-based fallback");
  await expect(extras.getByText(/^Gemini · /).first()).toBeVisible();
  await expect(extras.getByTestId("answer-status")).toHaveText("Answered from match data");
  await expect(extras.locator('[data-fact-statement="F_EXTRAS"]')).toContainText("5 (wides 4");

  await page.waitForTimeout(4_500);
  // Unavailable information should be an honest Gemini "not in the data", not a guess.
  const injury = await ask(page, "Is Hardik Pandya injured?");
  console.log(`unavailable-info answer: ${await injury.getByTestId("answer-text").innerText()}`);
  await page.screenshot({ path: path.join(shots, "real-gemini-questions.png"), fullPage: true });
  await expect(injury).not.toContainText("Rule-based fallback");
  await expect(injury.getByTestId("answer-status")).toHaveText(/Not in the match data|Declined/);
});
