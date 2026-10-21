/**
 * Level 4 (R13): the shell renders and the pages are reachable at every viewport.
 * Nothing here needs a credential, so it holds on any deployment.
 */
import { expect, test } from "@playwright/test";

test("home renders the brand and the prompt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Deep", { exact: false }).first()).toBeVisible();
  await expect(page.getByPlaceholder("Search the web")).toBeVisible();
  await expect(page.getByRole("button", { name: /search/i }).first()).toBeVisible();
});

test("the prose pages are reachable and render their headings", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();

  await page.goto("/how");
  await expect(page.getByRole("heading", { name: /How DeepSearch works/i, level: 1 })).toBeVisible();
});

test("the account page offers a way to add a key", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /Account/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /key|sign in|add/i }).first()).toBeVisible();
});

test("no page logs an error to the console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const path of ["/", "/privacy", "/how", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});

test("Home opens Privacy and How as modals, not routes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Privacy" }).click();
  const privacy = page.getByRole("dialog");
  await expect(privacy).toBeVisible();
  await expect(privacy.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await privacy.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "How DeepSearch Works" }).click();
  const how = page.getByRole("dialog");
  await expect(how.getByRole("heading", { name: "How DeepSearch Works" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("Home's Sign in opens the Get started dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add API Key" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await dialog.getByRole("button", { name: "Add API Key" }).click();
  await expect(page.getByRole("heading", { name: "API Key" })).toBeVisible();
});

test("Home keeps only Sign in in the header and puts the footer links bottom right", async ({ page }, testInfo) => {
  await page.goto("/");

  const header = page.locator("header.topbar");
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(header.getByText("About")).toHaveCount(0);
  await expect(header.getByText("Docs")).toHaveCount(0);

  const footer = page.locator("footer.footer");
  await expect(footer.getByRole("button", { name: "Privacy" })).toBeVisible();
  await expect(footer.getByRole("button", { name: "How DeepSearch Works" })).toBeVisible();

  if (testInfo.project.name === "desktop") {
    const off = await page.evaluate(() => {
      const strip = document.querySelector("footer.footer");
      const first = strip?.querySelector("button");
      if (!strip || !first) return null;
      const stripBox = strip.getBoundingClientRect();
      const firstBox = first.getBoundingClientRect();
      return {
        fromLeft: Math.round(firstBox.x - stripBox.x),
        fromRight: Math.round(stripBox.right - firstBox.x),
      };
    });
    // Right-aligned: the first link sits well into the right half of the strip.
    expect(off?.fromLeft ?? 0).toBeGreaterThan(off?.fromRight ?? Number.MAX_SAFE_INTEGER);
  }
});

test("searching never triggers a redirect or a full page load", async ({ page }) => {
  await page.route("**api.deepseek.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: [] }) }));

  // A plain ?q URL with no page param must render directly, not redirect.
  const direct = await page.request.get("/search?q=deepseek");
  expect(direct.status()).toBe(200);

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("deepsearch.credential.v1", JSON.stringify({ v: 1, kind: "apiKey", value: "sk-test" }));
  });
  await page.reload();

  const documents = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });

  await page.getByPlaceholder("Search the web").fill("deepseek");
  await page.locator(".prompt .cta").click();
  await page.waitForURL(/\/search\?/);
  await expect(page.locator(".skeleton-card").first()).toBeVisible();

  // Client-side navigation: no new document request, and the URL stays clean.
  expect(documents).toHaveLength(0);
  expect(page.url()).toContain("q=deepseek");
  expect(page.url()).not.toContain("page=");
});

test("the independence disclaimer is visible and never claims affiliation", async ({ page }) => {
  await page.goto("/");
  const disclaimer = page.locator(".footer-disclaimer");
  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText("Not affiliated with DeepSeek");

  // It is in the Privacy dialog too, where the DeepSeek name is explained.
  await page.getByRole("button", { name: "Privacy" }).first().click();
  await expect(page.locator('[role="dialog"] .disclaimer')).toContainText("not affiliated");
  await page.keyboard.press("Escape");

  // The standalone pages carry the same statement.
  await page.goto("/privacy");
  await expect(page.locator("article")).toContainText("not affiliated");
  await page.goto("/how");
  await expect(page.locator("article")).toContainText("not affiliated");
});

test("Home links to the repository in a new tab", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: /GitHub/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://github.com/try-works/deepsearch");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noreferrer/);

  // It must be a real anchor, not a button that looks like one.
  expect(await link.evaluate((node) => node.tagName)).toBe("A");
});