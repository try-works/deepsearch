/**
 * R5: operators are query text. Insertion must produce a valid query and the
 * validator must enforce the API's 1–128 character bound.
 */
import { describe, expect, it } from "@effect/vitest";
import { insertOperator, QUERY_MAX_LENGTH, validateQuery } from "../../src/lib/operators";

describe("validateQuery", () => {
  it("rejects an empty query", () => {
    expect(validateQuery("")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a whitespace-only query", () => {
    expect(validateQuery("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts a query at the length limit", () => {
    expect(validateQuery("a".repeat(QUERY_MAX_LENGTH))).toEqual({ ok: true });
  });

  it("rejects a query over the length limit", () => {
    expect(validateQuery("a".repeat(QUERY_MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("insertOperator", () => {
  it("inserts into an empty query without a leading space", () => {
    expect(insertOperator("", "site:")).toBe("site:");
  });

  it("separates the operator from existing text with one space", () => {
    expect(insertOperator("deepseek r1", "site:")).toBe("deepseek r1 site:");
  });

  it("does not double the space when the query already ends in one", () => {
    expect(insertOperator("deepseek r1 ", "site:")).toBe("deepseek r1 site:");
  });

  it("refuses to append an operator the query already starts with", () => {
    expect(insertOperator("site:", "site:")).toBe("site:");
  });

  it("allows a different operator to be appended", () => {
    expect(insertOperator("site:deepseek.com", "-site:old.example")).toBe("site:deepseek.com -site:old.example");
  });
});
