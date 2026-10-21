/**
 * R8 floors, enforced on the stylesheet itself: every interactive control has a
 * 44 px hit area, and every input renders at 16 px or more so iOS never zooms.
 *
 * This is a static check rather than a screenshot check, so it runs in CI and
 * cannot be skipped by a viewport that happens to look fine.
 */
import { describe, expect, it } from "@effect/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");

interface Rule {
  readonly selector: string;
  readonly body: string;
}

function rules(): Rule[] {
  const found: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null = pattern.exec(CSS);
  while (match !== null) {
    const selector = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    if (selector.length > 0 && !selector.startsWith("@")) found.push({ selector, body });
    match = pattern.exec(CSS);
  }
  return found;
}

function rootValue(name: string): string | null {
  const root = rules().find((rule) => rule.selector.endsWith(":root"));
  if (root === undefined) return null;
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(root.body);
  return match?.[1]?.trim() ?? null;
}

function resolvePx(value: string): number | null {
  const direct = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (direct !== null) return Number(direct[1]);
  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim());
  if (variable !== null) {
    const name = variable[1] ?? "";
    // Fall back to a document-wide lookup: the @import ahead of :root can shift
    // which rule the selector parser attributes the custom properties to.
    const resolved = rootValue(name) ?? new RegExp(`${name}:\\s*([^;]+);`).exec(CSS)?.[1]?.trim() ?? null;
    return resolved === null ? null : resolvePx(resolved);
  }
  return null;
}

function property(rule: Rule, name: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+);`).exec(rule.body);
  return match?.[1]?.trim() ?? null;
}

const INTERACTIVE = [
  ".links a",
  ".signin",
  ".cta",
  ".operator",
  ".result-action",
  ".dialog-secondary",
  ".footer a",
  ".brand-inline",
];

describe("interactive targets", () => {
  it.each(INTERACTIVE)("%s has a 44px hit area", (selector) => {
    const rule = rules().find((candidate) => candidate.selector === selector);
    expect(rule, `${selector} rule is missing`).toBeDefined();
    const height = property(rule ?? { selector, body: "" }, "min-height");
    expect(height, `${selector} has no min-height`).not.toBeNull();
    const px = height === null ? null : resolvePx(height);
    expect(px, `${selector} min-height ${String(height)} is not a px length`).not.toBeNull();
    expect(px ?? 0).toBeGreaterThanOrEqual(44);
  });
});

describe("input font sizes", () => {
  it("no input renders below 16px", () => {
    // Pseudo-elements (::placeholder) size the hint text, not the field, and do
    // not trigger the iOS zoom rule.
    const inputs = rules().filter((rule) => rule.selector.includes("input") && !rule.selector.includes("::"));
    expect(inputs.length).toBeGreaterThan(0);
    const tooSmall = inputs.flatMap((rule) => {
      const size = property(rule, "font-size");
      if (size === null) return [];
      const px = resolvePx(size);
      if (px === null) return [{ selector: rule.selector, size }];
      return px < 16 ? [{ selector: rule.selector, size }] : [];
    });
    expect(tooSmall).toEqual([]);
  });
});

describe("responsive breakpoints", () => {
  it("ships a mobile and a tablet breakpoint", () => {
    expect(CSS).toContain("@media (max-width: 768px)");
    expect(CSS).toContain("@media (max-width: 480px)");
  });
});
