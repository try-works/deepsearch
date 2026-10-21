/**
 * Level 4 (R13): the credential rule, observed from the browser.
 *
 * An unauthenticated search must fail closed — no request to the DeepSeek API at
 * all — and offer a way to add a key. This is the behaviour the whole custody
 * rule exists for, so it is checked where it happens rather than only in a unit.
 */
import { expect, test } from "@playwright/test";

test("an unauthenticated search never reaches the API and offers a key", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**://api.deepseek.com/**", (route) => {
    calls.push(route.request().url());
    void route.abort();
  });

  await page.goto("/search?q=deepseek");
  await expect(page.getByRole("alert").or(page.getByText(/API key/i)).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Add API key/i })).toBeVisible();

  expect(calls, "a request escaped without a credential").toEqual([]);
});

test("the key dialog opens with a masked input", async ({ page }) => {
  await page.goto("/search?q=deepseek");
  await page.getByRole("button", { name: /Add API key/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.locator("input").first();
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("type", "password");
});
