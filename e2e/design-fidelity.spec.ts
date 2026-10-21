/**
 * Design fidelity, measured. The Paper artboards put the results content on a
 * 236px rail (32 padding + 180 brand + 24 gap), an 820px query field inline in
 * the header, and an 820px results column with 1px bordered cards.
 *
 * The stylesheet cannot express those relationships, so this measures the
 * rendered page and fails when the desktop grid drifts back to a full-bleed
 * mobile stack — which is exactly what shipped once.
 */
import { expect, test } from "@playwright/test";

const CREDENTIAL = { v: 1, kind: "apiKey", value: "sk-test" };

const FIXTURE = JSON.stringify({
  results: [
    {
      rerank_score: 2.4,
      title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs",
      url: "https://api-docs.deepseek.com/news/news250120",
      snippet: "DeepSeek-R1 is trained with large-scale reinforcement learning for multi-step reasoning.",
      summary: "",
      content: "",
      site_name: "DeepSeek API Docs",
      site_icon: null,
      date: "2025-01-20T00:00:00+00:00",
      authority: 3,
    },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.route("**api.deepseek.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: FIXTURE }),
  );
  await page.goto("/");
  await page.evaluate((credential) => {
    localStorage.setItem("deepsearch.credential.v1", JSON.stringify(credential));
  }, CREDENTIAL);
});

test("desktop results use the 236px rail and the 820px column", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the grid only applies at desktop width");

  await page.goto("/search?q=deepseek");
  await expect(page.locator(".result").first()).toBeVisible();
  const grid = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    };
    return {
      brand: box(".results-header .brand-inline"),
      prompt: box(".results-header .prompt"),
      card: box(".result"),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  expect(grid.brand, "brand block").toEqual({ x: 32, width: 180 });
  expect(grid.prompt, "query field starts on the rail").toEqual({ x: 236, width: 820 });
  expect(grid.card, "results column matches the query field").toEqual({ x: 236, width: 820 });
  expect(grid.overflow, "desktop must not scroll sideways").toBe(false);
});

test("the header puts brand, query and account on one row at desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the single-row header is desktop-only");

  await page.goto("/search?q=deepseek");
  await expect(page.locator(".result").first()).toBeVisible();
  const rows = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { y: Math.round(rect.y), x: Math.round(rect.x) };
    };
    return { brand: box(".results-header .brand-inline"), prompt: box(".results-header .prompt"), account: box(".results-header .signin") };
  });

  expect(rows.brand).not.toBeNull();
  expect(rows.prompt).not.toBeNull();
  expect(rows.account).not.toBeNull();
  // Same row: the vertical centres differ by less than half a control height.
  expect(Math.abs((rows.brand?.y ?? 0) - (rows.prompt?.y ?? 0))).toBeLessThan(40);
  expect(Math.abs((rows.account?.y ?? 0) - (rows.prompt?.y ?? 0))).toBeLessThan(40);
  // Account sits right of the query field.
  expect(rows.account?.x ?? 0).toBeGreaterThan((rows.prompt?.x ?? 0) + 820);
});

test("tablet and mobile collapse to full width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "the collapsed layout is for narrow viewports");

  await page.goto("/search?q=deepseek");
  await expect(page.locator(".result").first()).toBeVisible();
  const grid = await page.evaluate(() => {
    const element = document.querySelector(".result");
    const rect = element?.getBoundingClientRect();
    return { x: Math.round(rect?.x ?? -1), width: Math.round(rect?.width ?? -1), viewport: window.innerWidth };
  });
  expect(grid.x).toBeLessThanOrEqual(24);
  expect(grid.width).toBeGreaterThan(grid.viewport * 0.85);
});

