/**
 * R11: every network outcome maps to one tagged error, so the UI can render a
 * distinct state for each. R1: the request is browser-direct and carries the
 * credential's header, never the credential itself.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { searchWith, type SearchTransport } from "../../src/lib/deepseek";

const okBody = JSON.stringify({
  results: [
    {
      rerank_score: 2.4,
      title: "DeepSeek-R1",
      url: "https://example.com/a",
      snippet: "A short summary.",
      summary: "A longer summary.",
      content: "",
      site_name: "Example",
      site_icon: null,
      date: null,
      authority: 3,
    },
  ],
});

function transport(status: number, text: string): SearchTransport {
  return { execute: () => Promise.resolve({ status, text }) };
}

const headers = { Authorization: "Bearer sk-test" };

describe("searchWith", () => {
  it.effect("returns decoded results on success", () =>
    Effect.gen(function* () {
      const results = yield* searchWith(transport(200, okBody), { query: "r1", headers });
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("DeepSeek-R1");
    }));

  it.effect("fails with CredentialMissing when no credential is configured", () =>
    Effect.gen(function* () {
      const error = yield* searchWith(transport(200, okBody), { query: "r1", headers: null }).pipe(Effect.flip);
      expect(error._tag).toBe("CredentialMissing");
    }));

  it.effect("maps 401 to Unauthorized", () =>
    Effect.gen(function* () {
      const error = yield* searchWith(transport(401, "{}"), { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("Unauthorized");
    }));

  it.effect("maps 429 to RateLimited", () =>
    Effect.gen(function* () {
      const error = yield* searchWith(transport(429, "{}"), { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("RateLimited");
    }));

  it.effect("maps a thrown transport to Transport", () =>
    Effect.gen(function* () {
      const broken: SearchTransport = {
        execute: () => Promise.reject(new Error("offline")),
      };
      const error = yield* searchWith(broken, { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("Transport");
    }));

  it.effect("maps a 200 with an invalid body to ProtocolError", () =>
    Effect.gen(function* () {
      const error = yield* searchWith(transport(200, "not json"), { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("ProtocolError");
    }));
});
