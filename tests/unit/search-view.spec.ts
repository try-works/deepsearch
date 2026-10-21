/**
 * The pure parts of the Results screen: the meta line, date rendering, and the
 * copy for each tagged error. Keeping these out of the component is what makes
 * R4 and R11 testable without a DOM.
 */
import { describe, expect, it } from "@effect/vitest";
import { errorCopy, formatDate, loadingMeta, metaLine } from "../../src/lib/search-view";
import { clampPage, PAGE_SIZE, pageCount, pageSlice, rangeLabel } from "../../src/lib/pagination";

describe("metaLine", () => {
  it("reports the range, the page, the endpoint and the request shape", () => {
    expect(metaLine(50, 1)).toBe("SHOWING 1–25 · PAGE 1/2 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE");
  });

  it("reports the last page's range", () => {
    expect(metaLine(50, 2)).toBe("SHOWING 26–50 · PAGE 2/2 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE");
  });

  it("reports an empty batch without inventing a page count", () => {
    expect(metaLine(0, 1)).toBe("SHOWING 0 · PAGE 1/1 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE");
  });

  it("clamps a page past the end", () => {
    expect(metaLine(12, 9)).toBe("SHOWING 1–12 · PAGE 1/1 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE");
  });
});

describe("pagination", () => {
  it("pages 25 at a time over the returned batch", () => {
    expect(PAGE_SIZE).toBe(25);
    expect(pageCount(50)).toBe(2);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(0)).toBe(1);
  });

  it("slices the requested page", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    expect(pageSlice(items, 1)).toHaveLength(25);
    expect(pageSlice(items, 1)[0]).toBe(0);
    expect(pageSlice(items, 2)[0]).toBe(25);
    expect(pageSlice(items, 9)).toHaveLength(25);
  });

  it("clamps and labels ranges", () => {
    expect(clampPage(50, 2)).toBe(2);
    expect(clampPage(50, 7)).toBe(2);
    expect(clampPage(50, 0)).toBe(1);
    expect(rangeLabel(50, 1)).toBe("1–25");
    expect(rangeLabel(50, 2)).toBe("26–50");
    expect(rangeLabel(0, 1)).toBe("0–0");
  });
});

describe("formatDate", () => {
  it("formats an RFC 3339 timestamp as a human date", () => {
    expect(formatDate("2025-01-20T00:00:00+00:00")).toBe("20 Jan 2025");
  });

  it("says so when the date is unknown", () => {
    expect(formatDate(null)).toBe("date unknown");
  });
});

describe("errorCopy", () => {
  it("tells the reader to add a key when none is configured", () => {
    expect(errorCopy("CredentialMissing")).toContain("Add a DeepSeek API key");
  });

  it("tells the reader to check the credential when it was rejected", () => {
    expect(errorCopy("Unauthorized")).toContain("rejected");
  });
});

describe("loadingMeta", () => {
  it("announces the in-flight request without inventing a result count", () => {
    expect(loadingMeta()).toBe("SEARCHING · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE");
  });
});