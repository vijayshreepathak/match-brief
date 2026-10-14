import { expect, test, type Page } from "@playwright/test";

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("mobile layout has no horizontal overflow and the core controls work", async ({ page }) => {
  await page.goto("/");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Next ball" }).click();
  await expect(page.getByTestId("replay-position")).toContainText("delivery 111");

  await page.getByRole("button", { name: "Catch me up" }).click();
  const recap = page.getByTestId("recap");
  await expect(recap).toContainText("AI · mock-model");
  await recap.locator('[data-evidence-chip="F_INT_RUNS"]').click();
  await expect(recap.locator('[data-evidence-item="F_INT_RUNS"]')).toBeInViewport();

  await page.getByRole("button", { name: "How many extras have been conceded?" }).click();
  await expect(page.getByTestId("qa-item").first()).toContainText("AI · mock-model");

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