test("Account opens as a 440px dialog over Results", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "modal geometry is checked at desktop");

  await page.goto("/search?q=deepseek");
  await page.getByRole("button", { name: "Account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Account" })).toBeVisible();

  const width = await dialog.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  expect(width).toBe(440);
  expect(await page.evaluate(() => window.location.pathname)).toBe("/search");
  await expect(dialog.getByText("WRITE-ONLY IF ADDED")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the operators strip is one row at desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "strip layout is desktop-only");

  await page.goto("/search?q=deepseek");
  const rows = await page.evaluate(() => {
    const y = (selector: string) => {
      const element = document.querySelector(selector);
      return element === null ? null : Math.round(element.getBoundingClientRect().y);
    };
    return { label: y(".operators .mono-label"), chip: y(".operators .operator"), hint: y(".operators-hint") };
  });
  expect(rows.label).not.toBeNull();
  expect(Math.abs((rows.label ?? 0) - (rows.chip ?? 0))).toBeLessThan(12);
  expect(Math.abs((rows.label ?? 0) - (rows.hint ?? 0))).toBeLessThan(12);
});

test("Home matches the artboard's measured type and geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop artboard measurements");

  await page.goto("/");
  const home = await page.evaluate(() => {
    const probe = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { width: Math.round(box.width), size: style.fontSize, lineHeight: style.lineHeight, justify: style.justifyContent };
    };
    return {
      wordmark: probe(".wordmark"),
      value: probe(".value-prop"),
      prompt: probe(".prompt"),
      topbar: probe(".topbar"),
      footer: probe(".footer"),
      loaded: document.fonts.check('40px "Geist"'),
    };
  });

  expect(home.loaded, "Geist must be loaded, not a fallback").toBe(true);
  expect(home.wordmark).toMatchObject({ size: "40px", lineHeight: "48px" });
  expect(home.value).toMatchObject({ width: 420, size: "17px", lineHeight: "28px" });
  expect(home.prompt?.width).toBe(584);
  expect(home.topbar?.justify).toBe("flex-end");
  expect(home.footer?.width).toBeGreaterThan(1300);
});

test("More reveals the overflow operators and the chips match the spec", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "chip geometry is the desktop spec");

  await page.goto("/search?q=deepseek");
  const read = () =>
    page.evaluate(() => {
      const chips = [...document.querySelectorAll(".operators .chip-row .operator")];
      const first = chips.find((chip) => chip.textContent?.trim() === "site:");
      const style = first ? getComputedStyle(first) : null;
      return {
        labels: chips.map((chip) => chip.textContent?.trim()),
        height: first ? Math.round(first.getBoundingClientRect().height) : 0,
        background: style?.backgroundColor ?? "",
        border: style?.borderTopWidth ?? "",
        font: style?.fontFamily.split(",")[0] ?? "",
        size: style?.fontSize ?? "",
      };
    });

  const collapsed = await read();
  expect(collapsed.labels).not.toContain('"');
  expect(collapsed.height).toBe(34);
  expect(collapsed.background).toBe("rgb(255, 255, 255)");
  expect(collapsed.border).toBe("1px");
  expect(collapsed.font).toBe('"Geist Mono"');
  expect(collapsed.size).toBe("13px");

  await page.getByRole("button", { name: "More" }).click();
  const expanded = await read();
  expect(expanded.labels).toEqual(expect.arrayContaining(['"', "-", '-"', "Less"]));
  await page.getByRole("button", { name: "Less" }).click();
  const collapsedAgain = await read();
  expect(collapsedAgain.labels).not.toContain('"');
});

test("the brand sits in the left corner on every screen", async ({ page }) => {
  for (const route of ["/search?q=deepseek", "/ask?q=deepseek", "/account", "/privacy", "/how"]) {
    await page.goto(route);
    const placement = await page.evaluate(() => {
      const brand = document.querySelector(".brand-inline");
      if (brand === null) return null;
      const box = brand.getBoundingClientRect();
      return { left: Math.round(box.x), width: window.innerWidth };
    });
    expect(placement, `${route} must show the brand`).not.toBeNull();
    expect(placement?.left ?? 9999, `${route} brand is not in the left corner`).toBeLessThan((placement?.width ?? 0) / 4);
  }
});

