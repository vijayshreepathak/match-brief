import { expect, test, type Page } from "@playwright/test";

// Day/night theme: OS default, one-click switching, persistence, no flash, no state loss,
// and no AI requests caused by theming. Runs against the mocked-Gemini server.

const DAY_BG = "rgb(246, 244, 238)";
const NIGHT_BG = "rgb(11, 15, 20)";

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));

function countRequests(page: Page, pattern: RegExp) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (pattern.test(r.url())) seen.push(r.url());
  });
  return seen;
}

/** Collects console errors, hydration warnings and uncaught page errors. */
function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

test.describe("system light", () => {
  test.use({ colorScheme: "light" });

  test("first visit follows the OS (light) and labels the control to match", async ({ page }) => {
    await page.goto("/");
    expect(await isDark(page)).toBe(false);
    expect(await bodyBackground(page)).toBe(DAY_BG);
    await expect(page.getByRole("button", { name: "Day theme. Switch to night theme" })).toBeVisible();
  });

  test("one click switches to night, a second click back to day, and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    expect(await isDark(page)).toBe(true);
    expect(await bodyBackground(page)).toBe(NIGHT_BG);
    await expect(page.getByRole("button", { name: "Night theme. Switch to day theme" })).toBeVisible();
    // Native controls follow the theme.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");

    await page.reload();
    expect(await isDark(page)).toBe(true); // stored choice beats the light OS preference
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    await page.getByTestId("theme-toggle").click();
    expect(await isDark(page)).toBe(false);
    expect(await bodyBackground(page)).toBe(DAY_BG);
    await page.reload();
    expect(await isDark(page)).toBe(false);
  });

  test("a stored night choice is applied before hydration (no wrong-theme flash)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { classAtDomReady: string }).classAtDomReady = document.documentElement.className;
      });
    });
    await page.goto("/");
    const atDomReady = await page.evaluate(() => (window as unknown as { classAtDomReady: string }).classAtDomReady);
    expect(atDomReady).toContain("dark");
  });

  test("switching theme keeps replay position, last-seen choice, typed question and answers, with no requests", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Next ball" }).click();
    await expect(page.getByTestId("replay-position")).toContainText("delivery 111");
    await page.getByLabel("I last watched until…").selectOption({ label: "End of over 15 · 100/4" });
    await page.getByRole("button", { name: "Catch me up" }).click();
    await expect(page.getByTestId("recap")).toContainText("Gemini · mock-gemini");
    await page.getByLabel("Your question about the match").fill("Half-typed question");

    const apiCalls = countRequests(page, /\/api\//);
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-toggle").click();
    expect(await isDark(page)).toBe(true);

    await expect(page.getByTestId("replay-position")).toContainText("delivery 111");
    await expect(page.getByLabel("I last watched until…")).toHaveValue("90");
    await expect(page.getByLabel("Your question about the match")).toHaveValue("Half-typed question");
    await expect(page.getByTestId("recap")).toContainText("Gemini · mock-gemini");
    await expect(page.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
    expect(apiCalls).toEqual([]); // no replay, catch-up or question requests from theming
  });

  test("page load and theme changes make no AI requests and log no console or hydration errors", async ({ page }) => {
    const problems = collectProblems(page);
    const aiCalls = countRequests(page, /\/api\/(catchup|ask)/);
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-toggle").click();
    await page.getByRole("button", { name: "Next over" }).click();
    await expect(page.getByTestId("replay-position")).toContainText("19.0 ov");
    expect(aiCalls).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe("system dark", () => {
  test.use({ colorScheme: "dark" });

  test("first visit follows the OS (dark)", async ({ page }) => {
    await page.goto("/");
    expect(await isDark(page)).toBe(true);
    expect(await bodyBackground(page)).toBe(NIGHT_BG);
    await expect(page.getByRole("button", { name: "Night theme. Switch to day theme" })).toBeVisible();
  });

  test("first click from the OS dark default switches to day (system is not treated as light)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    expect(await isDark(page)).toBe(false);
    expect(await bodyBackground(page)).toBe(DAY_BG);
  });

  test("catch-up, question and evidence focus all work in night mode", async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Catch me up" }).click();
    const recap = page.getByTestId("recap");
    await expect(recap).toContainText("Gemini · mock-gemini");
    await recap.locator('[data-evidence-chip="F_INT_RUNS"]').click();
    const item = recap.locator('[data-evidence-item="F_INT_RUNS"]');
    await expect(item).toHaveAttribute("aria-current", "true");
    await expect(item).toBeFocused();

    await page.getByRole("button", { name: "How many extras have been conceded?" }).click();
    const answer = page.getByTestId("qa-item").first();
    await expect(answer.getByTestId("answer-status")).toHaveText("Answered from match data");
    await answer.locator('[data-evidence-chip="F_SCORE"]').click();
    await expect(answer.locator('[data-evidence-item="F_SCORE"]')).toBeFocused();
    expect(problems).toEqual([]);
  });

  for (const width of [390, 320]) {
    test(`no horizontal overflow at ${width}px in night mode, with results shown`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.getByRole("button", { name: "Catch me up" }).click();
      await expect(page.getByTestId("recap")).toContainText("mock-gemini");
      await page.getByTestId("recap").locator("[data-evidence-chip]").first().click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
