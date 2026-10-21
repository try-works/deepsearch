/**
 * R13 level 2: the decoders against recorded wire payloads.
 *
 * These fixtures are the shapes the live APIs actually returned (captured
 * 2026-10-19). Nothing here touches the network, so a schema change upstream is
 * caught by a deliberate fixture update rather than by a production failure.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchWith, type SearchTransport } from "../../src/lib/deepseek";
import { decodeSearchResults } from "../../src/lib/search";
import { oauthClient, type OAuthTransport } from "../../src/server/oauth-client";

function fixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

const headers = { Authorization: "Bearer sk-test" };

function transportWith(status: number, body: string): SearchTransport {
  return { execute: () => Promise.resolve({ status, text: body }) };
}

const OAUTH_CONFIG = {
  platformOrigin: "https://platform.deepseek.com",
  clientVersion: "0.1.0",
  locale: "en_US",
  timezoneOffset: "0",
};

function oauthTransportWith(body: string): OAuthTransport {
  return { post: () => Promise.resolve({ status: 200, text: body }) };
}

describe("Search API contract", () => {
  it.effect("decodes a recorded success envelope, keeping unknown metadata as data", () =>
    Effect.gen(function* () {
      const results = yield* decodeSearchResults(fixture("deepseek/search-ok.json"));
      expect(results).toHaveLength(3);
      expect(results[0]?.title).toContain("DeepSeek-R1");
      expect(results[0]?.authority).toBe(3);
      expect(results[1]?.date).toBeNull();
      expect(results[1]?.siteIcon).toBeNull();
      expect(results[2]?.authority).toBe(-1);
      expect(results[2]?.siteName).toBeNull();
    }));

  it.effect("decodes an empty result set without inventing anything", () =>
    Effect.gen(function* () {
      const results = yield* decodeSearchResults(fixture("deepseek/search-empty.json"));
      expect(results).toEqual([]);
    }));

  it.effect("maps the recorded missing-key 401 to Unauthorized", () =>
    Effect.gen(function* () {
      const body = fixture("deepseek/error-401-missing-key.json");
      const error = yield* searchWith(transportWith(401, body), { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("Unauthorized");
    }));

  it.effect("maps the recorded invalid-account-token 401 to Unauthorized", () =>
    Effect.gen(function* () {
      const body = fixture("deepseek/error-401-invalid-dsh-token.json");
      const error = yield* searchWith(transportWith(401, body), { query: "r1", headers }).pipe(Effect.flip);
      expect(error._tag).toBe("Unauthorized");
    }));
});

describe("dsh envelope contract", () => {
  it.effect("decodes a recorded auth_init success", () =>
    Effect.gen(function* () {
      const client = oauthClient(oauthTransportWith(fixture("platform/auth-init-ok.json")), OAUTH_CONFIG);
      const started = yield* client.init({ challenge: "c", state: "s", redirectUri: "http://127.0.0.1:18765/oauth/callback" });
      expect(started.authorizeId).toBe("klLOOHvErbpGc1ug7Kbuje8JaVN5HamfyVi92S0Idn0");
      expect(started.expiresIn).toBe(600);
    }));

  it.effect("maps the recorded 50005 to OAuthRejected carrying the code", () =>
    Effect.gen(function* () {
      const client = oauthClient(
        oauthTransportWith(fixture("platform/auth-init-hosted-origin-rejected.json")),
        OAUTH_CONFIG,
      );
      const error = yield* client
        .init({ challenge: "c", state: "s", redirectUri: "https://deepsearch.ing/oauth/callback" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("OAuthRejected");
      expect(error.message).toContain("50005");
    }));
});