test("Ask keeps a thread: follow-ups carry the earlier turns and sources are links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is enough for the contract");

  const searches: string[] = [];
  const chats: { messages: { role: string; content: string }[] }[] = [];
  const fixture = JSON.stringify({
    results: [
      { rerank_score: 2.4, title: "A", url: "https://a.example/1", snippet: "s", summary: "", content: "", site_name: "a.example", site_icon: null, date: null, authority: 3 },
      { rerank_score: 1.8, title: "B", url: "https://b.example/2", snippet: "s", summary: "", content: "", site_name: "b.example", site_icon: null, date: null, authority: 4 },
    ],
  });
  const sse = (text: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;

  await page.route("**api.deepseek.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/chat/completions")) {
      chats.push(JSON.parse(route.request().postData() ?? "{}"));
      const text = chats.length === 1 ? "First answer [1]." : "Second answer [2].";
      return route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: sse(text) });
    }
    searches.push(url);
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: fixture });
  });

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("deepsearch.credential.v1", JSON.stringify({ v: 1, kind: "apiKey", value: "sk-test" }));
  });
  await page.goto("/ask?q=deepseek");
  await expect(page.locator(".answer-text")).toHaveCount(1);

  // Source chips are real links that open in a new tab.
  const chip = page.locator(".source-chip").first();
  await expect(chip).toHaveAttribute("target", "_blank");
  await expect(chip).toHaveAttribute("rel", /noreferrer/);

  await page.getByPlaceholder("Ask a follow-up…").fill("and the second source?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".answer-text")).toHaveCount(2);

  // The follow-up carried the earlier exchange, and no second search ran.
  expect(chats).toHaveLength(2);
  expect(chats[1]?.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
  expect(chats[1]?.messages[0]?.content).toContain("[2] B");
  expect(searches).toHaveLength(1);
});

test("an ungrounded follow-up answer stays visible with a warning", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is enough for the contract");

  const fixture = JSON.stringify({
    results: [
      { rerank_score: 2.4, title: "A", url: "https://a.example/1", snippet: "s", summary: "", content: "", site_name: "a.example", site_icon: null, date: null, authority: 3 },
    ],
  });
  const sse = (text: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  let chats = 0;

  await page.route("**api.deepseek.com/**", async (route) => {
    if (route.request().url().includes("/chat/completions")) {
      chats += 1;
      const text = chats === 1 ? "Grounded answer [1]." : "An answer that cites nothing at all.";
      return route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "access-control-allow-origin": "*" }, body: sse(text) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: fixture });
  });

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("deepsearch.credential.v1", JSON.stringify({ v: 1, kind: "apiKey", value: "sk-test" }));
  });
  await page.goto("/ask?q=deepseek");
  await expect(page.locator(".answer-text")).toHaveCount(1);

  await page.getByPlaceholder("Ask a follow-up…").fill("and deepinfer?");
  await page.getByRole("button", { name: "Send" }).click();

  // The second turn is kept and flagged; it is not discarded as an error.
  await expect(page.locator(".answer-text")).toHaveCount(2);
  await expect(page.locator(".answer-warning")).toHaveCount(1);
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator(".answer-question-text").nth(1)).toHaveText("and deepinfer?");
});

test("Results shows the spec'd loading state, never an error flash", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is enough for the contract");

  const fixture = JSON.stringify({
    results: [
      { rerank_score: 2.4, title: "A", url: "https://a.example/1", snippet: "s", summary: "", content: "", site_name: "a.example", site_icon: null, date: null, authority: 3 },
    ],
  });
  await page.route("**api.deepseek.com/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: fixture });
  });

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("deepsearch.credential.v1", JSON.stringify({ v: 1, kind: "apiKey", value: "sk-test" }));
  });
  await page.goto("/search?q=deepseek");

  // Five skeletons, the searching meta line, and no empty/error state while loading.
  await expect(page.locator(".skeleton-card")).toHaveCount(5);
  await expect(page.locator(".meta-line")).toContainText("SEARCHING");
  await expect(page.locator(".empty-state")).toHaveCount(0);
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator(".results-header .cta")).toHaveText(/Searching/);

  await expect(page.locator(".result:not(.skeleton-card)")).toHaveCount(1);

  // A bare /search has no query to run, and must not look like a failure.
  await page.goto("/search");
  await expect(page.locator(".empty-state")).toHaveCount(0);
  await expect(page.locator(".error-state")).toHaveCount(0);
});