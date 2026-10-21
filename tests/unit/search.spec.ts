/**
 * R1/R4: the search request body is fixed by the API contract, and a response
 * is decoded through Schema before anything reads it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { decodeSearchResults, searchBody } from "../../src/lib/search";

const valid = {
  results: [
    {
      rerank_score: 2.4,
      title: "DeepSeek-R1",
      url: "https://example.com/a",
      snippet: "A short summary.",
      summary: "A longer summary.",
      content: "",
      site_name: "Example",
      site_icon: "https://example.com/favicon.ico",
      date: "2025-01-20T00:00:00+00:00",
      authority: 3,
    },
  ],
};

const nullish = {
  results: [
    {
      rerank_score: 0,
      title: "Unknown page",
      url: "https://example.com/b",
      snippet: "No metadata.",
      summary: "",
      content: "",
      site_name: null,
      site_icon: null,
      date: null,
      authority: -1,
    },
  ],
};

describe("searchBody", () => {
  it("always asks for 50 results and keeps content off", () => {
    expect(searchBody("deepseek r1")).toEqual({ query: "deepseek r1", count: 50, need_content: false });
  });

  it("passes operators through as query text", () => {
    expect(searchBody("site:deepseek.com r1").query).toBe("site:deepseek.com r1");
  });

  it("trims the query", () => {
    expect(searchBody("  r1  ").query).toBe("r1");
  });
});

describe("decodeSearchResults", () => {
  it.effect("decodes a full result", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeSearchResults(JSON.stringify(valid));
      expect(decoded).toHaveLength(1);
      expect(decoded[0]?.authority).toBe(3);
      expect(decoded[0]?.title).toBe("DeepSeek-R1");
    }));

  it.effect("keeps unknown authority and null date as data, not errors", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeSearchResults(JSON.stringify(nullish));
      expect(decoded[0]?.authority).toBe(-1);
      expect(decoded[0]?.date).toBeNull();
      expect(decoded[0]?.siteName).toBeNull();
    }));

  it.effect("fails closed on a missing title", () =>
    Effect.gen(function* () {
      const broken = { results: [{ ...valid.results[0], title: undefined }] };
      const error = yield* decodeSearchResults(JSON.stringify(broken)).pipe(Effect.flip);
      expect(error._tag).toBe("ProtocolError");
    }));
});
