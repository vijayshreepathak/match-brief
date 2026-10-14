import { expect, test } from "@playwright/test";

// The same app with no GEMINI_API_KEY: everything still works, and nothing pretends to be AI.

test("without an API key, recaps and answers are labelled rule-based fallbacks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Catch me up" }).click();
  const recap = page.getByTestId("recap");
  await expect(recap).toContainText("Rule-based fallback");
  await expect(recap).toContainText("AI is not configured on this server");
  await expect(recap).toContainText("What the numbers say");
  await expect(recap).toContainText("India need 31 off 12 balls (15.50 per over) with 6 wickets in hand.");
  await expect(recap).not.toContainText("Gemini ·");

  await page.getByRole("button", { name: "Who will win?" }).click();
  const item = page.getByTestId("qa-item").first();
  await expect(item).toContainText("Rule-based fallback");
  await expect(item.getByTestId("answer-status")).toHaveText("Declined");
  await expect(item.getByTestId("answer-text")).not.toContainText("won by");
});

test("an unsupported question is answered honestly by the fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your question about the match").fill("Is Hardik Pandya injured?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const item = page.getByTestId("qa-item").first();
  await expect(item.getByTestId("answer-status")).toHaveText("Not in the match data");
  await expect(item.getByTestId("answer-text")).toContainText("not available in the supplied match data");
});
