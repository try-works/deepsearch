/**
 * Level 4 (R13): the rendered layout. This is the check the stylesheet test could
 * not make — it measures the actual document at 390, 768 and 1440, so a floor
 * that is declared but not rendered fails here.
 */
import { expect, test } from "@playwright/test";

const PATHS = ["/", "/how", "/privacy", "/account", "/search?q=deepseek"];

for (const path of PATHS) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(overflow.innerWidth + 1);
  });
}

test("every interactive control meets the 44px floor on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the floor matters for touch viewports");

  for (const path of ["/", "/account", "/search?q=deepseek"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const short = await page.evaluate(() => {
      const measured: { label: string; height: number }[] = [];
      const nodes = document.querySelectorAll("a, button, input");
      for (const node of nodes) {
        const element = node as HTMLElement;
        // WCAG 2.5.8 exempts links inline in a sentence; those are text, not controls.
        if (element.tagName === "A" && element.closest("p") !== null) continue;
        const style = window.getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.height < 44) measured.push({ label: element.textContent?.trim().slice(0, 30) ?? element.tagName, height: Math.round(rect.height) });
      }
      return measured;
    });
    expect(short, `${path} has controls under 44px`).toEqual([]);
  }
});

test("the mobile footer stays compact without shrinking tap targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = page.locator(".footer");
  const height = await footer.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  // 117px before: two-row disclaimer plus generous padding.
  expect(height).toBeLessThanOrEqual(90);

  const targets = await page
    .locator(".footer-link, .footer a")
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
  expect(Math.min(...targets)).toBeGreaterThanOrEqual(44);

  // The claim is still there, just without the second sentence on phones.
  await expect(page.locator(".footer-disclaimer")).toContainText("Not affiliated with DeepSeek");
});