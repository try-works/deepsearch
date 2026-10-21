/**
 * R6: the Ask surface's pure parts — the request it builds, the citations it
 * extracts, and the rule that an unsourced answer is not a result.
 */
import { describe, expect, it } from "@effect/vitest";
import { answerIsGrounded, buildAskRequest, parseCitations, sourcesFor } from "../../src/lib/ask";
import type { SearchResult } from "../../src/lib/search";

const results: readonly SearchResult[] = [
  {
    title: "DeepSeek-R1",
    url: "https://deepseek.com/r1",
    snippet: "Trained with RL.",
    summary: "A longer summary.",
    siteName: "deepseek.com",
    siteIcon: null,
    date: null,
    authority: 3,
    rerankScore: 2.4,
  },
  {
    title: "RLVR survey",
    url: "https://arxiv.org/abs/2501",
    snippet: "Verifiable rewards.",
    summary: "A longer summary.",
    siteName: "arxiv.org",
    siteIcon: null,
    date: null,
    authority: 4,
    rerankScore: 1.8,
  },
];

describe("buildAskRequest", () => {
  it("numbers the results and asks for a stream", () => {
    const request = buildAskRequest("how does r1 work", results);
    expect(request.stream).toBe(true);
    expect(request.messages).toHaveLength(2);
    // The numbered sources ride in the system message now, so the same block can
    // be reused unchanged for every follow-up turn.
    const system = request.messages[0]?.content ?? "";
    expect(system).toContain("[1] DeepSeek-R1");
    expect(system).toContain("[2] RLVR survey");
    expect(request.messages[1]?.content).toBe("how does r1 work");
  });

  it("instructs the model to cite and to refuse without sources", () => {
    const system = buildAskRequest("q", results).messages[0]?.content ?? "";
    expect(system).toContain("[1]");
    expect(system).toContain("no sources");
  });
});

describe("parseCitations", () => {
  it("extracts citation numbers in order", () => {
    expect(parseCitations("One [1], two [2].")).toEqual([1, 2]);
  });

  it("deduplicates markers and keeps reading order", () => {
    expect(parseCitations("[1] again [1] and [9]")).toEqual([1, 9]);
  });

  it("ignores bracketed text that is not a number", () => {
    expect(parseCitations("[see above] and [x]")).toEqual([]);
  });
});

describe("answerIsGrounded", () => {
  it("accepts an answer with at least one valid citation", () => {
    expect(answerIsGrounded("Claim [2].", 2)).toBe(true);
  });

  it("rejects an answer with no citation", () => {
    expect(answerIsGrounded("An unsourced claim.", 2)).toBe(false);
  });

  it("rejects an answer whose citations are all out of range", () => {
    expect(answerIsGrounded("Claim [7].", 2)).toBe(false);
  });
});

describe("sourcesFor", () => {
  it("returns only the cited results, with their citation number", () => {
    const cited = sourcesFor(results, [2]);
    expect(cited).toHaveLength(1);
    expect(cited[0]?.marker).toBe(2);
    expect(cited[0]?.result.title).toBe("RLVR survey");
  });

  it("keeps citation order rather than result order", () => {
    const cited = sourcesFor(results, [2, 1]);
    expect(cited.map((entry) => entry.marker)).toEqual([2, 1]);
  });
});
