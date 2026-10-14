import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Captures review screenshots with MOCKED Gemini output (model name "mock-gemini").
// System light/dark is emulated with Playwright's colorScheme, i.e. the OS preference.
// SCREENSHOT_PREFIX=before|after selects the file prefix.

const prefix = process.env.SCREENSHOT_PREFIX ?? "after";
const outDir = path.resolve(__dirname, "../../docs/screenshots");
mkdirSync(outDir, { recursive: true });

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(outDir, `${prefix}-${name}.jpg`), type: "jpeg", quality: 80, fullPage });
}

async function populate(page: Page) {
  await page.getByRole("button", { name: "Catch me up" }).click();
  await expect(page.getByTestId("recap")).toContainText("mock-gemini");
  await page.getByRole("button", { name: "How many extras have been conceded?" }).click();
  await expect(page.getByTestId("qa-item").first()).toContainText("mock-gemini");
  await page.getByTestId("recap").locator("[data-evidence-chip]").first().click();
  await page.waitForTimeout(400);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`system ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`desktop 1366x768 ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto("/");
      await shot(page, `desktop-1366-${scheme}`);
      await shot(page, `desktop-1366-${scheme}-full`, true);
      await populate(page);
      await shot(page, `desktop-1366-${scheme}-populated-full`, true);
    });

    test(`fallback state ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto("/");
      await page.getByLabel("Your question about the match").fill("mock:quota What is the score?");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await expect(page.getByTestId("qa-item").first()).toContainText("Rule-based fallback");
      await page.getByTestId("qa-item").first().scrollIntoViewIfNeeded();
      await shot(page, `desktop-1366-${scheme}-fallback`);
    });

    test(`mobile 390x844 ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await shot(page, `mobile-390-${scheme}`);
      await shot(page, `mobile-390-${scheme}-full`, true);
      await populate(page);
      await shot(page, `mobile-390-${scheme}-populated-full`, true);
    });

    for (const [w, h] of [
      [1440, 900],
      [768, 1024],
      [320, 640],
    ]) {
      test(`viewport ${w}x${h} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto("/");
        await shot(page, `viewport-${w}-${scheme}`);
      });
    }
  });
}
