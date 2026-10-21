/**
 * The follow-up thread: the API is stateless, so these tests pin what actually
 * travels in `messages` — the fixed source block plus the prior turns.
 */
import { describe, expect, it } from "@effect/vitest";
import {
  answerIsGrounded,
  buildAskRequest,
  buildThreadRequest,
  draftTurn,
  groundedTurns,
  MAX_CONTEXT_TURNS,
  trimTurns,
  type Turn,
} from "../../src/lib/ask";
import type { SearchResult } from "../../src/lib/search";

function result(index: number): SearchResult {
  return {
    title: `Source ${String(index)}`,
    url: `https://example.com/${String(index)}`,
    snippet: "A snippet.",
    summary: "A summary.",
    siteName: "example.com",
    siteIcon: null,
    date: null,
    authority: 3,
    rerankScore: 1.5,
  };
}

const SOURCES: readonly SearchResult[] = [result(1), result(2), result(3)];

describe("buildThreadRequest", () => {
  it("sends the question with the numbered sources when there is no history", () => {
    const { request } = buildThreadRequest(SOURCES, [], "what is x");
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages[0]?.content).toContain("[1] Source 1");
    expect(request.messages[1]).toEqual({ role: "user", content: "what is x" });
  });

  it("carries the prior exchange as user/assistant turns", () => {
    const history: readonly Turn[] = [{ question: "what is x", answer: "X is a thing [1]." }];
    const { request } = buildThreadRequest(SOURCES, history, "is it certain?");
    expect(request.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(request.messages[1]?.content).toBe("what is x");
    expect(request.messages[2]?.content).toBe("X is a thing [1].");
    expect(request.messages[3]?.content).toBe("is it certain?");
  });

  it("keeps the source block byte-identical between turns so [n] cannot shift", () => {
    const first = buildThreadRequest(SOURCES, [], "q1").request.messages[0]?.content;
    const second = buildThreadRequest(SOURCES, [{ question: "q1", answer: "a1" }], "q2").request.messages[0]
      ?.content;
    expect(second).toBe(first);
  });

  it("drops the oldest turns first and reports how many", () => {
    const history: Turn[] = Array.from({ length: MAX_CONTEXT_TURNS + 2 }, (_, index) => ({
      question: `q${String(index + 1)}`,
      answer: `a${String(index + 1)}`,
    }));
    const { request, dropped } = buildThreadRequest(SOURCES, history, "latest");
    expect(dropped).toBe(2);
    const questions = request.messages.filter((message) => message.role === "user").map((message) => message.content);
    expect(questions[0]).toBe(`q3`);
    expect(questions).not.toContain("q1");
    expect(questions[questions.length - 1]).toBe("latest");
    expect(request.messages[0]?.content).toContain("[3] Source 3");
  });

  it("still asks the first question through buildAskRequest", () => {
    const request = buildAskRequest("only question", SOURCES);
    expect(request.messages).toHaveLength(2);
    expect(request.stream).toBe(true);
  });
});

describe("trimTurns", () => {
  it("keeps everything inside the window", () => {
    const turns: Turn[] = [{ question: "q", answer: "a" }];
    expect(trimTurns(turns)).toEqual({ kept: turns, dropped: 0 });
  });
});

describe("grounding per turn", () => {
  it("rejects an answer whose citation points past the fixed source block", () => {
    expect(answerIsGrounded("Claim [3].", SOURCES.length)).toBe(true);
    expect(answerIsGrounded("Claim [4].", SOURCES.length)).toBe(false);
  });
});

describe("draftTurn", () => {
  it("keeps an answer that cites nothing, flagged as ungrounded", () => {
    const drafted = draftTurn("why?", "A claim with no marker.", 3);
    expect(drafted.answer).toBe("A claim with no marker.");
    expect(drafted.grounded).toBe(false);
  });

  it("accepts an answer citing any source inside the block", () => {
    expect(draftTurn("why?", "Claim [2].", 3).grounded).toBe(true);
  });

  it("flags a citation beyond the block rather than trusting it", () => {
    expect(draftTurn("why?", "Claim [9].", 3).grounded).toBe(false);
  });
});

describe("system prompt", () => {
  it("states the exact source count so citations cannot drift out of range", () => {
    const system = buildThreadRequest(SOURCES, [], "q").request.messages[0]?.content ?? "";
    expect(system).toContain("exactly 3 sources");
    expect(system).toContain("never cite a number outside that range");
  });
});

describe("groundedTurns", () => {
  it("keeps only answers that cited a source, so an unsupported reply cannot seed later turns", () => {
    const turns = [
      draftTurn("q1", "supported [1]", 3),
      draftTurn("q2", "no marker at all", 3),
      draftTurn("q3", "also supported [2]", 3),
    ];
    expect(groundedTurns(turns).map((turn) => turn.question)).toEqual(["q1", "q3"]);
  });
});