import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// REAL OpenAI through the full app: browser -> route handler -> server context ->
// provider -> parsing -> guards -> response metadata -> UI. One run, no retries.

const shots = path.resolve(__dirname, "../../reports");

async function settled(item: Locator) {
  await expect(item.getByText(/AI · |Rule-based fallback/).first()).toBeVisible({ timeout: 60_000 });
}

async function ask(page: Page, question: string) {
  await page.getByLabel("Your question about the match").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const item = page.getByTestId("qa-item").first();
  await settled(item);
  return item;
}

test("real AI: catch-up and a contextual question are accepted AI responses", async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.goto("/");

  const started = Date.now();
  await page.getByRole("button", { name: "Catch me up" }).click();
  const recap = page.getByTestId("recap");
  await settled(recap);
  console.log(`catch-up settled in ${Date.now() - started} ms: ${await recap.locator("span").first().innerText()}`);
  await page.screenshot({ path: path.join(shots, "real-ai-catchup.png"), fullPage: true });
  await expect(recap).not.toContainText("Rule-based fallback");
  await expect(recap.locator("[data-fact-statement]").first()).toBeVisible();

  const answerStart = Date.now();
  const extras = await ask(page, "How many extras have been conceded?");
  console.log(`question settled in ${Date.now() - answerStart} ms: ${await extras.innerText()}`);
  await expect(extras).not.toContainText("Rule-based fallback");
  await expect(extras.getByTestId("answer-status")).toHaveText("Answered from match data");

  // Unavailable information should be an honest AI "not in the data", not a guess.
  const injury = await ask(page, "Is Hardik Pandya injured?");
  console.log(`unavailable-info answer: ${await injury.innerText()}`);
  await page.screenshot({ path: path.join(shots, "real-ai-questions.png"), fullPage: true });
  await expect(injury.getByTestId("answer-status")).toHaveText(/Not in the match data|Declined/);
});
